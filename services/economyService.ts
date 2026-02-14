
import { CreditPackage, Transaction, UserProfile, CheckinConfig, DiamondLog, TransactionStatus, PromotionCampaign, Giftcode } from '../types';
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

// --- SYSTEM CONFIG (API KEY) SERVICES ---

export const getSystemApiKey = async (): Promise<string | null> => {
    if (supabase) {
        try {
            // 1. Try fetching from 'api_keys' table
            // WE REMOVED .eq('status', 'active') to ensure we get the key even if status is misconfigured
            const { data, error } = await supabase
                .from('api_keys')
                .select('key_value')
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

export const saveSystemApiKey = async (apiKey: string): Promise<boolean> => {
    if (supabase) {
        try {
            const cleanKey = apiKey.trim();
            // Insert into api_keys table
            const { error } = await supabase
                .from('api_keys')
                .insert({
                    name: 'Admin Key ' + new Date().toISOString(),
                    key_value: cleanKey,
                    status: 'active',
                    usage_count: 0
                });
            
            // Also update system_settings for backward compatibility
            await supabase
                .from('system_settings')
                .upsert({ key: 'gemini_api_key', value: cleanKey }, { onConflict: 'key' });

            if (error) {
                console.error("Save API Key Error:", error);
                throw error;
            }
            return true;
        } catch (e) {
            console.error("Error saving API Key", e);
            return false;
        }
    }
    return false;
};

// --- USER SERVICES ---

export const getUserProfile = async (): Promise<UserProfile> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            try {
                const { data: profile, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single();

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
                
                // Profile missing -> Create new with conflict handling
                const newProfile = {
                    id: user.id,
                    email: user.email,
                    display_name: user.user_metadata.full_name || user.email?.split('@')[0],
                    photo_url: user.user_metadata.avatar_url,
                    diamonds: 10,
                    is_admin: false,
                    consecutive_check_ins: 0,
                    created_at: new Date().toISOString()
                };
                
                const { error: insertError } = await supabase.from('users').insert(newProfile);
                
                if (!insertError || insertError.code === '23505') { // 23505 = Unique Violation
                    return { 
                        ...MOCK_USER, 
                        id: user.id,
                        username: newProfile.display_name,
                        email: newProfile.email || '',
                        avatar: newProfile.photo_url || MOCK_USER.avatar,
                        balance: newProfile.diamonds
                    } as UserProfile;
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

export const updateUserBalance = async (amount: number, reason: string, type: 'topup' | 'usage' | 'reward' | 'refund' | 'admin_adjustment' | 'giftcode'): Promise<UserProfile> => {
    const user = await getUserProfile();
    const newBalance = (user.balance || 0) + amount;

    if (supabase && user.id.length > 20) { 
        // Update 'diamonds' column in 'users'
        const { error } = await supabase.from('users').update({ diamonds: newBalance }).eq('id', user.id);
        
        if (!error) {
             // Log transaction in 'diamond_transactions_log'
            await supabase.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount,
                description: reason, // Map to 'description' column
                transaction_type: type || 'usage', // Map to 'transaction_type'
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
            // Don't fallback to default if we have a connection error, allows Admin to see blank instead of mock
            // But for safety, if user, maybe fallback.
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
            return []; // Return empty if no packages found in DB (don't show mock)
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
            // Iterate and update order for each package
            // NOTE: A more efficient way would be an upsert or RPC, but this is safe for small lists.
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
            // 1. Try Hard Delete First
            const { error } = await supabase.from('credit_packages').delete().eq('id', id);
            
            if (error) {
                // Check for Foreign Key Constraint (Postgres code 23503)
                // If it fails because it's referenced in transactions, we SOFT DELETE (hide) it instead
                if (error.code === '23503') {
                    const { error: updateError } = await supabase
                        .from('credit_packages')
                        .update({ is_active: false })
                        .eq('id', id);
                    
                    if (updateError) throw updateError;
                    
                    // Return specific action status so UI knows it wasn't fully deleted
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
        // Fetch all giftcodes, ordered by creation
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
        // Construct payload strictly matching DB Columns
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
                // Insert new - REMOVE ID if it's temp, let DB generate UUID
                const { error } = await supabase.from('gift_codes').insert(payload);
                if (error) throw error;
            }
            return { success: true };
        } catch (e: any) {
            console.error("Save giftcode error:", e);
            // Handle unique violation (23505)
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
        // 1. Get Code
        const { data: codeData, error } = await supabase
            .from('gift_codes')
            .select('*')
            .eq('code', normalizedCode)
            .eq('is_active', true)
            .single();

        if (error || !codeData) return { success: false, message: 'Mã không hợp lệ' };
        
        // 2. Check Global Limits
        if (codeData.usage_count >= codeData.usage_limit) return { success: false, message: 'Mã đã hết lượt dùng' };

        // 3. Check Per-User Limit via 'redeemed_gift_codes'
        const { count, error: redeemError } = await supabase
            .from('redeemed_gift_codes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('gift_code_id', codeData.id);
            
        // Default max per user is 1 if column missing or null
        const maxPerUser = codeData.max_per_user || 1;
        
        if ((count || 0) >= maxPerUser) {
            return { success: false, message: `Bạn đã dùng mã này rồi (${maxPerUser}/${maxPerUser})` };
        }

        // 4. Update Balance
        const reward = codeData.diamond_reward;
        await updateUserBalance(reward, `Giftcode: ${normalizedCode}`, 'giftcode');
        
        // 5. Update Global Usage
        await supabase.from('gift_codes').update({ usage_count: codeData.usage_count + 1 }).eq('id', codeData.id);
        
        // 6. Record Redemption Log
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
                name: p.title || 'Chiến dịch', // Internal Name
                marqueeText: p.description || '', // Marquee content
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
        // Fetch all ACTIVE campaigns
        // We filter by time on client-side to ensure precise comparison, 
        // or we can use DB filter if time zones match. Client-side is safer for this scope.
        const { data } = await supabase
            .from('promotions')
            .select('*')
            .eq('is_active', true)
            .order('bonus_percent', { ascending: false }); // Prioritize highest bonus

        if (data && data.length > 0) {
            const now = new Date().getTime();
            
            // Find the first campaign that is currently running
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
            // Return detailed message if possible
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

// --- ATTENDANCE SERVICES ---

export const getCheckinStatus = async () => {
    const user = await getUserProfile();
    const today = new Date().toDateString();
    
    let lastCheckinDate = null;
    if (user.lastCheckin) {
        lastCheckinDate = new Date(user.lastCheckin).toDateString();
    }
    
    return {
        streak: user.streak,
        isCheckedInToday: lastCheckinDate === today,
        history: user.checkinHistory || [] 
    };
};

export const performCheckin = async (): Promise<{ success: boolean; reward: number; newStreak: number }> => {
    const user = await getUserProfile();
    let newStreak = user.streak + 1;
    let reward = 5; 
    
    if (supabase && user.id.length > 20) {
        const todayISO = new Date().toISOString();
        const dateOnly = todayISO.split('T')[0]; // Format for 'date' column type
        
        // Check 'check_in_rewards' table for milestone rewards
        const { data: rewardRule } = await supabase
            .from('check_in_rewards')
            .select('diamond_reward')
            .eq('consecutive_days', newStreak)
            .single();
            
        if (rewardRule) {
            reward = rewardRule.diamond_reward;
        }

        // Update 'users'
        await supabase.from('users').update({ 
            consecutive_check_ins: newStreak, 
            last_check_in: todayISO
        }).eq('id', user.id);

        // Insert 'daily_check_ins'
        await supabase.from('daily_check_ins').insert({
            user_id: user.id,
            check_in_date: dateOnly
        }).catch(e => console.warn("Log checkin failed", e));
        
        // Track 'daily_active_users' (Composite Key upsert)
        await supabase.from('daily_active_users').upsert({
            user_id: user.id,
            activity_date: dateOnly
        }).catch(e => console.warn("Log DAU failed", e));
    }
    
    await updateUserBalance(reward, `Checkin Day ${newStreak}`, 'reward');
    return { success: true, reward, newStreak };
};

// --- TRANSACTION SERVICES ---

export const createPaymentLink = async (packageId: string): Promise<Transaction> => {
    const user = await getUserProfile();
    const pkgs = await getPackages();
    const pkg = pkgs.find(p => p.id === packageId);
    if (!pkg) throw new Error("Package not found");

    const orderCode = Math.floor(Date.now() / 1000); // Use timestamp as order code (int8)

    // Calculate Bonus logic: Priority Active Campaign > Package Promo
    const activeCampaign = await getActivePromotion();
    const activeBonusPercent = activeCampaign ? activeCampaign.bonusPercent : pkg.bonusPercent;
    
    // Calculate total coins
    const baseCoins = pkg.coin;
    const bonusCoins = Math.floor(baseCoins * (activeBonusPercent / 100));
    const totalCoins = baseCoins + bonusCoins;

    const newTx: Transaction = {
        id: crypto.randomUUID(),
        userId: user.id,
        packageId: pkg.id,
        amount: pkg.price,
        coins: totalCoins, // Use total coins with bonus
        status: 'pending',
        createdAt: new Date().toISOString(),
        paymentMethod: 'payos',
        code: `NAP${orderCode}`
    };

    if (supabase && user.id.length > 20) {
        await supabase.from('transactions').insert({
            id: newTx.id,
            user_id: user.id,
            package_id: pkg.id,
            amount_vnd: pkg.price, // Map 'amount_vnd'
            diamonds_received: totalCoins, // Map 'diamonds_received' (Base + Bonus)
            status: 'pending',
            order_code: orderCode, // Map 'order_code'
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

export const adminApproveTransaction = async (txId: string): Promise<boolean> => {
    if (supabase) {
        const { data: tx } = await supabase.from('transactions').select('*').eq('id', txId).single();
        if (tx && tx.status === 'pending') {
            await supabase.from('transactions').update({ status: 'paid' }).eq('id', txId);
            
            const { data: user } = await supabase.from('users').select('diamonds').eq('id', tx.user_id).single();
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
            return true;
        }
    }
    return false;
};

export const adminRejectTransaction = async (txId: string): Promise<boolean> => {
    if (supabase) {
        await supabase.from('transactions').update({ status: 'cancelled' }).eq('id', txId);
        return true;
    }
    return false;
};

export const deleteTransaction = async (txId: string): Promise<{success: boolean, error?: string}> => {
    if (supabase) {
        try {
            const { error } = await supabase.from('transactions').delete().eq('id', txId);
            if (error) throw error;
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
    
    // Default stats if DB is empty or fails
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
        // 1. Fetch Users (List for Table + Count for Stats)
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

        // 2. Fetch Transactions
        const { data: t } = await supabase.from('transactions').select('*');
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

        // 3. REALTIME DASHBOARD STATS CALCULATION
        const todayStr = new Date().toISOString().split('T')[0];
        
        // Count New Users Today
        const newUsersCount = users.filter((u:any) => u.createdAt && u.createdAt.startsWith(todayStr)).length;
        
        // Count Images (Total & Today) from 'generated_images' table
        const { count: totalImgs } = await supabase.from('generated_images').select('*', { count: 'exact', head: true });
        const { count: todayImgs } = await supabase.from('generated_images').select('*', { count: 'exact', head: true }).gte('created_at', todayStr);

        // Count "Visits" (Approximation via daily_active_users table)
        const { count: visitsToday } = await supabase.from('daily_active_users').select('*', { count: 'exact', head: true }).eq('activity_date', todayStr);
        // Total visits is harder without a full log, we'll approximate or use total rows in DAU
        const { count: visitsTotal } = await supabase.from('daily_active_users').select('*', { count: 'exact', head: true });

        // Calculate Revenue from PAID transactions
        const revenue = txs.filter((t:any) => t.status === 'paid').reduce((sum:number, t:any) => sum + t.amount, 0);

        dashboardStats = {
            visitsToday: visitsToday || 0,
            visitsTotal: visitsTotal || 0,
            newUsersToday: newUsersCount,
            usersTotal: totalUsers || users.length,
            imagesToday: todayImgs || 0,
            imagesTotal: totalImgs || 0,
            aiUsage: [
                { feature: 'All Tools', flash: 0, pro: 0, vcoins: 0, revenue: revenue }
            ]
        };
    }

    return {
        dashboard: dashboardStats,
        revenue: dashboardStats.aiUsage[0].revenue,
        transactions: txs,
        logs: [],
        usersList: users,
        packages: await getPackages(false), // PASS FALSE TO FETCH ALL (INCL INACTIVE)
        promotions: await getAllPromotions(), // Fetch list for admin
        activePromotion: await getActivePromotion(), // Fetch single active for logic
        giftcodes: await getGiftcodes()
    };
};

export const getPromotionConfig = getActivePromotion;
