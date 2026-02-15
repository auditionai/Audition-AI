
import { CreditPackage, Transaction, UserProfile, CheckinConfig, DiamondLog, TransactionStatus, PromotionCampaign, Giftcode, HistoryItem } from '../types';
import { supabase } from './supabaseClient';

// --- LOCAL STORAGE HELPERS (Fallback) ---
const getStorage = (key: string) => JSON.parse(localStorage.getItem(key) || 'null');
const setStorage = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

// --- HELPER: CHECK UUID ---
const isValidUUID = (id: string) => {
    if (!id || id.startsWith('temp_')) return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(id);
};

// --- HELPER: DATE FORMATTING (LOCAL TIME YYYY-MM-DD) ---
const getLocalDateStr = (date = new Date()) => {
    // Sử dụng sv-SE để có format YYYY-MM-DD mà vẫn giữ local time
    return date.toLocaleDateString('sv-SE');
};

const getMonthRange = (date = new Date()) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0); // Last day of current month
    return {
        start: getLocalDateStr(start),
        end: getLocalDateStr(end)
    };
};

// --- MOCK DATA (Fallback) ---
const MOCK_USER: UserProfile = {
  id: 'u_local_001',
  username: 'Guest Dancer',
  email: 'guest@audition.ai',
  avatar: 'https://picsum.photos/100/100',
  balance: 10,
  role: 'user', 
  isVip: false,
  streak: 0,
  lastCheckin: null,
  checkinHistory: [],
  usedGiftcodes: []
};

const DEFAULT_PACKAGES: CreditPackage[] = [
  { id: 'pkg_1', name: "Gói Khởi Động", coin: 10, price: 10000, currency: 'VND', bonusText: "Mới", bonusPercent: 0, colorTheme: "border-slate-600", transferContent: "NAP 10K" },
];

// --- VISIT TRACKING SERVICE ---

export const logVisit = async () => {
    if (supabase) {
        try {
            // Simply insert a timestamp row. 
            // This counts every reload/entry as a visit.
            await supabase.from('app_visits').insert({});
        } catch (e) {
            console.warn("Error logging visit", e);
        }
    }
};

// --- SYSTEM CONFIG (API KEY) SERVICES ---

export const getSystemApiKey = async (): Promise<string | null> => {
    if (supabase) {
        try {
            // 1. Try fetching from 'api_keys' table
            const { data, error } = await supabase
                .from('api_keys')
                .select('key_value')
                .eq('status', 'active') // Only get active keys for system use
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (!error && data && data.length > 0 && data[0].key_value) {
                return data[0].key_value.trim();
            }

            // 2. Fallback to 'system_settings' (Legacy support)
            const { data: setting } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'gemini_api_key')
                .maybeSingle();
            
            if (setting) {
                const val = typeof setting.value === 'object' ? setting.value.key : setting.value;
                return val ? val.trim() : null;
            }
        } catch (e) {
            console.warn("Could not fetch API Key from DB", e);
        }
    }
    // 3. Fallback to Env Var
    const metaEnv = (import.meta as any).env || {};
    return metaEnv.VITE_GEMINI_API_KEY || process.env.API_KEY || null;
};

export const getApiKeysList = async (): Promise<any[]> => {
    if (supabase) {
        const { data, error } = await supabase
            .from('api_keys')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (!error && data) {
            return data;
        }
    }
    return [];
};

export const saveSystemApiKey = async (apiKey: string): Promise<{ success: boolean, error?: string }> => {
    if (supabase) {
        try {
            const cleanKey = apiKey.trim();
            
            // Step 1: Deactivate all other keys first (Optional strategy: Single Active Key)
            const { error: updateError } = await supabase
                .from('api_keys')
                .update({ status: 'inactive' })
                .neq('key_value', cleanKey); // Update all others
            
            // If update fails due to permissions, we catch it early
            if (updateError) throw updateError;

            // Step 2: Check existing
            const { data: existing, error: selectError } = await supabase
                .from('api_keys')
                .select('id')
                .eq('key_value', cleanKey)
                .maybeSingle(); // Use maybeSingle to avoid error on 0 rows

            if (selectError) throw selectError;

            if (existing) {
                // Update Existing
                const { error: upsertError } = await supabase
                    .from('api_keys')
                    .update({ status: 'active', updated_at: new Date().toISOString() })
                    .eq('id', existing.id);
                
                if (upsertError) throw upsertError;
            } else {
                // Step 3: Insert New
                const { error: insertError } = await supabase
                    .from('api_keys')
                    .insert({
                        name: 'Admin Key ' + new Date().toLocaleDateString(),
                        key_value: cleanKey,
                        status: 'active',
                        usage_count: 0
                    });
                
                // CRITICAL: Throw error if insert fails so UI knows it
                if (insertError) throw insertError;
            }
            
            // Also update system_settings for backward compatibility
            // We do not throw here if this fails, as api_keys is the primary source now
            await supabase
                .from('system_settings')
                .upsert({ key: 'gemini_api_key', value: cleanKey }, { onConflict: 'key' });

            return { success: true };
        } catch (e: any) {
            console.error("Error saving API Key", e);
            return { success: false, error: e.message || "Database Error" };
        }
    }
    return { success: false, error: "Supabase not connected" };
};

export const deleteApiKey = async (id: string): Promise<boolean> => {
    if (supabase) {
        const { error } = await supabase.from('api_keys').delete().eq('id', id);
        return !error;
    }
    return false;
};

// --- USER SERVICES (UPDATED WITH SELF-HEALING) ---

export const getUserProfile = async (): Promise<UserProfile> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            try {
                // Define fetch function for reuse
                const fetchProfile = async () => await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                let { data: profile, error } = await fetchProfile();

                // RETRY LOGIC: If profile not found, wait 500ms and try again (Wait for Trigger)
                if (!profile) {
                    await new Promise(r => setTimeout(r, 500));
                    const retry = await fetchProfile();
                    profile = retry.data;
                }

                // SELF-HEALING: If still missing, create it manually (Google Login Fallback)
                if (!profile) {
                    console.warn("Profile missing after retry. Executing Self-Healing for Google Login...");
                    const metadata = user.user_metadata || {};
                    
                    const newProfile = {
                        id: user.id,
                        email: user.email,
                        display_name: metadata.full_name || metadata.name || user.email?.split('@')[0],
                        photo_url: metadata.avatar_url || metadata.picture, // Google typically uses 'avatar_url' or 'picture'
                        diamonds: 0,
                        is_admin: false,
                        consecutive_check_ins: 0,
                        created_at: new Date().toISOString()
                    };
                    
                    const { error: insertError } = await supabase.from('users').insert(newProfile);
                    
                    if (!insertError || insertError.code === '23505') {
                         // Return valid profile immediately
                         return { 
                            id: user.id,
                            username: newProfile.display_name,
                            email: newProfile.email || '',
                            avatar: newProfile.photo_url || MOCK_USER.avatar,
                            balance: 0,
                            role: 'user',
                            isVip: false,
                            streak: 0,
                            lastCheckin: null,
                            checkinHistory: [],
                            usedGiftcodes: []
                        };
                    } else {
                        console.error("Self-Healing Failed:", insertError);
                    }
                }

                if (profile) {
                    return {
                        id: user.id,
                        username: profile.display_name || user.email?.split('@')[0] || 'Dancer',
                        email: profile.email || user.email || '',
                        avatar: profile.photo_url || user.user_metadata.avatar_url || MOCK_USER.avatar,
                        balance: profile.diamonds || 0,
                        role: profile.is_admin ? 'admin' : 'user',
                        isVip: false,
                        streak: profile.consecutive_check_ins || 0,
                        lastCheckin: profile.last_check_in,
                        checkinHistory: [], 
                        usedGiftcodes: []
                    };
                }
            } catch (e) {
                console.error("Critical User Fetch Error:", e);
            }
        }
    }

    let localUser = getStorage('dmp_user');
    if (!localUser) {
        localUser = MOCK_USER;
        setStorage('dmp_user', localUser);
    }
    return localUser;
};

export const updateUserBalance = async (amount: number, reason: string, type: 'topup' | 'usage' | 'reward' | 'refund' | 'admin_adjustment' | 'giftcode' | 'milestone_reward'): Promise<UserProfile> => {
    const user = await getUserProfile();
    const newBalance = (user.balance || 0) + amount;

    if (supabase && user.id.length > 20) { 
        // Update 'diamonds' column in 'users'
        const { error } = await supabase.from('users').update({ diamonds: newBalance }).eq('id', user.id);
        
        if (!error) {
             // Log transaction in 'diamond_transactions_log'
            await supabase.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount, // Negative for usage, positive for reward
                description: reason, 
                transaction_type: type || 'usage',
                created_at: new Date().toISOString()
            });
            return { ...user, balance: newBalance };
        }
    }

    user.balance = newBalance;
    setStorage('dmp_user', user);
    return user;
};

// --- PACKAGE MANAGEMENT SERVICES ---

export const getPackages = async (onlyActive: boolean = true): Promise<CreditPackage[]> => {
    if (supabase) {
        // Fetch from 'credit_packages'
        let query = supabase
            .from('credit_packages')
            .select('*')
            .order('display_order', { ascending: true });
            
        if (onlyActive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Fetch packages error:", error);
            if (onlyActive) return DEFAULT_PACKAGES; 
            return [];
        }

        if (data && data.length > 0) {
            return data.map((p: any) => ({
                id: p.id,
                name: p.name || 'Gói Vcoin',
                coin: p.credits_amount || 0, // Map 'credits_amount'
                price: p.price_vnd || 0, // Map 'price_vnd'
                currency: 'VND',
                bonusText: p.tag || '', // Store tag visual
                bonusPercent: p.bonus_credits || 0, // Store Percentage in 'bonus_credits' column
                isPopular: p.is_featured || false, // Map 'is_featured'
                isActive: p.is_active, // Map 'is_active'
                displayOrder: p.display_order || 0, // Map 'display_order'
                colorTheme: p.is_featured ? 'border-audi-pink' : 'border-slate-600', 
                transferContent: p.transfer_syntax || `NAP ${p.price_vnd}` // Map 'transfer_syntax' or fallback
            }));
        } else {
            return []; 
        }
    }
    return DEFAULT_PACKAGES;
};

export const savePackage = async (pkg: CreditPackage): Promise<{success: boolean, error?: string}> => {
    if (supabase) {
        const payload = {
            name: pkg.name,
            credits_amount: pkg.coin,
            price_vnd: pkg.price,
            tag: pkg.bonusText || '', 
            is_featured: pkg.isPopular,
            is_active: pkg.isActive ?? true,
            display_order: pkg.displayOrder ?? 0,
            bonus_credits: pkg.bonusPercent || 0, // Save percentage here
            transfer_syntax: pkg.transferContent || '' // Save syntax here (ensure string)
        };

        try {
            if (isValidUUID(pkg.id)) {
                // Update existing
                const { error } = await supabase.from('credit_packages').update(payload).eq('id', pkg.id);
                if (error) throw error;
            } else {
                // Insert new (let DB generate UUID)
                const { error } = await supabase.from('credit_packages').insert(payload);
                if (error) throw error;
            }
            return { success: true };
        } catch (e: any) {
            console.error("Save package error:", e);
            return { success: false, error: e.message || 'Lỗi lưu gói nạp.' };
        }
    }
    return { success: false, error: 'Chưa kết nối Database.' };
};

export const updatePackageOrder = async (packages: CreditPackage[]): Promise<{success: boolean, error?: string}> => {
    if (supabase) {
        try {
            for (let i = 0; i < packages.length; i++) {
                await supabase
                    .from('credit_packages')
                    .update({ display_order: i })
                    .eq('id', packages[i].id);
            }
            return { success: true };
        } catch (e: any) {
            console.error("Reorder error:", e);
            return { success: false, error: e.message };
        }
    }
    return { success: false, error: 'No connection' };
}

export const deletePackage = async (id: string): Promise<{success: boolean, error?: string, action?: 'deleted' | 'hidden'}> => {
    if (supabase && isValidUUID(id)) {
        try {
            const { error } = await supabase.from('credit_packages').delete().eq('id', id);
            
            if (error) {
                if (error.code === '23503') {
                    const { error: updateError } = await supabase
                        .from('credit_packages')
                        .update({ is_active: false })
                        .eq('id', id);
                    
                    if (updateError) throw updateError;
                    return { success: true, action: 'hidden' };
                }
                throw error;
            }
            return { success: true, action: 'deleted' };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }
    return { success: false, error: 'Invalid ID' };
};

// --- GIFTCODE SERVICES ---

export const getGiftcodes = async (): Promise<Giftcode[]> => {
    if (supabase) {
        const { data, error } = await supabase.from('gift_codes').select('*').order('created_at', { ascending: false });
        
        if (error) {
            console.error("Fetch giftcodes error:", error);
        }

        if (data) {
            return data.map((d: any) => ({
                id: d.id,
                code: d.code,
                reward: d.diamond_reward, // Exact map: diamond_reward
                totalLimit: d.usage_limit, // Exact map: usage_limit
                usedCount: d.usage_count, // Exact map: usage_count
                maxPerUser: d.max_per_user || 1, 
                isActive: d.is_active, // Exact map: is_active
                expiresAt: d.created_at
            }));
        }
    }
    return getStorage('dmp_giftcodes') || [];
};

export const saveGiftcode = async (giftcode: Giftcode): Promise<{success: boolean, error?: string}> => {
    if (supabase) {
        const payload = {
             code: giftcode.code,
             diamond_reward: giftcode.reward,
             usage_limit: giftcode.totalLimit,
             usage_count: giftcode.usedCount,
             max_per_user: giftcode.maxPerUser,
             is_active: giftcode.isActive
        };

        try {
            if (isValidUUID(giftcode.id)) {
                // Update existing
                const { error } = await supabase.from('gift_codes').update(payload).eq('id', giftcode.id);
                if (error) throw error;
            } else {
                // Insert new
                const { error } = await supabase.from('gift_codes').insert(payload);
                if (error) throw error;
            }
            return { success: true };
        } catch (e: any) {
            console.error("Save giftcode error:", e);
            if (e.code === '23505') {
                return { success: false, error: 'Mã Code này đã tồn tại! Vui lòng chọn mã khác.' };
            }
            if (e.code === '42501') {
                return { success: false, error: 'Không có quyền lưu. Kiểm tra RLS Policy trên Supabase.' };
            }
            return { success: false, error: e.message || 'Lỗi hệ thống khi lưu Giftcode.' };
        }
    }
    return { success: false, error: 'Chưa kết nối Supabase.' };
};

export const deleteGiftcode = async (id: string): Promise<void> => {
    if (supabase && isValidUUID(id)) {
        await supabase.from('gift_codes').delete().eq('id', id);
    }
};

export const redeemGiftcode = async (codeStr: string): Promise<{success: boolean, message: string, reward?: number}> => {
    const normalizedCode = codeStr.trim().toUpperCase();
    const user = await getUserProfile();

    if (supabase && user.id.length > 20) {
        const { data: codeData, error } = await supabase
            .from('gift_codes')
            .select('*')
            .eq('code', normalizedCode)
            .eq('is_active', true)
            .single();

        if (error || !codeData) return { success: false, message: 'Mã không hợp lệ' };
        
        if (codeData.usage_count >= codeData.usage_limit) return { success: false, message: 'Mã đã hết lượt dùng' };

        const { count, error: redeemError } = await supabase
            .from('redeemed_gift_codes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('gift_code_id', codeData.id);
            
        const maxPerUser = codeData.max_per_user || 1;
        
        if ((count || 0) >= maxPerUser) {
            return { success: false, message: `Bạn đã dùng mã này rồi (${maxPerUser}/${maxPerUser})` };
        }

        const reward = codeData.diamond_reward;
        await updateUserBalance(reward, `Giftcode: ${normalizedCode}`, 'giftcode');
        
        await supabase.from('gift_codes').update({ usage_count: codeData.usage_count + 1 }).eq('id', codeData.id);
        
        await supabase.from('redeemed_gift_codes').insert({
            user_id: user.id,
            gift_code_id: codeData.id,
            redeemed_at: new Date().toISOString()
        });
        
        return { success: true, message: 'Thành công', reward: reward };
    }
    return { success: false, message: 'Vui lòng đăng nhập' };
};

// --- PROMOTION SERVICES (CAMPAIGNS) ---

export const getAllPromotions = async (): Promise<PromotionCampaign[]> => {
    if (supabase) {
        const { data, error } = await supabase
            .from('promotions')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            return data.map((p: any) => ({
                id: p.id,
                name: p.title || 'Chiến dịch', 
                marqueeText: p.description || '', 
                bonusPercent: p.bonus_percent || 0,
                startTime: p.start_time,
                endTime: p.end_time,
                isActive: p.is_active
            }));
        }
    }
    return [];
};

export const getActivePromotion = async (): Promise<PromotionCampaign | null> => {
    if (supabase) {
        const { data } = await supabase
            .from('promotions')
            .select('*')
            .eq('is_active', true)
            .order('bonus_percent', { ascending: false });

        if (data && data.length > 0) {
            const now = new Date().getTime();
            const validCampaign = data.find((p: any) => {
                const start = new Date(p.start_time).getTime();
                const end = new Date(p.end_time).getTime();
                return now >= start && now <= end;
            });

            if (validCampaign) {
                return {
                    id: validCampaign.id,
                    name: validCampaign.title,
                    marqueeText: validCampaign.description,
                    bonusPercent: validCampaign.bonus_percent,
                    startTime: validCampaign.start_time,
                    endTime: validCampaign.end_time,
                    isActive: true
                };
            }
        }
    }
    return null;
};

export const savePromotion = async (campaign: PromotionCampaign): Promise<{success: boolean, error?: string}> => {
    if (supabase) {
        const payload = {
            title: campaign.name,
            description: campaign.marqueeText,
            bonus_percent: campaign.bonusPercent,
            start_time: campaign.startTime,
            end_time: campaign.endTime,
            is_active: campaign.isActive
        };

        try {
            if (isValidUUID(campaign.id)) {
                // Update
                const { error } = await supabase.from('promotions').update(payload).eq('id', campaign.id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase.from('promotions').insert(payload);
                if (error) throw error;
            }
            return { success: true };
        } catch (e: any) {
            console.error("Save promotion error:", e);
            return { success: false, error: e.message || 'Unknown Error' };
        }
    }
    return { success: false, error: 'No DB connection' };
};

export const deletePromotion = async (id: string): Promise<void> => {
    if (supabase && isValidUUID(id)) {
        await supabase.from('promotions').delete().eq('id', id);
    }
};

// --- ATTENDANCE SERVICES (UPDATED: MANUAL CLAIM) ---

export const getCheckinStatus = async () => {
    const user = await getUserProfile();
    const today = getLocalDateStr(); // YYYY-MM-DD
    
    // Default values
    let cumulativeStreak = 0;
    let isCheckedInToday = false;
    let history: string[] = [];
    let claimedMilestones: number[] = [];

    // If connected, sync actual history from daily_check_ins table
    if (supabase && user.id.length > 20) {
        const { data, error } = await supabase
            .from('daily_check_ins')
            .select('check_in_date')
            .eq('user_id', user.id);
        
        if (data) {
            history = data.map(d => d.check_in_date); // YYYY-MM-DD
            isCheckedInToday = history.includes(today);
            
            // Calculate Cumulative Checkins for Current Month
            const currentMonthPrefix = today.substring(0, 7); // "YYYY-MM"
            cumulativeStreak = history.filter(d => d.startsWith(currentMonthPrefix)).length;

            // Check Claimed Milestones by scanning Transaction Logs
            // We look for 'transaction_type' = 'milestone_reward' and distinct description for this month
            // Example Description: "Milestone Reward: Day 7 - [YYYY-MM]"
            const { data: logs } = await supabase
                .from('diamond_transactions_log')
                .select('description')
                .eq('user_id', user.id)
                .eq('transaction_type', 'milestone_reward')
                .ilike('description', `%${currentMonthPrefix}%`);
            
            if (logs) {
                logs.forEach((log: any) => {
                    if (log.description.includes('Day 7')) claimedMilestones.push(7);
                    if (log.description.includes('Day 14')) claimedMilestones.push(14);
                    if (log.description.includes('Day 30')) claimedMilestones.push(30);
                });
            }
        }
    } else {
        // Fallback for mock user
        cumulativeStreak = user.streak; 
        if (user.lastCheckin) {
             const lastDate = new Date(user.lastCheckin).toLocaleDateString('sv-SE');
             if (lastDate === today) isCheckedInToday = true;
        }
    }

    return {
        streak: cumulativeStreak,
        isCheckedInToday,
        history,
        claimedMilestones
    };
};

export const performCheckin = async (): Promise<{ success: boolean; reward: number; newStreak: number; message?: string }> => {
    const user = await getUserProfile();
    const today = getLocalDateStr(); // YYYY-MM-DD
    const { start: monthStart, end: monthEnd } = getMonthRange();
    
    if (supabase && user.id.length > 20) {
        // 1. Double check if already checked in today in DB
        const { data: existing } = await supabase
            .from('daily_check_ins')
            .select('id')
            .eq('user_id', user.id)
            .eq('check_in_date', today)
            .maybeSingle();
            
        if (existing) {
            // Recalculate streak even if checked in to ensure UI consistency
            const { count } = await supabase
                .from('daily_check_ins')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .gte('check_in_date', monthStart)
                .lte('check_in_date', monthEnd);
            
            const currentCount = count || user.streak || 1;
            return { success: false, reward: 0, newStreak: currentCount, message: 'Hôm nay bạn đã điểm danh rồi!' };
        }

        // 2. Insert into daily_check_ins (Base Reward Only)
        const baseReward = 5;
        
        // MODIFIED: Removed 'reward_amount' to prevent schema error if column is missing
        const { error: insertError } = await supabase.from('daily_check_ins').insert({
            user_id: user.id,
            check_in_date: today
        });
        
        if (insertError) {
             console.error("Checkin Insert Error", insertError);
             // Handle Unique Violation Gracefully (23505)
             if (insertError.code === '23505') {
                 // Try getting count again
                 const { count } = await supabase
                    .from('daily_check_ins')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .gte('check_in_date', monthStart)
                    .lte('check_in_date', monthEnd);
                 return { success: true, reward: 0, newStreak: count || 1, message: 'Hôm nay bạn đã điểm danh rồi!' };
             }
             return { success: false, reward: 0, newStreak: user.streak, message: `Lỗi DB: ${insertError.message}` };
        }

        // 3. Recalculate Monthly Count using calculated range
        const { count } = await supabase
            .from('daily_check_ins')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('check_in_date', monthStart)
            .lte('check_in_date', monthEnd);

        const monthlyCount = count || 1;

        // 4. Update User Profile
        await supabase.from('users').update({ 
            consecutive_check_ins: monthlyCount, 
            last_check_in: new Date().toISOString(),
            diamonds: (user.balance || 0) + baseReward
        }).eq('id', user.id);

        // 5. Log Transaction
        await supabase.from('diamond_transactions_log').insert({
            user_id: user.id,
            amount: baseReward, 
            description: `Check-in Day ${monthlyCount}`, 
            transaction_type: 'reward',
            created_at: new Date().toISOString()
        });
        
        return { success: true, reward: baseReward, newStreak: monthlyCount };
    }
    
    return { success: true, reward: 5, newStreak: (user.streak || 0) + 1 };
};

export const claimMilestoneReward = async (day: number): Promise<{ success: boolean; reward: number; message: string }> => {
    const user = await getUserProfile();
    const today = getLocalDateStr();
    const currentMonthPrefix = today.substring(0, 7);
    const { start: monthStart, end: monthEnd } = getMonthRange();

    if (!supabase || user.id.length < 20) {
        return { success: false, reward: 0, message: 'Chưa đăng nhập' };
    }

    // 1. Verify Eligibility (Monthly Count)
    const { count } = await supabase
        .from('daily_check_ins')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('check_in_date', monthStart)
        .lte('check_in_date', monthEnd);
    
    const monthlyCount = count || 0;
    if (monthlyCount < day) {
        return { success: false, reward: 0, message: `Chưa đủ ${day} ngày điểm danh!` };
    }

    // 2. Check if already claimed this month
    const descriptionKey = `Milestone Reward: Day ${day} - [${currentMonthPrefix}]`;
    const { data: existingLog } = await supabase
        .from('diamond_transactions_log')
        .select('id')
        .eq('user_id', user.id)
        .eq('description', descriptionKey)
        .maybeSingle();

    if (existingLog) {
        return { success: false, reward: 0, message: 'Đã nhận thưởng mốc này rồi!' };
    }

    // 3. Determine Reward
    let reward = 0;
    if (day === 7) reward = 20;
    else if (day === 14) reward = 50;
    else if (day === 30) reward = 100;

    // 4. Distribute Reward
    await updateUserBalance(reward, descriptionKey, 'milestone_reward');

    return { success: true, reward, message: `Nhận thành công ${reward} Vcoin!` };
}

// --- TRANSACTION SERVICES ---

export const getUserTransactions = async (): Promise<Transaction[]> => {
    const user = await getUserProfile();
    if (supabase && user.id.length > 20) {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (!error && data) {
            return data.map((t: any) => ({
                id: t.id,
                userId: t.user_id,
                packageId: t.package_id,
                amount: t.amount_vnd,
                coins: t.diamonds_received,
                status: t.status,
                createdAt: t.created_at,
                paymentMethod: 'payos',
                code: `NAP${t.order_code}`
            }));
        }
    }
    return [];
};

export const getUnifiedHistory = async (): Promise<HistoryItem[]> => {
    const user = await getUserProfile();
    if (!supabase || user.id.length < 20) return [];

    const { data: logs } = await supabase
        .from('diamond_transactions_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    const { data: pendingTxs } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    const history: HistoryItem[] = [];

    if (pendingTxs) {
        pendingTxs.forEach((tx: any) => {
            history.push({
                id: tx.id,
                createdAt: tx.created_at,
                description: `Đơn nạp chờ duyệt`,
                vcoinChange: tx.diamonds_received,
                amountVnd: tx.amount_vnd,
                type: 'pending_topup',
                status: 'pending',
                code: `NAP${tx.order_code}`
            });
        });
    }

    if (logs) {
        logs.forEach((log: any) => {
            history.push({
                id: log.id,
                createdAt: log.created_at,
                description: log.description,
                vcoinChange: log.amount, 
                type: log.transaction_type, 
                status: 'success',
                code: log.description.includes('Deposit:') ? log.description.split(':')[1].trim() : undefined
            });
        });
    }

    return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const createPaymentLink = async (packageId: string): Promise<Transaction> => {
    const user = await getUserProfile();
    const pkgs = await getPackages();
    const pkg = pkgs.find(p => p.id === packageId);
    if (!pkg) throw new Error("Package not found");

    // PayOS requires integer orderCode (safe max ~9007199254740991)
    // We use truncated timestamp to ensure uniqueness but short enough
    const orderCode = Number(String(Date.now()).slice(-10)); 

    const activeCampaign = await getActivePromotion();
    const activeBonusPercent = activeCampaign ? activeCampaign.bonusPercent : pkg.bonusPercent;
    
    const baseCoins = pkg.coin;
    const bonusCoins = Math.floor(baseCoins * (activeBonusPercent / 100));
    const totalCoins = baseCoins + bonusCoins;

    const newTx: Transaction = {
        id: crypto.randomUUID(),
        userId: user.id,
        packageId: pkg.id,
        amount: pkg.price,
        coins: totalCoins, 
        status: 'pending',
        createdAt: new Date().toISOString(),
        paymentMethod: 'payos',
        code: `NAP${orderCode}`
    };

    // 1. CALL NETLIFY FUNCTION TO GET PAYOS LINK
    try {
        const response = await fetch('/.netlify/functions/create_payment', {
            method: 'POST',
            body: JSON.stringify({
                orderCode: orderCode,
                amount: pkg.price,
                description: `Nap Vcoin ${orderCode}`,
                returnUrl: `${window.location.origin}/?status=PAID&orderCode=${orderCode}`,
                cancelUrl: `${window.location.origin}/?status=CANCELLED&orderCode=${orderCode}`
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.checkoutUrl) {
                newTx.checkoutUrl = data.checkoutUrl;
                console.log("PayOS Link Created:", data.checkoutUrl);
            }
        } else {
            console.warn("PayOS Function Error", await response.text());
        }
    } catch (e) {
        console.warn("PayOS Link Creation Failed (Fallback to Manual)", e);
    }

    // 2. SAVE TRANSACTION TO DB
    if (supabase && user.id.length > 20) {
        await supabase.from('transactions').insert({
            id: newTx.id,
            user_id: user.id,
            package_id: pkg.id,
            amount_vnd: pkg.price, 
            diamonds_received: totalCoins,
            status: 'pending',
            order_code: orderCode,
            created_at: newTx.createdAt
        });
    }

    return newTx;
};

// --- ADMIN SERVICES ---

export const updateAdminUserProfile = async (updatedUser: UserProfile): Promise<UserProfile> => {
    if(supabase) {
        await supabase.from('users').update({
            diamonds: updatedUser.balance,
            display_name: updatedUser.username,
            photo_url: updatedUser.avatar
        }).eq('id', updatedUser.id);
    }
    return updatedUser;
};

export const adminApproveTransaction = async (txId: string): Promise<{ success: boolean; error?: string }> => {
    if (supabase) {
        try {
            // 0. Verify Transaction Exists & Status
            const { data: tx, error: fetchError } = await supabase
                .from('transactions')
                .select('*')
                .eq('id', txId)
                .maybeSingle(); // Safer than single()

            if (fetchError) return { success: false, error: fetchError.message };
            if (!tx) return { success: false, error: "Giao dịch không tồn tại" };
            if (tx.status === 'paid') return { success: false, error: "Giao dịch đã được duyệt trước đó" };

            // 1. Update status
            const { data: updatedTx, error: updateError } = await supabase
                .from('transactions')
                .update({ status: 'paid' })
                .eq('id', txId)
                .select()
                .maybeSingle(); // Explicitly return single row

            if (updateError) throw updateError;
            
            // Check if RLS blocked the update (silent failure)
            if (!updatedTx) {
                return { success: false, error: "Quyền hạn bị từ chối (RLS Policy) hoặc ID không khớp." };
            }

            // DOUBLE CHECK PERSISTENCE (VERIFY UPDATE)
            const { data: verifyTx } = await supabase
                .from('transactions')
                .select('status')
                .eq('id', txId)
                .maybeSingle();

            if (verifyTx?.status !== 'paid') {
                 return { success: false, error: "Lỗi Hệ Thống: Update không được lưu (DB Reverted)." };
            }
            
            // 2. Add coins to User
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('diamonds')
                .eq('id', tx.user_id)
                .single();
                
            if(user) {
                const currentBalance = user.diamonds || 0;
                const coins = tx.diamonds_received || 0;
                
                // Use RPC or direct update? Direct update is risky for concurrency but fine for low traffic
                await supabase.from('users').update({ diamonds: currentBalance + coins }).eq('id', tx.user_id);
                
                // 3. Log
                await supabase.from('diamond_transactions_log').insert({
                    user_id: tx.user_id,
                    amount: coins,
                    description: `Deposit: ${tx.order_code}`,
                    transaction_type: 'topup',
                    created_at: new Date().toISOString()
                });
            } else {
                 // Transaction approved but user not found? Odd edge case.
                 return { success: true, error: "Đã duyệt nhưng không tìm thấy User để cộng tiền." };
            }

            return { success: true };
        } catch (e: any) {
            console.error("Approve Error:", e);
            return { success: false, error: e.message };
        }
    }
    return { success: false, error: "No DB Connection" };
};

export const adminRejectTransaction = async (txId: string): Promise<{ success: boolean; error?: string }> => {
    if (supabase) {
        try {
            const { data: updatedTx, error } = await supabase
                .from('transactions')
                .update({ status: 'failed' })
                .eq('id', txId)
                .select()
                .maybeSingle();

            if (error) throw error;

            if (!updatedTx) {
                return { success: false, error: "Quyền hạn bị từ chối (RLS Policy)." };
            }
            
             // DOUBLE CHECK PERSISTENCE
            const { data: verifyTx } = await supabase
                .from('transactions')
                .select('status')
                .eq('id', txId)
                .maybeSingle();

            if (verifyTx?.status !== 'failed') {
                 return { success: false, error: "Lỗi Hệ Thống: Update không được lưu." };
            }

            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }
    return { success: false, error: "No DB Connection" };
};

export const deleteTransaction = async (txId: string): Promise<{success: boolean, error?: string}> => {
    if (supabase) {
        try {
            const { data, error } = await supabase.from('transactions').delete().eq('id', txId).select();
            if (error) throw error;
            if (!data || data.length === 0) {
                 return { success: false, error: "Không thể xóa (RLS Policy hoặc ID sai)." };
            }
            return { success: true };
        } catch (e: any) {
             return { success: false, error: e.message };
        }
    }
    return { success: false, error: "No DB Connection" };
}

export const mockPayOSSuccess = async (txId: string) => {
    return adminApproveTransaction(txId);
};

export const getAdminStats = async () => {
    let users = [], txs = [];
    
    let dashboardStats = {
        visitsToday: 0,
        visitsTotal: 0,
        newUsersToday: 0,
        usersTotal: 0,
        imagesToday: 0,
        imagesTotal: 0,
        aiUsage: [] as any[]
    };
    
    if (supabase) {
        const { data: u, count: totalUsers } = await supabase
            .from('users')
            .select('id, display_name, email, photo_url, diamonds, is_admin, created_at', { count: 'exact' });

        if(u) {
            users = u.map((p: any) => ({
                id: p.id,
                username: p.display_name || 'User',
                email: p.email,
                avatar: p.photo_url || MOCK_USER.avatar,
                balance: p.diamonds || 0,
                role: p.is_admin ? 'admin' : 'user',
                createdAt: p.created_at
            }));
        }

        const { data: t } = await supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false }); // Explicitly sort by date desc

        if(t) txs = t.map((row:any) => ({
            id: row.id,
            userId: row.user_id,
            packageId: row.package_id,
            amount: row.amount_vnd,
            coins: row.diamonds_received,
            code: `NAP${row.order_code}`,
            status: row.status,
            createdAt: row.created_at,
            paymentMethod: 'payos'
        }));

        const todayStr = new Date().toISOString().split('T')[0];
        
        const newUsersCount = users.filter((u:any) => u.createdAt && u.createdAt.startsWith(todayStr)).length;
        
        const { count: totalImgs } = await supabase.from('generated_images').select('*', { count: 'exact', head: true });
        const { count: todayImgs } = await supabase.from('generated_images').select('*', { count: 'exact', head: true }).gte('created_at', todayStr);

        let visitsToday = 0;
        let visitsTotal = 0;

        try {
             const { count: vTotal } = await supabase.from('app_visits').select('*', { count: 'exact', head: true });
             if (vTotal !== null) visitsTotal = vTotal;

             const { count: vToday } = await supabase.from('app_visits')
                 .select('*', { count: 'exact', head: true })
                 .gte('created_at', todayStr);
             if (vToday !== null) visitsToday = vToday;

        } catch (e) {
            console.warn("Table app_visits likely missing", e);
        }

        let aiUsageStats: any[] = [];
        try {
            const { data: logs } = await supabase
                .from('diamond_transactions_log')
                .select('amount, description')
                .eq('transaction_type', 'usage'); 
            
            if (logs) {
                const usageMap = new Map<string, { count: number, vcoins: number }>();
                
                logs.forEach(log => {
                    const feature = log.description || 'Unknown Feature';
                    
                    if (!usageMap.has(feature)) {
                        usageMap.set(feature, { count: 0, vcoins: 0 });
                    }
                    
                    const entry = usageMap.get(feature)!;
                    entry.count += 1;
                    entry.vcoins += Math.abs(log.amount); 
                });

                aiUsageStats = Array.from(usageMap.entries()).map(([feature, stats]) => ({
                    feature: feature,
                    count: stats.count,
                    vcoins: stats.vcoins,
                    revenue: stats.vcoins * 1000 
                }));
            }
        } catch(e) {
            console.warn("AI Usage Aggregation Error", e);
        }

        dashboardStats = {
            visitsToday: visitsToday,
            visitsTotal: visitsTotal,
            newUsersToday: newUsersCount,
            usersTotal: totalUsers || users.length,
            imagesToday: todayImgs || 0,
            imagesTotal: totalImgs || 0,
            aiUsage: aiUsageStats
        };
    }

    return {
        dashboard: dashboardStats,
        revenue: dashboardStats.aiUsage.reduce((acc, curr) => acc + curr.revenue, 0),
        transactions: txs,
        logs: [],
        usersList: users,
        packages: await getPackages(false), 
        promotions: await getAllPromotions(), 
        activePromotion: await getActivePromotion(), 
        giftcodes: await getGiftcodes()
    };
};

export const getPromotionConfig = getActivePromotion;
