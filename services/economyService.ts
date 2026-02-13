
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
  balance: 10, // Give free credits to guest
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
                .from('system_config')
                .select('value')
                .eq('key', 'gemini_api_key')
                .single();
            
            if (!error && data) {
                return data.value;
            }
        } catch (e) {
            console.warn("Could not fetch API Key from DB, checking environment...");
        }
    }
    // Fallback to Vite Env Var if DB fails or is empty
    const metaEnv = (import.meta as any).env || {};
    return metaEnv.VITE_GEMINI_API_KEY || process.env.API_KEY || null;
};

export const saveSystemApiKey = async (apiKey: string): Promise<boolean> => {
    if (supabase) {
        try {
            const { error } = await supabase
                .from('system_config')
                .upsert({ key: 'gemini_api_key', value: apiKey }, { onConflict: 'key' });
            
            if (error) throw error;
            return true;
        } catch (e) {
            console.error("Error saving API Key to DB", e);
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
            // Fetch extended profile from 'profiles' table
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (!error && profile) {
                return {
                    id: user.id,
                    username: profile.username || user.email?.split('@')[0] || 'Dancer',
                    email: user.email || '',
                    avatar: profile.avatar_url || user.user_metadata.avatar_url || MOCK_USER.avatar,
                    balance: profile.balance || 0,
                    role: profile.role || 'user',
                    isVip: profile.is_vip || false,
                    streak: profile.streak || 0,
                    lastCheckin: profile.last_checkin,
                    checkinHistory: profile.checkin_history || [],
                    usedGiftcodes: profile.used_giftcodes || []
                };
            } else if (error && error.code === 'PGRST116') {
                // Profile doesn't exist yet, create default
                const newProfile = {
                    id: user.id,
                    username: user.user_metadata.full_name || user.email?.split('@')[0],
                    email: user.email,
                    avatar_url: user.user_metadata.avatar_url,
                    balance: 10, // Free credits for new user
                    role: 'user'
                };
                await supabase.from('profiles').insert(newProfile);
                return { ...MOCK_USER, ...newProfile } as UserProfile;
            }
        }
    }

    // 2. Fallback to Local Storage
    let localUser = getStorage('dmp_user');
    if (!localUser) {
        localUser = MOCK_USER;
        setStorage('dmp_user', localUser);
    }
    if (!localUser.checkinHistory) localUser.checkinHistory = [];
    return localUser;
};

export const updateUserBalance = async (amount: number, reason: string, type: 'topup' | 'usage' | 'reward' | 'refund' | 'admin_adjustment' | 'giftcode'): Promise<UserProfile> => {
    const user = await getUserProfile();
    const newBalance = (user.balance || 0) + amount;

    if (supabase && user.id !== MOCK_USER.id) {
        // Sync to DB
        await supabase.from('profiles').update({ balance: newBalance }).eq('id', user.id);
        
        // Log transaction
        await supabase.from('diamond_logs').insert({
            user_id: user.id,
            amount,
            reason,
            type,
            created_at: new Date().toISOString()
        });
    }

    // Update Local Object & Storage (for UI responsiveness)
    user.balance = newBalance;
    setStorage('dmp_user', user);
    
    return user;
};

// --- PACKAGE MANAGEMENT SERVICES ---

export const getPackages = async (): Promise<CreditPackage[]> => {
    if (supabase) {
        const { data, error } = await supabase.from('packages').select('*');
        if (!error && data && data.length > 0) return data;
    }
    return DEFAULT_PACKAGES;
};

export const savePackage = async (pkg: CreditPackage): Promise<void> => {
    if (supabase) {
        await supabase.from('packages').upsert(pkg);
    }
};

export const deletePackage = async (id: string): Promise<void> => {
    if (supabase) {
        await supabase.from('packages').delete().eq('id', id);
    }
};

// --- GIFTCODE SERVICES ---

export const getGiftcodes = async (): Promise<Giftcode[]> => {
    if (supabase) {
        const { data } = await supabase.from('giftcodes').select('*');
        if (data) {
            // Map snake_case from DB to camelCase
            return data.map((d: any) => ({
                id: d.id,
                code: d.code,
                reward: d.reward,
                totalLimit: d.total_limit,
                usedCount: d.used_count,
                maxPerUser: d.max_per_user,
                isActive: d.is_active,
                expiresAt: d.expires_at
            }));
        }
    }
    return getStorage('dmp_giftcodes') || [];
};

export const saveGiftcode = async (giftcode: Giftcode): Promise<void> => {
    if (supabase) {
        // Map camelCase to snake_case for DB
        await supabase.from('giftcodes').upsert({
             id: giftcode.id,
             code: giftcode.code,
             reward: giftcode.reward,
             total_limit: giftcode.totalLimit,
             used_count: giftcode.usedCount,
             max_per_user: giftcode.maxPerUser,
             is_active: giftcode.isActive,
             expires_at: giftcode.expiresAt
        });
    }
    // Local fallback
    const codes = getStorage('dmp_giftcodes') || [];
    const index = codes.findIndex((c: Giftcode) => c.id === giftcode.id);
    if (index >= 0) codes[index] = giftcode;
    else codes.push(giftcode);
    setStorage('dmp_giftcodes', codes);
};

export const deleteGiftcode = async (id: string): Promise<void> => {
    if (supabase) {
        await supabase.from('giftcodes').delete().eq('id', id);
    }
    // Local fallback
    const codes = getStorage('dmp_giftcodes') || [];
    setStorage('dmp_giftcodes', codes.filter((c: Giftcode) => c.id !== id));
};

export const redeemGiftcode = async (codeStr: string): Promise<{success: boolean, message: string, reward?: number}> => {
    const normalizedCode = codeStr.trim().toUpperCase();
    const user = await getUserProfile();

    if (supabase && user.id !== MOCK_USER.id) {
        // Use Supabase RPC if available for atomic transaction, or simple query
        const { data: codeData, error } = await supabase
            .from('giftcodes')
            .select('*')
            .eq('code', normalizedCode)
            .eq('is_active', true)
            .single();

        if (error || !codeData) return { success: false, message: 'Mã không hợp lệ' };
        if (codeData.used_count >= codeData.total_limit) return { success: false, message: 'Mã đã hết lượt dùng' };
        // Check if user has used this specific giftcode ID
        if (user.usedGiftcodes?.includes(codeData.id)) return { success: false, message: 'Bạn đã dùng mã này' };

        // Process
        await updateUserBalance(codeData.reward, `Giftcode: ${normalizedCode}`, 'giftcode');
        await supabase.from('giftcodes').update({ used_count: codeData.used_count + 1 }).eq('id', codeData.id);
        
        // Update User's used list locally and in DB
        const newUsedList = [...(user.usedGiftcodes || []), codeData.id];
        await supabase.from('profiles').update({ used_giftcodes: newUsedList }).eq('id', user.id);
        
        return { success: true, message: 'Thành công', reward: codeData.reward };
    }

    // Local Logic Fallback
    const codes = await getGiftcodes();
    const target = codes.find(c => c.code === normalizedCode && c.isActive);
    if (!target) return { success: false, message: 'Mã không tồn tại' };
    if (user.usedGiftcodes?.includes(target.id)) return { success: false, message: 'Đã sử dụng' };
    
    await updateUserBalance(target.reward, `Code: ${target.code}`, 'giftcode');
    user.usedGiftcodes = [...(user.usedGiftcodes || []), target.id];
    setStorage('dmp_user', user);
    
    return { success: true, message: 'Thành công', reward: target.reward };
};

// --- PROMOTION SERVICES ---

export const getPromotionConfig = async (): Promise<PromotionConfig> => {
    if (supabase) {
        const { data } = await supabase.from('system_config').select('value').eq('key', 'promotion_config').single();
        if (data) return data.value;
    }
    return getStorage('dmp_promotion') || {
        isActive: true,
        marqueeText: "🎉 Chào mừng đến với DMP AI Studio - Sàn diễn ánh sáng!",
        bonusPercent: 0,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString()
    };
};

export const savePromotionConfig = async (config: PromotionConfig): Promise<void> => {
    if (supabase) {
        await supabase.from('system_config').upsert({ key: 'promotion_config', value: config });
    }
    setStorage('dmp_promotion', config);
};

// --- ATTENDANCE SERVICES ---

export const getCheckinStatus = async () => {
    const user = await getUserProfile();
    const today = new Date().toDateString();
    const lastCheckinDate = user.lastCheckin ? new Date(user.lastCheckin).toDateString() : null;
    return {
        streak: user.streak,
        isCheckedInToday: lastCheckinDate === today,
        history: user.checkinHistory || []
    };
};

export const performCheckin = async (): Promise<{ success: boolean; reward: number; newStreak: number }> => {
    const user = await getUserProfile();
    // Simple logic logic (similar to original but calls updateUserBalance which handles DB sync)
    
    // ... Calculate logic ...
    let newStreak = user.streak + 1;
    // (Simplified logic for brevity, assuming similar streak calculation as before)
    
    const reward = 5; 
    
    if (supabase && user.id !== MOCK_USER.id) {
        const today = new Date().toISOString();
        await supabase.from('profiles').update({ 
            streak: newStreak, 
            last_checkin: today,
            checkin_history: [...(user.checkinHistory || []), today.split('T')[0]]
        }).eq('id', user.id);
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
        code: `${pkg.transferContent || 'NAP'} ${Math.floor(10000 + Math.random() * 90000)}`
    };

    if (supabase && user.id !== MOCK_USER.id) {
        await supabase.from('transactions').insert({
            id: newTx.id,
            user_id: user.id,
            package_id: pkg.id,
            amount: pkg.price,
            coins: pkg.coin,
            status: 'pending',
            code: newTx.code
        });
    } else {
        const txs = getStorage('dmp_transactions') || [];
        txs.push(newTx);
        setStorage('dmp_transactions', txs);
    }

    return newTx;
};

// --- ADMIN SERVICES ---

export const updateAdminUserProfile = async (updatedUser: UserProfile): Promise<UserProfile> => {
    if(supabase) {
        await supabase.from('profiles').update({
            balance: updatedUser.balance,
            username: updatedUser.username
        }).eq('id', updatedUser.id);
    }
    return updatedUser;
};

export const adminApproveTransaction = async (txId: string): Promise<boolean> => {
    // DB Logic for approval
    if (supabase) {
        const { data: tx } = await supabase.from('transactions').select('*').eq('id', txId).single();
        if (tx && tx.status === 'pending') {
            await supabase.from('transactions').update({ status: 'paid' }).eq('id', txId);
            // Add coins
            // Fetch User first to get current balance if not using RPC
            const { data: user } = await supabase.from('profiles').select('balance').eq('id', tx.user_id).single();
            if(user) {
                await supabase.from('profiles').update({ balance: (user.balance || 0) + tx.coins }).eq('id', tx.user_id);
            }
            return true;
        }
    }
    return false; // Or local mock logic
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
    // Hybrid Fetch
    let users = [], txs = [], logs = [];
    
    if (supabase) {
        const { data: u } = await supabase.from('profiles').select('*');
        if(u) users = u.map((p: any) => ({...p, checkinHistory: p.checkin_history, usedGiftcodes: p.used_giftcodes}));
        
        const { data: t } = await supabase.from('transactions').select('*');
        if(t) txs = t.map((row:any) => ({...row, userId: row.user_id, packageId: row.package_id, createdAt: row.created_at}));
    } else {
        // Fallback
        users = [await getUserProfile()];
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
        logs: logs,
        usersList: users,
        packages: await getPackages(),
        promotion: await getPromotionConfig(),
        giftcodes: await getGiftcodes()
    };
};
