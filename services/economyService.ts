
import { CreditPackage, Transaction, UserProfile, CheckinConfig, DiamondLog, TransactionStatus, PromotionConfig, Giftcode } from '../types';
import { supabase } from './supabaseClient';

// --- LOCAL STORAGE HELPERS (Fallback) ---
const getStorage = (key: string) => JSON.parse(localStorage.getItem(key) || 'null');
const setStorage = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

// --- HELPER: CHECK UUID ---
const isValidUUID = (id: string) => {
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
  { id: 'pkg_1', name: "Gói Khởi Động", coin: 10, price: 10000, currency: 'VND', bonusText: "+0%", colorTheme: "border-slate-600", transferContent: "NAP 10K" },
];

// --- SYSTEM CONFIG (API KEY) SERVICES ---

export const getSystemApiKey = async (): Promise<string | null> => {
    if (supabase) {
        try {
            // 1. Try fetching from dedicated 'api_keys' table
            // Only select necessary column to avoid large data transfer
            const { data, error } = await supabase
                .from('api_keys')
                .select('key_value')
                .order('created_at', { ascending: false }) // Get the latest key regardless of status logic initially
                .limit(1)
                .single();
            
            if (data && data.key_value) {
                return data.key_value;
            }

            if (error) console.warn("[System] Failed to fetch from api_keys:", error.message);

            // 2. Fallback to 'system_settings' (legacy)
            const { data: setting } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'gemini_api_key')
                .single();
            
            if (setting) {
                return typeof setting.value === 'object' ? setting.value.key : setting.value;
            }
        } catch (e) {
            console.warn("Could not fetch API Key from DB", e);
        }
    }
    const metaEnv = (import.meta as any).env || {};
    return metaEnv.VITE_GEMINI_API_KEY || process.env.API_KEY || null;
};

export const saveSystemApiKey = async (apiKey: string): Promise<boolean> => {
    if (supabase) {
        try {
            // Insert into api_keys table
            const { error } = await supabase
                .from('api_keys')
                .insert({
                    name: 'Admin Key ' + new Date().toISOString(),
                    key_value: apiKey,
                    status: 'active',
                    usage_count: 0
                });
            
            // Also update system_settings for backward compatibility
            await supabase
                .from('system_settings')
                .upsert({ key: 'gemini_api_key', value: apiKey }, { onConflict: 'key' });

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

export const getPackages = async (): Promise<CreditPackage[]> => {
    if (supabase) {
        // Fetch from 'credit_packages'
        const { data, error } = await supabase
            .from('credit_packages')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (!error && data && data.length > 0) {
            return data.map((p: any) => ({
                id: p.id,
                name: p.name || 'Gói Vcoin',
                coin: p.credits_amount || 0, // Map 'credits_amount'
                price: p.price_vnd || 0, // Map 'price_vnd'
                currency: 'VND',
                bonusText: p.tag || '', // Store bonus text in tag or handle separated logic
                isPopular: p.is_featured || false, // Map 'is_featured'
                colorTheme: p.is_featured ? 'border-audi-pink' : 'border-slate-600', 
                transferContent: `NAP ${p.price_vnd}` // Auto gen syntax
            }));
        }
    }
    return DEFAULT_PACKAGES;
};

export const savePackage = async (pkg: CreditPackage): Promise<void> => {
    if (supabase) {
        const payload = {
            name: pkg.name,
            credits_amount: pkg.coin,
            price_vnd: pkg.price,
            tag: pkg.bonusText, 
            is_featured: pkg.isPopular,
            is_active: true,
            display_order: 0,
            bonus_credits: 0 
        };

        if (isValidUUID(pkg.id)) {
            // Update existing
            await supabase.from('credit_packages').update(payload).eq('id', pkg.id);
        } else {
            // Insert new (let DB generate UUID)
            await supabase.from('credit_packages').insert(payload);
        }
    }
};

export const deletePackage = async (id: string): Promise<void> => {
    if (supabase && isValidUUID(id)) {
        await supabase.from('credit_packages').delete().eq('id', id);
    }
};

// --- GIFTCODE SERVICES ---

export const getGiftcodes = async (): Promise<Giftcode[]> => {
    if (supabase) {
        const { data } = await supabase.from('gift_codes').select('*').order('created_at', { ascending: false });
        if (data) {
            return data.map((d: any) => ({
                id: d.id,
                code: d.code,
                reward: d.diamond_reward, // Map 'diamond_reward'
                totalLimit: d.usage_limit, // Map 'usage_limit'
                usedCount: d.usage_count, // Map 'usage_count'
                maxPerUser: 1, // Default, logic not in schema
                isActive: d.is_active,
                expiresAt: d.created_at // Or another field if added
            }));
        }
    }
    return getStorage('dmp_giftcodes') || [];
};

export const saveGiftcode = async (giftcode: Giftcode): Promise<void> => {
    if (supabase) {
        const payload = {
             code: giftcode.code,
             diamond_reward: giftcode.reward,
             usage_limit: giftcode.totalLimit,
             usage_count: giftcode.usedCount,
             is_active: giftcode.isActive
        };

        if (isValidUUID(giftcode.id)) {
            // Update existing
            await supabase.from('gift_codes').update(payload).eq('id', giftcode.id);
        } else {
            // Insert new (ID will be auto-generated by DB)
            await supabase.from('gift_codes').insert(payload);
        }
    }
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
        
        // 2. Check Limits
        if (codeData.usage_count >= codeData.usage_limit) return { success: false, message: 'Mã đã hết lượt dùng' };

        // 3. Check Redeemed History in 'redeemed_gift_codes'
        const { data: redeemed } = await supabase
            .from('redeemed_gift_codes')
            .select('*')
            .eq('user_id', user.id)
            .eq('gift_code_id', codeData.id)
            .single();
            
        if (redeemed) return { success: false, message: 'Bạn đã dùng mã này rồi' };

        // 4. Update Balance
        const reward = codeData.diamond_reward;
        await updateUserBalance(reward, `Giftcode: ${normalizedCode}`, 'giftcode');
        
        // 5. Update Code Usage
        await supabase.from('gift_codes').update({ usage_count: codeData.usage_count + 1 }).eq('id', codeData.id);
        
        // 6. Record Redemption
        await supabase.from('redeemed_gift_codes').insert({
            user_id: user.id,
            gift_code_id: codeData.id,
            redeemed_at: new Date().toISOString()
        });
        
        return { success: true, message: 'Thành công', reward: reward };
    }
    return { success: false, message: 'Vui lòng đăng nhập' };
};

// --- PROMOTION SERVICES ---

export const getPromotionConfig = async (): Promise<PromotionConfig> => {
    if (supabase) {
        // Fetch active promotion from 'promotions' table
        const { data } = await supabase
            .from('promotions')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (data) {
            return {
                isActive: data.is_active,
                marqueeText: data.description || "Chào mừng!",
                bonusPercent: data.bonus_percent || 0,
                startTime: data.start_time,
                endTime: data.end_time
            };
        }
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
        const payload = {
            title: "Khuyến mãi đặc biệt",
            description: config.marqueeText,
            bonus_percent: config.bonusPercent,
            start_time: config.startTime,
            end_time: config.endTime,
            is_active: config.isActive
        };

        // Check if there is ANY active promotion record we should update, or insert new
        const { data: existing } = await supabase
            .from('promotions')
            .select('id')
            .eq('is_active', true)
            .limit(1)
            .single();

        if (existing) {
            await supabase.from('promotions').update(payload).eq('id', existing.id);
        } else {
            await supabase.from('promotions').insert(payload);
        }
        
        // Fallback sync to system_settings for marquee legacy
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

    const newTx: Transaction = {
        id: crypto.randomUUID(),
        userId: user.id,
        packageId: pkg.id,
        amount: pkg.price,
        coins: pkg.coin,
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
            diamonds_received: pkg.coin, // Map 'diamonds_received'
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

export const mockPayOSSuccess = async (txId: string) => {
    return adminApproveTransaction(txId);
};

export const getAdminStats = async () => {
    let users = [], txs = [];
    
    if (supabase) {
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
