
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
            const { data, error } = await supabase
                .from('api_keys')
                .select('key_value')
                .eq('status', 'active') 
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (!error && data && data.length > 0 && data[0].key_value) {
                return data[0].key_value.trim();
            }

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
    const metaEnv = (import.meta as any).env || {};
    return metaEnv.VITE_GEMINI_API_KEY || process.env.API_KEY || null;
};

export const getApiKeysList = async (): Promise<any[]> => {
    if (supabase) {
        const { data, error } = await supabase
            .from('api_keys')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error && data) return data;
    }
    return [];
};

export const saveSystemApiKey = async (apiKey: string): Promise<{ success: boolean, error?: string }> => {
    if (supabase) {
        try {
            const cleanKey = apiKey.trim();
            const { error: updateError } = await supabase
                .from('api_keys')
                .update({ status: 'inactive' })
                .neq('key_value', cleanKey); 
            if (updateError) throw updateError;

            const { data: existing, error: selectError } = await supabase
                .from('api_keys')
                .select('id')
                .eq('key_value', cleanKey)
                .maybeSingle();
            if (selectError) throw selectError;

            if (existing) {
                const { error: upsertError } = await supabase
                    .from('api_keys')
                    .update({ status: 'active', updated_at: new Date().toISOString() })
                    .eq('id', existing.id);
                if (upsertError) throw upsertError;
            } else {
                const { error: insertError } = await supabase
                    .from('api_keys')
                    .insert({
                        name: 'Admin Key ' + new Date().toLocaleDateString(),
                        key_value: cleanKey,
                        status: 'active',
                        usage_count: 0
                    });
                if (insertError) throw insertError;
            }
            
            await supabase
                .from('system_settings')
                .upsert({ key: 'gemini_api_key', value: cleanKey }, { onConflict: 'key' });

            return { success: true };
        } catch (e: any) {
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

// --- GIFTCODE ANNOUNCEMENT SYSTEM (NEW) ---

export const getGiftcodePromoConfig = async (): Promise<{ text: string, isActive: boolean }> => {
    if (supabase) {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'giftcode_promo')
            .maybeSingle();
        
        if (data && data.value) {
            const config = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            return {
                text: config.text || '',
                isActive: config.isActive || false
            };
        }
    }
    return { text: '', isActive: false };
}

export const saveGiftcodePromoConfig = async (text: string, isActive: boolean): Promise<{ success: boolean, error?: string }> => {
    if (supabase) {
        try {
            const { error } = await supabase
                .from('system_settings')
                .upsert({ 
                    key: 'giftcode_promo', 
                    value: { text, isActive } 
                }, { onConflict: 'key' });

            if (error) throw error;
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }
    return { success: false, error: "No DB" };
}

// --- USER SERVICES (FIXED: ENSURE PROFILE EXISTS) ---

export const getUserProfile = async (): Promise<UserProfile> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            try {
                // 1. Fetch Profile
                const { data: profile, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                const finalProfile = profile || {};
                const metadata = user.user_metadata || {};
                
                return {
                    id: user.id,
                    username: finalProfile.display_name || metadata.full_name || user.email?.split('@')[0] || 'Dancer',
                    email: finalProfile.email || user.email || '',
                    avatar: finalProfile.photo_url || metadata.avatar_url || MOCK_USER.avatar,
                    balance: finalProfile.diamonds || 0,
                    role: finalProfile.is_admin ? 'admin' : 'user',
                    isVip: false,
                    streak: finalProfile.consecutive_check_ins || 0,
                    lastCheckin: finalProfile.last_check_in,
                    checkinHistory: [], 
                    usedGiftcodes: []
                };

            } catch (e) {
                console.error("Critical User Fetch Error:", e);
                return {
                    id: user.id,
                    username: user.email?.split('@')[0] || 'Unknown',
                    email: user.email || '',
                    avatar: MOCK_USER.avatar,
                    balance: 0,
                    role: 'user',
                    isVip: false,
                    streak: 0,
                    lastCheckin: null,
                    checkinHistory: [],
                    usedGiftcodes: []
                };
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

// NEW HELPER: Force sync user to public table
// This is called before critical actions (like checkin) to prevent FK errors
const ensureUserSync = async (user: UserProfile) => {
    if (!supabase || user.id.length < 20) return;
    
    // Attempt to Insert/Update the user record to ensure it exists
    // We use the data we have from Auth (via getUserProfile)
    const { error } = await supabase.from('users').upsert({
        id: user.id,
        email: user.email,
        display_name: user.username,
        photo_url: user.avatar,
        // We do NOT overwrite diamonds here to avoid resetting balance
        updated_at: new Date().toISOString()
    }, { onConflict: 'id', ignoreDuplicates: false }); // ignoreDuplicates: false means we update if exists

    if (error) {
        console.warn("Ensure User Sync Failed (likely RLS or connection):", error);
    }
};

// UPDATED: FORCE CHECK IF UPDATE ACTUALLY HAPPENED
export const updateUserBalance = async (amount: number, reason: string, type: 'topup' | 'usage' | 'reward' | 'refund' | 'admin_adjustment' | 'giftcode' | 'milestone_reward'): Promise<{ success: boolean, newBalance: number, error?: string }> => {
    const user = await getUserProfile(); // Gets Auth User ID primarily
    const newBalance = (user.balance || 0) + amount;

    if (supabase && user.id.length > 20) { 
        // 0. Ensure user exists first!
        await ensureUserSync(user);

        // 1. Update Balance
        const { data, error: updateError } = await supabase
            .from('users')
            .update({ diamonds: newBalance })
            .eq('id', user.id)
            .select(); 
        
        // 2. SUCCESS CASE
        if (!updateError && data && data.length > 0) {
            // Log Transaction
            await supabase.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount, 
                description: reason, 
                transaction_type: type || 'usage',
                created_at: new Date().toISOString()
            });
            
            // --- CRITICAL: DISPATCH EVENT FOR UI UPDATE ---
            window.dispatchEvent(new Event('balance_updated'));
            // ---------------------------------------------

            return { success: true, newBalance };
        }

        return { success: false, newBalance: user.balance, error: "Lỗi đồng bộ tài khoản. Vui lòng chạy lệnh SQL sửa lỗi trong phần Cài đặt." };
    }

    // Local fallback
    user.balance = newBalance;
    setStorage('dmp_user', user);
    window.dispatchEvent(new Event('balance_updated'));
    return { success: true, newBalance };
};

// --- PACKAGE MANAGEMENT SERVICES ---

export const getPackages = async (onlyActive: boolean = true): Promise<CreditPackage[]> => {
    if (supabase) {
        let query = supabase
            .from('credit_packages')
            .select('*')
            .order('display_order', { ascending: true });
            
        if (onlyActive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            if (onlyActive) return DEFAULT_PACKAGES; 
            return [];
        }

        if (data && data.length > 0) {
            return data.map((p: any) => ({
                id: p.id,
                name: p.name || 'Gói Vcoin',
                coin: p.credits_amount || 0,
                price: p.price_vnd || 0,
                currency: 'VND',
                bonusText: p.tag || '',
                bonusPercent: p.bonus_credits || 0,
                isPopular: p.is_featured || false,
                isActive: p.is_active,
                displayOrder: p.display_order || 0,
                colorTheme: p.is_featured ? 'border-audi-pink' : 'border-slate-600', 
                transferContent: p.transfer_syntax || `NAP ${p.price_vnd}`
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
            bonus_credits: pkg.bonusPercent || 0,
            transfer_syntax: pkg.transferContent || ''
        };

        try {
            if (isValidUUID(pkg.id)) {
                const { error } = await supabase.from('credit_packages').update(payload).eq('id', pkg.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('credit_packages').insert(payload);
                if (error) throw error;
            }
            return { success: true };
        } catch (e: any) {
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

// --- GIFTCODE SERVICES (FIXED) ---

export const getGiftcodes = async (): Promise<Giftcode[]> => {
    if (supabase) {
        const { data, error } = await supabase.from('gift_codes').select('*').order('created_at', { ascending: false });
        if (data) {
            return data.map((d: any) => ({
                id: d.id,
                code: d.code,
                reward: d.diamond_reward,
                totalLimit: d.usage_limit,
                usedCount: d.usage_count,
                maxPerUser: d.max_per_user || 1, 
                isActive: d.is_active,
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
                const { error } = await supabase.from('gift_codes').update(payload).eq('id', giftcode.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('gift_codes').insert(payload);
                if (error) throw error;
            }
            return { success: true };
        } catch (e: any) {
            if (e.code === '23505') {
                return { success: false, error: 'Mã Code này đã tồn tại! Vui lòng chọn mã khác.' };
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
    
    // 1. Ensure user exists
    const user = await getUserProfile(); 

    if (supabase && user.id.length > 20) {
        // 2. Fetch Code Data
        const { data: codeData, error } = await supabase
            .from('gift_codes')
            .select('*')
            .eq('code', normalizedCode)
            .eq('is_active', true)
            .single();

        if (error || !codeData) return { success: false, message: 'Mã không hợp lệ' };
        if (codeData.usage_count >= codeData.usage_limit) return { success: false, message: 'Mã đã hết lượt dùng' };

        // 3. Check if user already used this code
        const { count } = await supabase
            .from('redeemed_gift_codes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('gift_code_id', codeData.id);
            
        const maxPerUser = codeData.max_per_user || 1;
        
        if ((count || 0) >= maxPerUser) {
            return { success: false, message: `Bạn đã dùng mã này rồi (${maxPerUser}/${maxPerUser})` };
        }

        // 4. TRANSACTION START: Update Balance FIRST (with Strict Check)
        const reward = codeData.diamond_reward;
        
        // ** FORCE SYNC USER BEFORE UPDATE **
        await ensureUserSync(user);

        const balanceUpdate = await updateUserBalance(reward, `Giftcode: ${normalizedCode}`, 'giftcode');

        if (!balanceUpdate.success) {
            return { success: false, message: balanceUpdate.error || 'Lỗi: Tài khoản chưa được đồng bộ vào Database.' };
        }

        // 5. If balance updated, RECORD REDEMPTION
        const { error: insertError } = await supabase.from('redeemed_gift_codes').insert({
            user_id: user.id,
            gift_code_id: codeData.id,
            redeemed_at: new Date().toISOString()
        });

        if (insertError) {
            console.error("Giftcode Redemption Insert Error:", insertError);
            if (insertError.code === '23505') return { success: false, message: 'Bạn đã dùng mã này rồi!' };
        }

        // 6. Update global usage count
        await supabase.from('gift_codes').update({ usage_count: codeData.usage_count + 1 }).eq('id', codeData.id);
        
        return { success: true, message: 'Thành công', reward: reward };
    }
    return { success: false, message: 'Vui lòng đăng nhập' };
};

// --- PROMOTION SERVICES ---

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
                const { error } = await supabase.from('promotions').update(payload).eq('id', campaign.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('promotions').insert(payload);
                if (error) throw error;
            }
            return { success: true };
        } catch (e: any) {
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

// --- ATTENDANCE SERVICES (UPDATED) ---

export const getCheckinStatus = async () => {
    const user = await getUserProfile();
    const today = getLocalDateStr(); 
    
    let cumulativeStreak = 0;
    let isCheckedInToday = false;
    let history: string[] = [];
    let claimedMilestones: number[] = [];

    if (supabase && user.id.length > 20) {
        const { data, error } = await supabase
            .from('daily_check_ins')
            .select('check_in_date')
            .eq('user_id', user.id); // Check against daily_check_ins.user_id
        
        if (data) {
            history = data.map(d => d.check_in_date);
            isCheckedInToday = history.includes(today);
            const currentMonthPrefix = today.substring(0, 7); 
            cumulativeStreak = history.filter(d => d.startsWith(currentMonthPrefix)).length;

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
    // 1. Ensure user exists (Retry logic inside handle triggers)
    const user = await getUserProfile();
    
    const today = getLocalDateStr(); 
    const { start: monthStart, end: monthEnd } = getMonthRange();
    
    if (supabase && user.id.length > 20) {
        
        // ** CRITICAL FIX: ENSURE USER EXISTS IN PUBLIC.USERS BEFORE CHECKIN **
        // This solves the FK constraint error.
        await ensureUserSync(user);

        // 2. Double check if already checked in today
        const { data: existing } = await supabase
            .from('daily_check_ins')
            .select('id')
            .eq('user_id', user.id) // daily_check_ins.user_id
            .eq('check_in_date', today)
            .maybeSingle();
            
        if (existing) {
            const { count } = await supabase
                .from('daily_check_ins')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .gte('check_in_date', monthStart)
                .lte('check_in_date', monthEnd);
            
            const currentCount = count || user.streak || 1;
            return { success: false, reward: 0, newStreak: currentCount, message: 'Hôm nay bạn đã điểm danh rồi!' };
        }

        // 3. Insert into daily_check_ins
        // We rely on user.id (Auth ID) matching users.id, which daily_check_ins.user_id references.
        const baseReward = 5;
        const { error: insertError } = await supabase.from('daily_check_ins').insert({
            user_id: user.id,
            check_in_date: today
        });
        
        if (insertError) {
             console.error("Checkin Insert Error", insertError);
             if (insertError.code === '23505') {
                 // Duplicate key error = Already checked in
                 const { count } = await supabase
                    .from('daily_check_ins')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .gte('check_in_date', monthStart)
                    .lte('check_in_date', monthEnd);
                 return { success: true, reward: 0, newStreak: count || 1, message: 'Hôm nay bạn đã điểm danh rồi!' };
             }
             // ERROR HANDLING FOR FK CONSTRAINT
             if (insertError.code === '23503') {
                 return { success: false, reward: 0, newStreak: user.streak, message: `Lỗi: Tài khoản chưa được đồng bộ (FK). Vui lòng dùng nút "Sửa Lỗi" bên dưới.` };
             }
             return { success: false, reward: 0, newStreak: user.streak, message: `Lỗi DB: ${insertError.message}` };
        }

        // 4. Recalculate Monthly Count
        const { count } = await supabase
            .from('daily_check_ins')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('check_in_date', monthStart)
            .lte('check_in_date', monthEnd);

        const monthlyCount = count || 1;

        // 5. Update User Profile
        await supabase.from('users').update({ 
            consecutive_check_ins: monthlyCount, 
            last_check_in: new Date().toISOString()
        }).eq('id', user.id);

        // 6. Add Reward via Centralized Function
        await updateUserBalance(baseReward, `Check-in Day ${monthlyCount}`, 'reward');
        
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

    // 1. Verify Eligibility
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

    // 2. Check if already claimed
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
            }
        } else {
            console.warn("PayOS Function Error", await response.text());
        }
    } catch (e) {
        console.warn("PayOS Link Creation Failed (Fallback to Manual)", e);
    }

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

// Updated: now checks if any rows were actually modified (RLS Check)
export const updateAdminUserProfile = async (updatedUser: UserProfile): Promise<{ success: boolean, error?: string }> => {
    if(supabase) {
        const { data, error } = await supabase.from('users').update({
            diamonds: updatedUser.balance,
            display_name: updatedUser.username,
            photo_url: updatedUser.avatar
        }).eq('id', updatedUser.id).select(); // Added .select()

        if (error) return { success: false, error: error.message };
        
        // RLS BLOCK CHECK
        if (!data || data.length === 0) {
            return { success: false, error: "Không có quyền (RLS Blocked). Hãy chạy mã sửa lỗi trong tab Hệ Thống." };
        }
        return { success: true };
    }
    return { success: true }; // Local mode fallback
};

export const adminApproveTransaction = async (txId: string): Promise<{ success: boolean; error?: string }> => {
    if (supabase) {
        try {
            const { data: tx, error: fetchError } = await supabase
                .from('transactions')
                .select('*')
                .eq('id', txId)
                .maybeSingle();

            if (fetchError) return { success: false, error: fetchError.message };
            if (!tx) return { success: false, error: "Giao dịch không tồn tại" };
            if (tx.status === 'paid') return { success: false, error: "Giao dịch đã được duyệt trước đó" };

            const { data: updatedTx, error: updateError } = await supabase
                .from('transactions')
                .update({ status: 'paid' })
                .eq('id', txId)
                .select()
                .maybeSingle(); 

            if (updateError) throw updateError;
            if (!updatedTx) {
                return { success: false, error: "Quyền hạn bị từ chối (RLS Policy)." };
            }

            const { data: user, error: userError } = await supabase
                .from('users')
                .select('diamonds')
                .eq('id', tx.user_id)
                .single();
                
            if(user) {
                const currentBalance = user.diamonds || 0;
                const coins = tx.diamonds_received || 0;
                
                await supabase.from('users').update({ diamonds: currentBalance + coins }).eq('id', tx.user_id);
                
                await supabase.from('diamond_transactions_log').insert({
                    user_id: tx.user_id,
                    amount: coins,
                    description: `Deposit: ${tx.order_code}`,
                    transaction_type: 'topup',
                    created_at: new Date().toISOString()
                });
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
        const { data: u } = await supabase
            .from('users')
            .select('id, display_name, email, photo_url, diamonds, is_admin, created_at');

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
            .select('*, users (display_name, email, photo_url)')
            .order('created_at', { ascending: false });

        if(t) txs = t.map((row:any) => ({
            id: row.id,
            userId: row.user_id,
            userName: row.users?.display_name || 'Unknown',
            userEmail: row.users?.email || 'No Email',
            userAvatar: row.users?.photo_url || 'https://picsum.photos/100/100',
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
                    if (!usageMap.has(feature)) usageMap.set(feature, { count: 0, vcoins: 0 });
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
            usersTotal: users.length,
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
