
import { CreditPackage, Transaction, UserProfile, CheckinConfig, DiamondLog, TransactionStatus, PromotionCampaign, Giftcode, HistoryItem } from '../types';
import { supabase } from './supabaseClient';

// --- MOCK DATA ---
const MOCK_USER: UserProfile = {
    id: 'user_123',
    username: 'Demo User',
    email: 'demo@dmp.ai',
    avatar: 'https://picsum.photos/100/100',
    balance: 1000,
    role: 'admin',
    isVip: true,
    streak: 0,
    lastCheckin: null,
    checkinHistory: []
};

const MOCK_PACKAGES: CreditPackage[] = [
    { id: 'pkg_1', name: 'Gói Khởi Động', coin: 20, price: 20000, currency: 'VND', bonusText: '', bonusPercent: 0, colorTheme: 'border-slate-600', transferContent: 'NAP 20K' },
    { id: 'pkg_2', name: 'Gói Cơ Bản', coin: 50, price: 50000, currency: 'VND', bonusText: 'Popular', bonusPercent: 5, isPopular: true, colorTheme: 'border-blue-500', transferContent: 'NAP 50K' },
    { id: 'pkg_3', name: 'Gói Nâng Cao', coin: 100, price: 100000, currency: 'VND', bonusText: 'Best Value', bonusPercent: 10, colorTheme: 'border-purple-500', transferContent: 'NAP 100K' },
    { id: 'pkg_4', name: 'Gói Chuyên Nghiệp', coin: 200, price: 200000, currency: 'VND', bonusText: 'Pro', bonusPercent: 20, colorTheme: 'border-pink-500', transferContent: 'NAP 200K' }
];

// --- CORE SERVICES ---

export const getUserProfile = async (): Promise<UserProfile> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data, error } = await supabase.from('users').select('*').eq('id', user.id).single();
            if (!error && data) {
                return {
                    id: data.id,
                    username: data.display_name || user.email?.split('@')[0] || 'User',
                    email: user.email || '',
                    avatar: data.photo_url || 'https://picsum.photos/100/100',
                    balance: data.diamonds || 0,
                    role: data.is_admin ? 'admin' : 'user',
                    isVip: data.is_vip || false,
                    streak: data.checkin_streak || 0,
                    lastCheckin: data.last_checkin_at || null,
                    checkinHistory: [] 
                };
            }
        }
    }
    return MOCK_USER;
};

export const getSystemApiKey = async (): Promise<string> => {
    if (supabase) {
        const { data, error } = await supabase.from('api_keys').select('key_value').eq('status', 'active').limit(1).single();
        if (!error && data) return data.key_value;
    }
    return process.env.API_KEY || "";
};

export const getPromotionConfig = async (): Promise<PromotionCampaign | null> => {
     return await getActivePromotion();
};

export const getCheckinStatus = async (): Promise<{ streak: number, isCheckedInToday: boolean, history: string[] }> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
             const { data } = await supabase.from('users').select('checkin_streak, last_checkin_at').eq('id', user.id).single();
             if (data) {
                 const last = data.last_checkin_at ? new Date(data.last_checkin_at).toISOString().split('T')[0] : null;
                 const today = new Date().toISOString().split('T')[0];
                 return {
                     streak: data.checkin_streak || 0,
                     isCheckedInToday: last === today,
                     history: last ? [last] : [] 
                 };
             }
        }
    }
    return { streak: 0, isCheckedInToday: false, history: [] };
};

export const performCheckin = async (): Promise<{ success: boolean, newStreak: number, reward: number }> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // Optimistic response, assuming backend handles the logic via RPC or Edge Function
            // Or simple implementation:
            const { data } = await supabase.from('users').select('checkin_streak').eq('id', user.id).single();
            const currentStreak = data?.checkin_streak || 0;
            const newStreak = currentStreak + 1;
            
            await supabase.from('users').update({
                checkin_streak: newStreak,
                last_checkin_at: new Date().toISOString(),
                diamonds: (await getUserProfile()).balance + 10 // Simple reward
            }).eq('id', user.id);
            
            return { success: true, newStreak, reward: 10 };
        }
    }
    return { success: true, newStreak: 1, reward: 10 };
}

export const updateUserBalance = async (amount: number, reason: string, type: 'usage' | 'topup' | 'reward' | 'refund' | 'giftcode' | 'admin_adjustment' = 'usage'): Promise<boolean> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // This should ideally be a stored procedure to be safe
            // For now, client-side adjustment (not secure for production but works for demo)
            const { data: profile } = await supabase.from('users').select('diamonds').eq('id', user.id).single();
            const current = profile?.diamonds || 0;
            const newBalance = current + amount;

            const { error } = await supabase.from('users').update({ diamonds: newBalance }).eq('id', user.id);
            
            if (!error) {
                // Log it
                await supabase.from('diamond_transactions_log').insert({
                    user_id: user.id,
                    amount: amount,
                    description: reason,
                    transaction_type: type,
                });
                return true;
            }
        }
    }
    return true; // Mock success
}

export const logVisit = async (): Promise<void> => {
    // Analytics placeholder
};

// --- ADMIN ---

export const getAdminStats = async (): Promise<any> => {
     if (!supabase) return null;
     
     // Fetch real data counts
     const { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
     const { count: imagesCount } = await supabase.from('generated_images').select('*', { count: 'exact', head: true });
     const { data: users } = await supabase.from('users').select('*').limit(50);
     const { data: txs } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(50);
     const { data: promos } = await supabase.from('promotions').select('*');
     const { data: gifts } = await supabase.from('gift_codes').select('*');
     const { data: pkgs } = await supabase.from('credit_packages').select('*').order('display_order', { ascending: true });

     return {
         dashboard: { 
             visitsToday: 100, // Mock
             visitsTotal: 5000, // Mock
             newUsersToday: 5, // Mock
             usersTotal: usersCount || 0, 
             imagesToday: 20, // Mock
             imagesTotal: imagesCount || 0 
         },
         usersList: users?.map(u => ({
             id: u.id,
             username: u.display_name,
             email: u.email || 'user@example.com', // Email might not be in users table depending on schema
             avatar: u.photo_url,
             balance: u.diamonds,
             role: u.is_admin ? 'admin' : 'user',
             isVip: u.is_vip,
             lastCheckin: u.last_checkin_at
         })) || [],
         packages: pkgs?.map(p => ({
             id: p.id,
             name: p.name,
             coin: p.coins,
             price: p.price,
             currency: 'VND',
             bonusText: p.bonus_text,
             bonusPercent: p.bonus_percent,
             isPopular: p.is_popular,
             isActive: p.is_active,
             colorTheme: p.color_theme || 'border-slate-500',
             transferContent: p.transfer_syntax
         })) || MOCK_PACKAGES,
         promotions: promos?.map(p => ({
             id: p.id,
             name: p.title,
             marqueeText: p.description,
             bonusPercent: p.bonus_percent,
             startTime: p.start_time,
             endTime: p.end_time,
             isActive: p.is_active
         })) || [],
         giftcodes: gifts?.map(g => ({
             id: g.id,
             code: g.code,
             reward: g.reward_amount,
             totalLimit: g.usage_limit,
             usedCount: g.times_used,
             maxPerUser: 1,
             isActive: g.is_active
         })) || [],
         transactions: txs?.map(t => ({
             id: t.id,
             userId: t.user_id,
             packageId: 'pkg',
             amount: t.amount,
             coins: t.diamonds_received,
             status: t.status,
             createdAt: t.created_at,
             paymentMethod: 'payos',
             code: t.order_code
         })) || []
     };
};

export const savePackage = async (pkg: CreditPackage): Promise<{ success: boolean, error?: string }> => {
    if (supabase) {
        const payload = {
            name: pkg.name,
            coins: pkg.coin,
            price: pkg.price,
            bonus_text: pkg.bonusText,
            bonus_percent: pkg.bonusPercent,
            is_popular: pkg.isPopular,
            is_active: pkg.isActive,
            color_theme: pkg.colorTheme,
            transfer_syntax: pkg.transferContent,
            display_order: pkg.displayOrder
        };

        if (pkg.id.startsWith('temp_')) {
            const { error } = await supabase.from('credit_packages').insert(payload);
            if (error) return { success: false, error: error.message };
        } else {
            const { error } = await supabase.from('credit_packages').update(payload).eq('id', pkg.id);
            if (error) return { success: false, error: error.message };
        }
        return { success: true };
    }
    return { success: true };
};

export const deletePackage = async (id: string): Promise<{ success: boolean, error?: string, action?: string }> => {
    if (supabase) {
        const { error } = await supabase.from('credit_packages').delete().eq('id', id);
        if (error) return { success: false, error: error.message };
        return { success: true };
    }
    return { success: true };
};

export const updatePackageOrder = async (packages: CreditPackage[]): Promise<{ success: boolean, error?: string }> => {
    // Logic to update order in DB
    return { success: true };
};

export const savePromotion = async (promo: PromotionCampaign): Promise<{ success: boolean, error?: string }> => {
     if (supabase) {
        const payload = {
            title: promo.name,
            description: promo.marqueeText,
            bonus_percent: promo.bonusPercent,
            start_time: promo.startTime,
            end_time: promo.endTime,
            is_active: promo.isActive
        };

        if (promo.id.startsWith('temp_')) {
            const { error } = await supabase.from('promotions').insert(payload);
            if (error) return { success: false, error: error.message };
        } else {
            const { error } = await supabase.from('promotions').update(payload).eq('id', promo.id);
            if (error) return { success: false, error: error.message };
        }
        return { success: true };
    }
    return { success: true };
};

export const deletePromotion = async (id: string): Promise<{ success: boolean, error?: string }> => {
     if (supabase) {
        const { error } = await supabase.from('promotions').delete().eq('id', id);
        if (error) return { success: false, error: error.message };
        return { success: true };
    }
    return { success: true };
};

export const getActivePromotion = async (): Promise<PromotionCampaign | null> => {
     if (supabase) {
        const now = new Date().toISOString();
        const { data } = await supabase.from('promotions')
            .select('*')
            .eq('is_active', true)
            .lte('start_time', now)
            .gte('end_time', now)
            .order('bonus_percent', { ascending: false })
            .limit(1)
            .single();
            
        if (data) {
            return {
                id: data.id,
                name: data.title,
                marqueeText: data.description,
                bonusPercent: data.bonus_percent,
                startTime: data.start_time,
                endTime: data.end_time,
                isActive: data.is_active
            };
        }
    }
    return null;
};

export const saveGiftcode = async (code: Giftcode): Promise<{ success: boolean, error?: string }> => {
    if (supabase) {
        const payload = {
            code: code.code,
            reward_amount: code.reward,
            usage_limit: code.totalLimit,
            is_active: code.isActive
        };

        if (code.id.startsWith('temp_')) {
            const { error } = await supabase.from('gift_codes').insert(payload);
            if (error) return { success: false, error: error.message };
        } else {
            const { error } = await supabase.from('gift_codes').update(payload).eq('id', code.id);
            if (error) return { success: false, error: error.message };
        }
        return { success: true };
    }
    return { success: true };
};

export const deleteGiftcode = async (id: string): Promise<{ success: boolean, error?: string }> => {
    if (supabase) {
        const { error } = await supabase.from('gift_codes').delete().eq('id', id);
        if (error) return { success: false, error: error.message };
        return { success: true };
    }
    return { success: true };
};

export const redeemGiftcode = async (code: string): Promise<{ success: boolean, message?: string, reward?: number }> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, message: 'Not logged in' };

        // 1. Check code validity
        const { data: giftData, error } = await supabase.from('gift_codes').select('*').eq('code', code).eq('is_active', true).single();
        if (error || !giftData) return { success: false, message: 'Mã không tồn tại hoặc đã hết hạn.' };
        
        if (giftData.times_used >= giftData.usage_limit) return { success: false, message: 'Mã đã hết lượt sử dụng.' };

        // 2. Check if user already used
        const { data: usage } = await supabase.from('gift_code_usage').select('*').eq('gift_code_id', giftData.id).eq('user_id', user.id).single();
        if (usage) return { success: false, message: 'Bạn đã sử dụng mã này rồi.' };

        // 3. Apply reward
        await updateUserBalance(giftData.reward_amount, `Giftcode: ${code}`, 'giftcode');
        
        // 4. Record usage
        await supabase.from('gift_code_usage').insert({ gift_code_id: giftData.id, user_id: user.id });
        await supabase.from('gift_codes').update({ times_used: giftData.times_used + 1 }).eq('id', giftData.id);

        return { success: true, reward: giftData.reward_amount };
    }
    return { success: true, reward: 10 };
}

export const saveSystemApiKey = async (key: string): Promise<{ success: boolean, error?: string }> => {
    if (supabase) {
        const { error } = await supabase.from('api_keys').insert({ key_value: key, status: 'active', name: 'System Key' });
        if (error) return { success: false, error: error.message };
        return { success: true };
    }
    return { success: false, error: 'No DB' };
};

export const deleteApiKey = async (id: string): Promise<{ success: boolean, error?: string }> => {
     if (supabase) {
        const { error } = await supabase.from('api_keys').delete().eq('id', id);
        if (error) return { success: false, error: error.message };
        return { success: true };
    }
    return { success: false, error: 'No DB' };
};

export const getApiKeysList = async (): Promise<any[]> => {
     if (supabase) {
        const { data } = await supabase.from('api_keys').select('*');
        return data || [];
    }
    return [];
}

export const getPackages = async (): Promise<CreditPackage[]> => {
    if (supabase) {
        const { data } = await supabase.from('credit_packages').select('*').order('display_order', { ascending: true });
        if (data && data.length > 0) {
            return data.map(p => ({
                 id: p.id,
                 name: p.name,
                 coin: p.coins,
                 price: p.price,
                 currency: 'VND',
                 bonusText: p.bonus_text,
                 bonusPercent: p.bonus_percent,
                 isPopular: p.is_popular,
                 isActive: p.is_active,
                 colorTheme: p.color_theme || 'border-slate-500',
                 transferContent: p.transfer_syntax
            }));
        }
    }
    return MOCK_PACKAGES;
}

export const createPaymentLink = async (pkgId: string): Promise<Transaction | null> => {
    if (supabase) {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) return null;

         const pkgs = await getPackages();
         const pkg = pkgs.find(p => p.id === pkgId);
         if (!pkg) return null;

         const orderCode = `ORDER_${Date.now()}`;
         
         const { data, error } = await supabase.from('transactions').insert({
             user_id: user.id,
             amount: pkg.price,
             diamonds_received: pkg.coin, // Base coins, bonus applied on approval usually or here
             status: 'pending',
             order_code: orderCode,
             payment_method: 'payos'
         }).select().single();

         if (data) {
             return {
                 id: data.id,
                 userId: data.user_id,
                 packageId: pkgId,
                 amount: data.amount,
                 coins: data.diamonds_received,
                 status: data.status,
                 createdAt: data.created_at,
                 paymentMethod: 'payos',
                 code: data.order_code
             };
         }
    }
    return null;
}

export const getUnifiedHistory = async (): Promise<HistoryItem[]> => {
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // Get Balance Logs
            const { data: logs } = await supabase.from('diamond_transactions_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
            // Get Pending Topups
            const { data: pending } = await supabase.from('transactions').select('*').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: false });

            const history: HistoryItem[] = [];

            if (logs) {
                logs.forEach((l: any) => {
                    history.push({
                        id: l.id,
                        createdAt: l.created_at,
                        description: l.description,
                        vcoinChange: l.transaction_type === 'usage' ? -l.amount : l.amount,
                        type: l.transaction_type,
                        status: 'success'
                    });
                });
            }

            if (pending) {
                pending.forEach((p: any) => {
                    history.push({
                        id: p.id,
                        createdAt: p.created_at,
                        description: `Nạp Vcoin (Đang chờ)`,
                        vcoinChange: p.diamonds_received,
                        amountVnd: p.amount,
                        type: 'pending_topup',
                        status: 'pending',
                        code: p.order_code
                    });
                });
            }

            return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
    }
    return [];
}

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
    if (!supabase) return { success: false, error: "No DB Connection" };

    try {
        // 1. Get Transaction Info
        const { data: tx, error: fetchError } = await supabase.from('transactions').select('*').eq('id', txId).single();
        
        if (fetchError || !tx) {
            return { success: false, error: fetchError?.message || "Transaction not found" };
        }

        if (tx.status === 'paid') {
            return { success: false, error: "Giao dịch này đã được duyệt trước đó." };
        }

        // 2. Update Transaction Status
        const { error: updateError } = await supabase
            .from('transactions')
            .update({ status: 'paid' })
            .eq('id', txId);

        if (updateError) throw updateError;
        
        // 3. Add Balance to User
        const { data: user, error: userError } = await supabase.from('users').select('diamonds').eq('id', tx.user_id).single();
        
        if (userError) throw userError;

        if (user) {
            const currentBalance = user.diamonds || 0;
            const coins = tx.diamonds_received || 0;
            
            const { error: balanceError } = await supabase
                .from('users')
                .update({ diamonds: currentBalance + coins })
                .eq('id', tx.user_id);

            if (balanceError) throw balanceError;
            
            // 4. Log Transaction History
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
        return { success: false, error: e.message || "Lỗi xử lý Database" };
    }
};

export const adminRejectTransaction = async (txId: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabase) return { success: false, error: "No DB Connection" };

    try {
        const { error } = await supabase
            .from('transactions')
            .update({ status: 'cancelled' })
            .eq('id', txId);

        if (error) {
            // Check for common RLS error
            if (error.code === '42501') {
                return { success: false, error: "Lỗi quyền hạn (RLS): Admin không có quyền sửa bảng transactions." };
            }
            throw error;
        }
        return { success: true };
    } catch (e: any) {
        console.error("Reject Error:", e);
        return { success: false, error: e.message || "Lỗi xử lý Database" };
    }
};

export const deleteTransaction = async (txId: string): Promise<{success: boolean, error?: string}> => {
    if (!supabase) return { success: false, error: "No DB Connection" };

    try {
        // Using select() is critical to verify if RLS actually allowed deletion
        const { data, error } = await supabase.from('transactions').delete().eq('id', txId).select();
        
        if (error) throw error;
        
        // If data is null or empty array, it means no row was deleted (likely due to RLS)
        if (!data || data.length === 0) {
             return { success: false, error: "Không thể xóa. Vui lòng kiểm tra quyền hạn (RLS Policy) hoặc ID không tồn tại." };
        }

        return { success: true };
    } catch (e: any) {
         return { success: false, error: e.message };
    }
}

export const mockPayOSSuccess = async (txId: string) => {
    return adminApproveTransaction(txId);
};
