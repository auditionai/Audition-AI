
import { CreditPackage, Transaction, UserProfile, CheckinConfig, DiamondLog, TransactionStatus, PromotionConfig, Giftcode } from '../types';
import { supabase } from './supabaseClient';

// --- LOCAL STORAGE HELPERS (Fallback) ---
const getStorage = (key: string) => JSON.parse(localStorage.getItem(key) || 'null');
const setStorage = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

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
  { id: 'pkg_1', name: "Gói Khởi Động", coin: 10, price: 10000, currency: 'VND', bonusText: "+0%", colorTheme: "border-slate-600", transferContent: "NAP 10K" },
  { id: 'pkg_2', name: "Gói Sáng Tạo", coin: 50, price: 50000, currency: 'VND', bonusText: "+10%", isPopular: true, colorTheme: "border-audi-cyan", transferContent: "NAP 50K" },
  { id: 'pkg_3', name: "Gói Chuyên Nghiệp", coin: 100, price: 100000, currency: 'VND', bonusText: "+20%", colorTheme: "border-audi-purple", transferContent: "NAP 100K" },
  { id: 'pkg_4', name: "Gói Trùm Cuối", coin: 500, price: 500000, currency: 'VND', bonusText: "+50%", colorTheme: "border-audi-pink", transferContent: "NAP 500K" },
];

// --- SYSTEM CONFIG (API KEY) SERVICES ---

export const getSystemApiKey = async (): Promise<string | null> => {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'gemini_api_key')
                .single();
            
            if (!error && data) {
                return typeof data.value === 'object' ? data.value.key : data.value;
            }
        } catch (e) {
            console.warn("Could not fetch API Key from DB");
        }
    }
    const metaEnv = (import.meta as any).env || {};
    return metaEnv.VITE_GEMINI_API_KEY || process.env.API_KEY || null;
};

export const saveSystemApiKey = async (apiKey: string): Promise<boolean> => {
    if (supabase) {
        try {
            const { error } = await supabase
                .from('system_settings')
                .upsert({ key: 'gemini_api_key', value: apiKey }, { onConflict: 'key' });
            if (error) throw error;
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
    // 1. Try Supabase Auth
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            try {
                // SỬA: Dùng select('*') để an toàn nhất, tránh lỗi 400 nếu thiếu cột
                const { data: profile, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (!error && profile) {
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
                } else {
                    // Profile missing -> Create new
                    // SỬA: Sửa lại logic insert để tránh lỗi TypeError
                    console.log("Profile not found in 'users', creating new...");
                    
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
                    
                    // Thực hiện insert không dùng .catch() kiểu cũ
                    const { error: insertError } = await supabase.from('users').insert(newProfile);
                    
                    if (insertError) {
                        console.error("FAILED to create user profile in DB:", insertError);
                        // Nếu lỗi do RLS (Policy), vẫn trả về object tạm để user dùng được app
                    } else {
                        console.log("User profile created successfully!");
                    }

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

    // 2. Fallback Local
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

    if (supabase && user.id.length > 20) { // Check if valid UUID-like ID
        // Update 'diamonds' column
        const { error } = await supabase.from('users').update({ diamonds: newBalance }).eq('id', user.id);
        
        if (!error) {
             // Log transaction
            await supabase.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount,
                reason,
                type: type || 'usage',
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

export const getPackages = async (): Promise<CreditPackage[]> => {
    if (supabase) {
        const { data, error } = await supabase.from('credit_packages').select('*');
        if (!error && data && data.length > 0) {
            return data.map((p: any) => ({
                id: p.id,
                name: p.name || 'Gói Vcoin',
                coin: p.diamonds || p.coin || 0, 
                price: p.price || 0,
                currency: p.currency || 'VND',
                bonusText: p.bonus_text || '',
                isPopular: p.is_popular || false,
                colorTheme: p.color_theme || 'border-audi-cyan',
                transferContent: p.transfer_syntax || `NAP ${p.price}`
            }));
        }
    }
    return DEFAULT_PACKAGES;
};

export const savePackage = async (pkg: CreditPackage): Promise<void> => {
    if (supabase) {
        await supabase.from('credit_packages').upsert({
            id: pkg.id,
            name: pkg.name,
            diamonds: pkg.coin,
            price: pkg.price,
            currency: pkg.currency,
            bonus_text: pkg.bonusText,
            is_popular: pkg.isPopular,
            color_theme: pkg.colorTheme,
            transfer_syntax: pkg.transferContent
        });
    }
};

export const deletePackage = async (id: string): Promise<void> => {
    if (supabase) {
        await supabase.from('credit_packages').delete().eq('id', id);
    }
};

// --- GIFTCODE SERVICES ---

export const getGiftcodes = async (): Promise<Giftcode[]> => {
    if (supabase) {
        const { data } = await supabase.from('gift_codes').select('*');
        if (data) {
            return data.map((d: any) => ({
                id: d.id,
                code: d.code,
                reward: d.reward_amount || d.reward,
                totalLimit: d.usage_limit || d.total_limit,
                usedCount: d.times_used || d.used_count,
                maxPerUser: d.limit_per_user || d.max_per_user || 1,
                isActive: d.is_active,
                expiresAt: d.expires_at
            }));
        }
    }
    return getStorage('dmp_giftcodes') || [];
};

export const saveGiftcode = async (giftcode: Giftcode): Promise<void> => {
    if (supabase) {
        await supabase.from('gift_codes').upsert({
             id: giftcode.id,
             code: giftcode.code,
             reward_amount: giftcode.reward,
             usage_limit: giftcode.totalLimit,
             times_used: giftcode.usedCount,
             limit_per_user: giftcode.maxPerUser,
             is_active: giftcode.isActive,
             expires_at: giftcode.expiresAt
        });
    }
};

export const deleteGiftcode = async (id: string): Promise<void> => {
    if (supabase) {
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
        
        const usageLimit = codeData.usage_limit || codeData.total_limit || 0;
        const timesUsed = codeData.times_used || codeData.used_count || 0;
        const reward = codeData.reward_amount || codeData.reward || 0;

        if (timesUsed >= usageLimit) return { success: false, message: 'Mã đã hết lượt dùng' };

        // Check if redeemed
        const { data: redeemed } = await supabase
            .from('redeemed_gift_codes')
            .select('*')
            .eq('user_id', user.id)
            .eq('gift_code_id', codeData.id)
            .single();
            
        if (redeemed) return { success: false, message: 'Bạn đã dùng mã này rồi' };

        await updateUserBalance(reward, `Giftcode: ${normalizedCode}`, 'giftcode');
        
        // Update DB
        await supabase.from('gift_codes').update({ times_used: timesUsed + 1 }).eq('id', codeData.id);
        await supabase.from('redeemed_gift_codes').insert({
            user_id: user.id,
            gift_code_id: codeData.id,
            redeemed_at: new Date().toISOString(),
            reward_amount: reward
        });
        
        return { success: true, message: 'Thành công', reward: reward };
    }
    return { success: false, message: 'Vui lòng đăng nhập' };
};

// --- PROMOTION SERVICES ---

export const getPromotionConfig = async (): Promise<PromotionConfig> => {
    if (supabase) {
        const { data } = await supabase.from('system_settings').select('value').eq('key', 'promotion_config').single();
        if (data) return data.value;
    }
    return getStorage('dmp_promotion') || {
        isActive: true,
        marqueeText: "🎉 Chào mừng đến với DMP AI Studio!",
        bonusPercent: 0,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString()
    };
};

export const savePromotionConfig = async (config: PromotionConfig): Promise<void> => {
    if (supabase) {
        await supabase.from('system_settings').upsert({ key: 'promotion_config', value: config });
    }
    setStorage('dmp_promotion', config);
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
    const reward = 5; 
    
    if (supabase && user.id.length > 20) {
        const todayISO = new Date().toISOString();
        
        // Update using correct columns
        await supabase.from('users').update({ 
            consecutive_check_ins: newStreak, 
            last_check_in: todayISO
        }).eq('id', user.id);

        await supabase.from('daily_check_ins').insert({
            user_id: user.id,
            check_in_date: todayISO,
            reward_amount: reward
        }).catch(e => console.warn("Log checkin failed", e));
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

    const newTx: Transaction = {
        id: crypto.randomUUID(),
        userId: user.id,
        packageId: pkg.id,
        amount: pkg.price,
        coins: pkg.coin,
        status: 'pending',
        createdAt: new Date().toISOString(),
        paymentMethod: 'payos',
        code: `${pkg.transferContent?.split(' ')[0] || 'NAP'} ${Math.floor(10000 + Math.random() * 90000)}`
    };

    if (supabase && user.id.length > 20) {
        await supabase.from('transactions').insert({
            id: newTx.id,
            user_id: user.id,
            package_id: pkg.id,
            amount: pkg.price,
            coins: pkg.coin,
            status: 'pending',
            code: newTx.code,
            created_at: newTx.createdAt
        });
    }

    return newTx;
};

// --- ADMIN SERVICES ---

export const updateAdminUserProfile = async (updatedUser: UserProfile): Promise<UserProfile> => {
    if(supabase) {
        // Correct columns for update
        await supabase.from('users').update({
            diamonds: updatedUser.balance,
            display_name: updatedUser.username
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
                // Update 'diamonds'
                await supabase.from('users').update({ diamonds: currentBalance + tx.coins }).eq('id', tx.user_id);
                
                await supabase.from('diamond_transactions_log').insert({
                    user_id: tx.user_id,
                    amount: tx.coins,
                    reason: `Deposit: ${tx.code}`,
                    type: 'topup',
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

export const mockPayOSSuccess = async (txId: string) => {
    return adminApproveTransaction(txId);
};

export const getAdminStats = async () => {
    let users = [], txs = [];
    
    if (supabase) {
        // Fetch users using exact columns
        const { data: u } = await supabase.from('users').select('id, display_name, email, photo_url, diamonds, is_admin');
        if(u) {
            users = u.map((p: any) => ({
                id: p.id,
                username: p.display_name || 'User',
                email: p.email,
                avatar: p.photo_url || MOCK_USER.avatar,
                balance: p.diamonds || 0,
                role: p.is_admin ? 'admin' : 'user'
            }));
        }
        
        const { data: t } = await supabase.from('transactions').select('*');
        if(t) txs = t.map((row:any) => ({...row, userId: row.user_id, packageId: row.package_id, createdAt: row.created_at}));
    }

    return {
        dashboard: {
            visitsToday: 150,
            visitsTotal: 12500,
            newUsersToday: 5,
            usersTotal: users.length,
            imagesToday: 24,
            imagesTotal: 1800,
            aiUsage: [
                { feature: 'Single Image', flash: 5000, pro: 20, vcoins: 5200, revenue: 5200000 }
            ]
        },
        revenue: 0,
        transactions: txs,
        logs: [],
        usersList: users,
        packages: await getPackages(),
        promotion: await getPromotionConfig(),
        giftcodes: await getGiftcodes()
    };
};
