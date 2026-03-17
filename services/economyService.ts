import { supabase } from './supabaseClient';
import { UserProfile, CreditPackage, Transaction, Promotion, DailyCheckin, SystemSettings, ApiKey, PromotionConfig } from '../types';

const getUid = async (userId?: string) => {
    const client = supabase;
    if (!client) return userId || null;
    return userId || (await client.auth.getUser()).data.user?.id;
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
    const client = supabase;
    if (!client) return { id: '1', maintenance_mode: false, announcement: '', min_topup: 10000, support_email: '', version: '1.0.0' };
    const { data, error } = await client.from('system_settings').select('*').single();
    if (error) return { id: '1', maintenance_mode: false, announcement: '', min_topup: 10000, support_email: '', version: '1.0.0' };
    return data;
};

export const getUserProfile = async (userId?: string): Promise<UserProfile | null> => {
    const uid = await getUid(userId);
    const client = supabase;
    if (!uid || !client) return null;
    const { data } = await client.from('profiles').select('*').eq('id', uid).single();
    return data;
};

export const updateBalance = async (amount: number, description: string, type: string, userId?: string) => {
    const uid = await getUid(userId);
    const client = supabase;
    if (!uid || !client) throw new Error("Unauthorized or Database not connected");
    const { data: profile } = await client.from('profiles').select('balance').eq('id', uid).single();
    if (!profile) throw new Error("User not found");
    const newBalance = (type === 'add' || amount > 0) ? profile.balance + Math.abs(amount) : profile.balance - Math.abs(amount);
    if (newBalance < 0) throw new Error("Số dư không đủ");
    await client.from('profiles').update({ balance: newBalance }).eq('id', uid);
    await client.from('transactions').insert({ user_id: uid, amount: Math.abs(amount), type, description, status: 'completed' });
    return newBalance;
};

export const updateUserBalance = updateBalance;

export const performCheckin = async (userId?: string) => {
    const uid = await getUid(userId);
    const client = supabase;
    if (!uid || !client) return { success: false, message: "Unauthorized or Database not connected" };
    const today = new Date().toISOString().split('T')[0];
    const { data: checkin } = await client.from('daily_checkins').select('*').eq('user_id', uid).single();
    if (checkin && checkin.last_checkin === today) return { success: false, reward: 0, message: "Đã điểm danh" };
    const reward = 1;
    let newStreak = 1;
    if (!checkin) {
        await client.from('daily_checkins').insert({ user_id: uid, last_checkin: today, streak: 1 });
    } else {
        const lastCheckinDate = new Date(checkin.last_checkin);
        const isStreak = (Date.now() - lastCheckinDate.getTime()) < 172800000;
        newStreak = isStreak ? checkin.streak + 1 : 1;
        await client.from('daily_checkins').update({ last_checkin: today, streak: newStreak }).eq('user_id', uid);
    }
    await updateBalance(reward, 'Điểm danh', 'reward', uid);
    return { success: true, reward, newStreak, message: "Thành công" };
};

export const logVisit = async (userId?: string) => {
    const uid = await getUid(userId);
    const client = supabase;
    if (uid && client) await client.from('visit_logs').insert({ user_id: uid, visited_at: new Date().toISOString() });
};

export const updateLastActive = async (userId?: string) => {
    const uid = await getUid(userId);
    const client = supabase;
    if (uid && client) await client.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', uid);
};

export const getCheckinStatus = async (userId?: string) => {
    const uid = await getUid(userId);
    const client = supabase;
    if (!uid || !client) return null;
    return (await client.from('daily_checkins').select('*').eq('user_id', uid).single()).data;
};

export const claimMilestoneReward = async (day: number, userId?: string) => {
    const uid = await getUid(userId);
    if (!uid) return { success: false, message: "Unauthorized" };
    return { success: true, reward: 10, message: "Nhận thưởng thành công!" };
};

export const getActivePromotion = async () => {
    const client = supabase;
    if (!client) return null;
    return (await client.from('promotions').select('*').eq('status', 'active').limit(1).single()).data;
};

export const getApiKeys = async () => {
    const client = supabase;
    if (!client) return [];
    return (await client.from('api_keys').select('*')).data || [];
};
export const addApiKey = async (key: string, name: string, tier: any = 'flash'): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('api_keys').insert({ key, name, tier, status: 'active' });
    return { success: !error, error: error?.message };
};
export const deleteApiKey = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('api_keys').delete().eq('id', id);
    return { success: !error, error: error?.message };
};
export const updateApiKeyStatus = async (id: string, status: string): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('api_keys').update({ status, last_used: new Date().toISOString() }).eq('id', id);
    return { success: !error, error: error?.message };
};

export const getAdminStats = async () => {
    const client = supabase;
    if (!client) return { totalUsers: 0, totalRevenue: 0, packages: [], promotions: [], giftcodes: [], transactions: [] };
    const { data: users } = await client.from('profiles').select('count');
    const { data: trans } = await client.from('transactions').select('*').eq('status', 'completed');
    const { data: pkgs } = await client.from('credit_packages').select('*');
    const { data: promos } = await client.from('promotions').select('*');
    const { data: codes } = await client.from('giftcodes').select('*');
    return { totalUsers: users?.[0]?.count || 0, totalRevenue: trans?.reduce((acc: any, t: any) => acc + t.amount, 0) || 0, packages: pkgs || [], promotions: promos || [], giftcodes: codes || [], transactions: trans || [] };
};

export const getApiKeysList = async () => {
    const client = supabase;
    if (!client) return [];
    return (await client.from('api_keys').select('*')).data || [];
};
export const saveSystemApiKey = async (d: any): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = d.id ? await client.from('api_keys').update(d).eq('id', d.id) : await client.from('api_keys').insert(d);
    return { success: !error, error: error?.message };
};
export const updateAdminUserProfile = async (u: any, d?: any): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    if (typeof u === 'object') {
        // UI passes the whole profile object
        const { id, ...rest } = u;
        const { error } = await client.from('profiles').update(rest).eq('id', id);
        return { success: !error, error: error?.message };
    }
    const { error } = await client.from('profiles').update(d).eq('id', u);
    return { success: !error, error: error?.message };
};

export const savePackage = async (p: any): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { id, ...rest } = p;
    const { data: existing } = await client.from('transactions').select('id').eq('package_id', id).limit(1);
    const hasHistory = existing && existing.length > 0;
    
    let error;
    if (id && id.length > 5) {
        const { error: err } = await client.from('credit_packages').update(rest).eq('id', id);
        error = err;
    } else {
        const { error: err } = await client.from('credit_packages').insert(rest);
        error = err;
    }
    return { success: !error, error: error?.message };
};

export const deletePackage = async (id: string): Promise<{ success: boolean; error?: string; action?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { data: existing } = await client.from('transactions').select('id').eq('package_id', id).limit(1);
    if (existing && existing.length > 0) {
        await client.from('credit_packages').update({ is_active: false }).eq('id', id);
        return { success: true, action: 'hidden' };
    }
    const { error } = await client.from('credit_packages').delete().eq('id', id);
    return { success: !error, error: error?.message };
};

export const updatePackageOrder = async (o: any[]): Promise<{ success: boolean; error?: string }> => { 
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    try {
        for (let i = 0; i < o.length; i++) {
            await client.from('credit_packages').update({ order_index: i }).eq('id', o[i].id);
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const saveGiftcode = async (g: any): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { id, ...rest } = g;
    let error;
    if (id && id.length > 5) {
        const { error: err } = await client.from('giftcodes').update(rest).eq('id', id);
        error = err;
    } else {
        const { error: err } = await client.from('giftcodes').insert(rest);
        error = err;
    }
    return { success: !error, error: error?.message };
};

export const getGiftcodePromoConfig = async () => {
    const client = supabase;
    if (!client) return null;
    return (await client.from('system_settings').select('giftcode_promo_config').single()).data?.giftcode_promo_config;
};
export const saveGiftcodePromoConfig = async (text: string, isActive: boolean): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('system_settings').update({ giftcode_promo_config: { text, isActive } }).eq('id', '1');
    return { success: !error, error: error?.message };
};

export const getUnifiedHistory = async (userId?: string) => {
    const uid = await getUid(userId);
    const client = supabase;
    if (!uid || !client) return [];
    const { data } = await client.from('transactions').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    return data || [];
};

export const redeemGiftcode = async (code: string, userId?: string): Promise<{ success: boolean; message: string; reward?: number }> => {
    const uid = await getUid(userId);
    const client = supabase;
    if (!uid || !client) return { success: false, message: "Chưa đăng nhập hoặc Database lỗi" };
    
    const { data: gc, error: gcErr } = await client.from('giftcodes').select('*').eq('code', code).eq('is_active', true).single();
    if (gcErr || !gc) return { success: false, message: "Mã không tồn tại hoặc đã hết hạn" };
    
    if (gc.used_count >= gc.total_limit) return { success: false, message: "Mã đã hết lượt sử dụng" };
    
    const { data: usage } = await client.from('giftcode_usages').select('*').eq('giftcode_id', gc.id).eq('user_id', uid).single();
    if (usage) return { success: false, message: "Bạn đã sử dụng mã này rồi" };
    
    // Transactional update
    const { error: usageErr } = await client.from('giftcode_usages').insert({ giftcode_id: gc.id, user_id: uid });
    if (usageErr) return { success: false, message: "Lỗi hệ thống" };
    
    await client.from('giftcodes').update({ used_count: gc.used_count + 1 }).eq('id', gc.id);
    await updateBalance(gc.reward, `Nhận thưởng Giftcode: ${code}`, 'giftcode', uid);
    
    return { success: true, reward: gc.reward, message: "Thành công" };
};

export const deleteGiftcode = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('giftcodes').delete().eq('id', id);
    return { success: !error, error: error?.message };
};
export const savePromotion = async (p: any): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = p.id ? await client.from('promotions').update(p).eq('id', p.id) : await client.from('promotions').insert(p);
    return { success: !error, error: error?.message };
};
export const deletePromotion = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('promotions').delete().eq('id', id);
    return { success: !error, error: error?.message };
};

export const adminApproveTransaction = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('transactions').update({ status: 'completed' }).eq('id', id);
    return { success: !error, error: error?.message };
};
export const adminRejectTransaction = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('transactions').update({ status: 'rejected' }).eq('id', id);
    return { success: !error, error: error?.message };
};
export const adminBulkApproveTransactions = async (ids: string[]): Promise<{ success: boolean; error?: string; count?: number }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('transactions').update({ status: 'completed' }).in('id', ids);
    return { success: !error, error: error?.message, count: ids.length };
};
export const adminBulkRejectTransactions = async (ids: string[]): Promise<{ success: boolean; error?: string; count?: number }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('transactions').update({ status: 'rejected' }).in('id', ids);
    return { success: !error, error: error?.message, count: ids.length };
};
export const deleteTransaction = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('transactions').delete().eq('id', id);
    return { success: !error, error: error?.message };
};

export const getStylePresets = async () => {
    const client = supabase;
    if (!client) return [];
    return (await client.from('style_presets').select('*')).data || [];
};
export const saveStylePreset = async (s: any): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = s.id ? await client.from('style_presets').update(s).eq('id', s.id) : await client.from('style_presets').insert(s);
    return { success: !error, error: error?.message };
};
export const deleteStylePreset = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('style_presets').delete().eq('id', id);
    return { success: !error, error: error?.message };
};

export const getGiftcodeUsages = async (id: string) => {
    const client = supabase;
    if (!client) return [];
    return (await client.from('giftcode_usages').select('*').eq('giftcode_id', id)).data || [];
};
export const saveGenerationPrices = async (p: any): Promise<{ success: boolean; error?: string }> => {
    const client = supabase;
    if (!client) return { success: false, error: "Database not connected" };
    const { error } = await client.from('system_settings').update({ pricing_config: p }).eq('id', '1');
    return { success: !error, error: error?.message };
};
export const getPackages = async () => {
    const client = supabase;
    if (!client) return [];
    return (await client.from('credit_packages').select('*').order('order_index')).data || [];
};
export const createPaymentLink = async (d: any) => ({ checkoutUrl: '#' });
export const mockPayOSSuccess = async (id: string) => ({ success: true });

const keyBlacklist = new Map<string, number>();
export const reportKeyFailure = (k: string) => { keyBlacklist.set(k, Date.now()); getApiKeys().then((ks: any[]) => { const m = ks.find((x: any) => x.key === k); if (m) updateApiKeyStatus(m.id, 'error'); }); };
export const getSystemApiKey = async (t: 'flash' | 'pro' = 'flash'): Promise<string | null> => {
    const client = supabase;
    if (!client) return null;
    const { data: keys } = await client.from('api_keys').select('*').eq('status', 'active');
    if (!keys || keys.length === 0) return null;
    let tk = t === 'pro' ? keys.filter((k: any) => k.name?.includes('[PRO]')) : keys.filter((k: any) => !k.name?.includes('[PRO]'));
    if (tk.length === 0) return null;
    const now = Date.now();
    const ak = tk.filter((k: any) => { const lf = keyBlacklist.get(k.key); return !lf || (now - lf > 300000); });
    if (ak.length === 0) { keyBlacklist.clear(); return tk[0].key; }
    const s = ak[Math.floor(Math.random() * ak.length)];
    updateApiKeyStatus(s.id, 'active');
    return s.key;
};

export const getGenerationPrices = async () => {
    const client = supabase;
    if (!client) return { flash_1k: 1, flash_2k: 2, flash_4k: 4, pro_1k: 5, pro_2k: 10, pro_4k: 15, edit: 1, analysis: 0 };
    const { data } = await client.from('system_settings').select('pricing_config').single();
    const c = data?.pricing_config || {};
    return { flash_1k: c.flash_1k ?? 1, flash_2k: c.flash_2k ?? 2, flash_4k: c.flash_4k ?? 4, pro_1k: c.pro_1k ?? 5, pro_2k: c.pro_2k ?? 10, pro_4k: c.pro_4k ?? 15, edit: c.edit ?? 1, analysis: c.analysis ?? 0 };
};
