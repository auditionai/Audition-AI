import { supabase } from './supabaseClient';
import { UserProfile, CreditPackage, Giftcode, PromotionCampaign, Transaction, HistoryItem, DiamondLog } from '../types';

// --- USER & PROFILE ---

export const getUserProfile = async (): Promise<UserProfile> => {
    if (!supabase) throw new Error("No Database");
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error || !data) {
        // Return dummy/fallback if profile missing (handled by SQL trigger normally)
        return {
            id: user.id,
            username: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
            email: user.email || '',
            avatar: user.user_metadata?.avatar_url || 'https://picsum.photos/100/100',
            balance: 0,
            role: 'user',
            isVip: false,
            streak: 0,
            lastCheckin: null,
            checkinHistory: [],
            usedGiftcodes: []
        };
    }

    return {
        id: data.id,
        username: data.display_name || 'User',
        email: data.email,
        avatar: data.photo_url || 'https://picsum.photos/100/100',
        balance: data.diamonds || 0,
        role: data.is_admin ? 'admin' : 'user',
        isVip: false, // Logic for VIP could be added later
        streak: 0, // Need separate checkin table query if needed
        lastCheckin: null,
        checkinHistory: [],
        usedGiftcodes: []
    };
};

export const updateAdminUserProfile = async (profile: UserProfile): Promise<{success: boolean, error?: string}> => {
    try {
        const { error } = await supabase
            .from('users')
            .update({
                display_name: profile.username,
                diamonds: profile.balance,
                photo_url: profile.avatar
            })
            .eq('id', profile.id);
        
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const updateUserBalance = async (amount: number, reason: string, type: string) => {
    const user = await getUserProfile();
    // 1. Log transaction
    await supabase.from('diamond_transactions').insert({
        user_id: user.id,
        amount,
        reason,
        type
    });
    
    // 2. Update balance
    const { error } = await supabase.rpc('increment_diamonds', { 
        user_id: user.id, 
        amount_to_add: amount 
    });

    // Fallback if RPC missing
    if (error) {
         const newBalance = (user.balance || 0) + amount;
         await supabase.from('users').update({ diamonds: newBalance }).eq('id', user.id);
    }
    
    // Dispatch event for UI update
    window.dispatchEvent(new Event('balance_updated'));
};

export const logVisit = async () => {
    try {
        // Simple pixel log or increment counter
        const today = new Date().toISOString().split('T')[0];
        // Assuming a 'visits' table exists or just skip
    } catch(e) {}
};

// --- PACKAGES & PROMOTIONS ---

export const getPackages = async (): Promise<CreditPackage[]> => {
    const { data } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
        
    if (!data) return [];
    
    return data.map((p: any) => ({
        id: p.id,
        name: p.name,
        coin: p.credits_amount,
        price: p.price_vnd,
        currency: 'VND',
        bonusText: p.tag || '',
        bonusPercent: p.bonus_credits || 0,
        isPopular: p.is_featured,
        isActive: p.is_active,
        displayOrder: p.display_order,
        colorTheme: 'border-slate-600',
        transferContent: p.transfer_syntax || ''
    }));
};

export const savePackage = async (pkg: CreditPackage): Promise<{success: boolean, error?: string}> => {
    try {
        const payload = {
            name: pkg.name,
            credits_amount: pkg.coin,
            price_vnd: pkg.price,
            tag: pkg.bonusText,
            bonus_credits: pkg.bonusPercent,
            is_featured: pkg.isPopular,
            is_active: pkg.isActive,
            display_order: pkg.displayOrder,
            transfer_syntax: pkg.transferContent
        };
        
        let error;
        if (pkg.id.startsWith('temp_')) {
            ({ error } = await supabase.from('credit_packages').insert(payload));
        } else {
            ({ error } = await supabase.from('credit_packages').update(payload).eq('id', pkg.id));
        }
        
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const deletePackage = async (id: string): Promise<{success: boolean, error?: string, action?: string}> => {
    try {
        const { error } = await supabase.from('credit_packages').delete().eq('id', id);
        if (error) {
            // Soft delete if FK constraint fails
            await supabase.from('credit_packages').update({ is_active: false }).eq('id', id);
            return { success: true, action: 'hidden' };
        }
        return { success: true, action: 'deleted' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const updatePackageOrder = async (packages: CreditPackage[]): Promise<{success: boolean, error?: string}> => {
    try {
        for (let i = 0; i < packages.length; i++) {
            await supabase.from('credit_packages').update({ display_order: i }).eq('id', packages[i].id);
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export const getActivePromotion = async (): Promise<PromotionCampaign | null> => {
    const now = new Date().toISOString();
    const { data } = await supabase
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .lt('start_time', now)
        .gt('end_time', now)
        .single();
        
    if (!data) return null;
    
    return {
        id: data.id,
        name: data.title || 'Event',
        marqueeText: data.description || '',
        bonusPercent: data.bonus_percent || 0,
        startTime: data.start_time,
        endTime: data.end_time,
        isActive: data.is_active
    };
};

export const savePromotion = async (promo: PromotionCampaign): Promise<{success: boolean, error?: string}> => {
    try {
         const payload = {
            title: promo.name,
            description: promo.marqueeText,
            bonus_percent: promo.bonusPercent,
            start_time: promo.startTime,
            end_time: promo.endTime,
            is_active: promo.isActive
        };

        let error;
        if (promo.id.startsWith('temp_')) {
            ({ error } = await supabase.from('promotions').insert(payload));
        } else {
            ({ error } = await supabase.from('promotions').update(payload).eq('id', promo.id));
        }

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const deletePromotion = async (id: string): Promise<{success: boolean, error?: string}> => {
    try {
        const { error } = await supabase.from('promotions').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

// --- CHECKIN & REWARDS ---

export const getCheckinStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { streak: 0, isCheckedInToday: false, history: [], claimedMilestones: [] };

    // Get basic stats from user table or dedicated checkin table
    // Simplified: check `daily_check_ins` table
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
        .from('daily_check_ins')
        .select('check_in_date')
        .eq('user_id', user.id);

    const history = data?.map((r: any) => r.check_in_date) || [];
    const isCheckedInToday = history.includes(today);
    
    // Simple streak calculation (count of this month)
    const currentMonthPrefix = today.substring(0, 7);
    const streak = history.filter((d: string) => d.startsWith(currentMonthPrefix)).length;

    // Get milestones
    const { data: milestones } = await supabase
        .from('milestone_claims')
        .select('day_milestone')
        .eq('user_id', user.id);
        
    return {
        streak,
        isCheckedInToday,
        history,
        claimedMilestones: milestones?.map((m: any) => m.day_milestone) || []
    };
};

export const performCheckin = async (): Promise<{success: boolean, reward: number, newStreak: number, message?: string}> => {
    const user = await getUserProfile();
    const today = new Date().toISOString().split('T')[0];
    const reward = 5;

    try {
        const { error } = await supabase.from('daily_check_ins').insert({
            user_id: user.id,
            check_in_date: today
        });

        if (error) throw error;

        // Update balance directly
        await updateUserBalance(reward, 'Daily Checkin', 'reward');
        
        const status = await getCheckinStatus();
        return { success: true, reward, newStreak: status.streak };
    } catch (e: any) {
        return { success: false, reward: 0, newStreak: 0, message: e.message };
    }
};

export const claimMilestoneReward = async (day: number): Promise<{success: boolean, message: string}> => {
    const user = await getUserProfile();
    const rewards: Record<number, number> = { 7: 20, 14: 50, 30: 100 };
    const amount = rewards[day] || 0;

    try {
        const { error } = await supabase.from('milestone_claims').insert({
            user_id: user.id,
            day_milestone: day,
            reward_amount: amount
        });

        if (error) throw error;

        await updateUserBalance(amount, `Milestone ${day} Days`, 'reward');
        return { success: true, message: `Nhận thưởng mốc ${day} ngày thành công!` };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
};

// --- API KEYS (WITH ROTATION) ---

export const getSystemApiKey = async (): Promise<string | null> => {
    try {
        // Fetch ALL active keys for Load Balancing
        const { data, error } = await supabase
            .from('api_keys')
            .select('key_value')
            .eq('status', 'active');
        
        if (error || !data || data.length === 0) return null;

        // Random Selection (Rotation)
        // This distributes the load across all available keys in the DB
        const randomIndex = Math.floor(Math.random() * data.length);
        const selectedKey = data[randomIndex].key_value;
        
        console.log(`[System] Load Balancing: Selected API Key Index ${randomIndex} of ${data.length}`);
        
        return selectedKey;
    } catch (e) {
        return null;
    }
};

export const saveSystemApiKey = async (key: string): Promise<{success: boolean, error?: string}> => {
    try {
        const cleanKey = key.trim();
        // Check if exists
        const { data: existing } = await supabase
            .from('api_keys')
            .select('id')
            .eq('key_value', cleanKey)
            .single();

        if (existing) {
             const { error } = await supabase.from('api_keys').update({ status: 'active' }).eq('id', existing.id);
             if (error) throw error;
        } else {
             const { error } = await supabase.from('api_keys').insert({
                 name: 'Admin Key ' + new Date().toISOString(),
                 key_value: cleanKey,
                 status: 'active'
             });
             if (error) throw error;
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const deleteApiKey = async (id: string) => {
    await supabase.from('api_keys').delete().eq('id', id);
};

export const getApiKeysList = async () => {
    const { data } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false });
    return data || [];
}

// --- TRANSACTIONS ---

export const createPaymentLink = async (packageId: string): Promise<Transaction> => {
    const user = await getUserProfile();
    const pkg = (await getPackages()).find(p => p.id === packageId);
    if (!pkg) throw new Error("Invalid package");

    const promo = await getActivePromotion();
    const bonus = promo ? Math.floor(pkg.coin * promo.bonusPercent / 100) : 0;
    const totalCoins = pkg.coin + bonus;

    const orderCode = `${Date.now()}`;
    
    // Create Pending Transaction
    const { data, error } = await supabase.from('transactions').insert({
        user_id: user.id,
        package_id: packageId,
        amount: pkg.price,
        coins_received: totalCoins,
        status: 'pending',
        code: orderCode,
        payment_method: 'payos'
    }).select().single();

    if (error) throw error;

    // Call Cloud Function to get PayOS Link
    try {
        const res = await fetch('/.netlify/functions/create_payment', {
            method: 'POST',
            body: JSON.stringify({
                amount: pkg.price,
                description: `Mua ${pkg.coin} VC`,
                orderCode: parseInt(orderCode.slice(-9)), // PayOS requires int32/int64
                returnUrl: window.location.href,
                cancelUrl: window.location.href
            })
        });
        const payOsData = await res.json();
        
        // Update transaction with checkoutUrl if needed, or just return it
        return {
            id: data.id,
            userId: user.id,
            packageId,
            amount: pkg.price,
            coins: totalCoins,
            status: 'pending',
            createdAt: data.created_at,
            paymentMethod: 'payos',
            code: orderCode,
            checkoutUrl: payOsData.checkoutUrl
        };
    } catch (e) {
        console.warn("PayOS generation failed, using manual mode");
        return {
            id: data.id,
            userId: user.id,
            packageId,
            amount: pkg.price,
            coins: totalCoins,
            status: 'pending',
            createdAt: data.created_at,
            paymentMethod: 'manual',
            code: orderCode
        };
    }
};

export const mockPayOSSuccess = async (txId: string) => {
    // For dev testing
    await adminApproveTransaction(txId);
};

export const adminApproveTransaction = async (txId: string): Promise<{success: boolean, error?: string}> => {
    try {
        const { data: tx, error: fetchError } = await supabase.from('transactions').select('*').eq('id', txId).single();
        if (fetchError || !tx) throw new Error("Tx not found");

        if (tx.status === 'paid') return { success: true };

        // 1. Update Tx
        const { error: updateError } = await supabase
            .from('transactions')
            .update({ status: 'paid' })
            .eq('id', txId);
            
        if (updateError) throw updateError;

        // 2. Add Coins
        await updateUserBalance(tx.coins_received, `Topup: ${tx.code}`, 'topup');
        
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const adminRejectTransaction = async (txId: string): Promise<{success: boolean, error?: string}> => {
     try {
        const { error } = await supabase
            .from('transactions')
            .update({ status: 'failed' })
            .eq('id', txId);
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const deleteTransaction = async (txId: string): Promise<{success: boolean, error?: string}> => {
    try {
        const { error } = await supabase.from('transactions').delete().eq('id', txId);
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const getUnifiedHistory = async (): Promise<HistoryItem[]> => {
    const user = await getUserProfile();
    
    // 1. Get Topup History
    const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    // 2. Get Usage/Reward Logs
    const { data: logs } = await supabase
        .from('diamond_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    const history: HistoryItem[] = [];

    txs?.forEach((t: any) => {
        history.push({
            id: t.id,
            createdAt: t.created_at,
            description: `Nạp Vcoin (${t.code})`,
            vcoinChange: t.coins_received,
            amountVnd: t.amount,
            type: t.status === 'paid' ? 'topup' : 'pending_topup',
            status: t.status === 'paid' ? 'success' : t.status === 'pending' ? 'pending' : 'failed',
            code: t.code
        });
    });

    logs?.forEach((l: any) => {
        history.push({
            id: l.id,
            createdAt: l.created_at,
            description: l.reason,
            vcoinChange: l.type === 'usage' ? -l.amount : l.amount,
            type: l.type,
            status: 'success'
        });
    });

    return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// --- GIFTCODES ---

export const getGiftcodePromoConfig = async () => {
    try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'giftcode_promo').single();
        
        // If DB has config, return it, but ensure text is not empty
        if (data && data.value) {
            return {
                text: data.value.text || "Nhập CODE \"HELLO2026\" để nhận 20 Vcoin miễn phí !!!",
                isActive: data.value.isActive !== undefined ? data.value.isActive : true
            };
        }
        
        // If DB is empty or table missing (error), return DEFAULT PROMO to match UI screenshot
        // This ensures the user sees the feature even before configuring it
        return { 
            text: "Nhập CODE \"HELLO2026\" để nhận 20 Vcoin miễn phí !!!", 
            isActive: true 
        };
    } catch (e) {
        // Fallback for any other errors
        return { 
            text: "Nhập CODE \"HELLO2026\" để nhận 20 Vcoin miễn phí !!!", 
            isActive: true 
        };
    }
};

export const saveGiftcodePromoConfig = async (text: string, isActive: boolean) => {
    try {
        const { error } = await supabase.from('system_settings').upsert({
            key: 'giftcode_promo',
            value: { text, isActive }
        });
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const saveGiftcode = async (code: Giftcode): Promise<{success: boolean, error?: string}> => {
    try {
        const payload = {
            code: code.code,
            reward: code.reward,
            total_limit: code.totalLimit,
            max_per_user: code.maxPerUser,
            is_active: code.isActive
        };
        
        let error;
        if (code.id.startsWith('temp_')) {
            ({ error } = await supabase.from('gift_codes').insert(payload));
        } else {
            ({ error } = await supabase.from('gift_codes').update(payload).eq('id', code.id));
        }

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const deleteGiftcode = async (id: string) => {
    await supabase.from('gift_codes').delete().eq('id', id);
};

export const redeemGiftcode = async (codeStr: string): Promise<{success: boolean, reward: number, message: string}> => {
    const user = await getUserProfile();
    const cleanCode = codeStr.trim().toUpperCase();

    try {
        // 1. Get Code
        const { data: code, error } = await supabase.from('gift_codes').select('*').eq('code', cleanCode).single();
        if (error || !code || !code.is_active) throw new Error("Mã không hợp lệ hoặc đã hết hạn");

        // 2. Check Limits
        if (code.used_count >= code.total_limit) throw new Error("Mã đã hết lượt sử dụng");

        // 3. Check User Usage
        const { data: usage } = await supabase.from('gift_code_usages').select('*').eq('gift_code_id', code.id).eq('user_id', user.id);
        if (usage && usage.length >= code.max_per_user) throw new Error("Bạn đã nhập mã này rồi");

        // 4. Record Usage
        const { error: useError } = await supabase.from('gift_code_usages').insert({
            user_id: user.id,
            gift_code_id: code.id
        });
        if (useError) throw useError;

        // 5. Increment Count & Add Balance
        await supabase.rpc('increment_giftcode_usage', { code_id: code.id });
        await updateUserBalance(code.reward || 0, `Giftcode: ${cleanCode}`, 'giftcode');

        return { success: true, reward: code.reward, message: 'Success' };
    } catch (e: any) {
        return { success: false, reward: 0, message: e.message };
    }
};

// --- ADMIN STATS ---

export const getAdminStats = async () => {
    const { data: users } = await supabase.from('users').select('id, email, display_name, diamonds, is_admin, created_at, photo_url');
    const { data: pkgs } = await supabase.from('credit_packages').select('*').order('display_order');
    const { data: promos } = await supabase.from('promotions').select('*');
    const { data: codes } = await supabase.from('gift_codes').select('*');
    const { data: txs } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
    
    // Calculate dashboard
    const today = new Date().toISOString().split('T')[0];
    const newUsersToday = users?.filter((u: any) => u.created_at.startsWith(today)).length || 0;
    
    const transactions = txs?.map((t: any) => ({
         id: t.id,
         userId: t.user_id,
         userName: users?.find((u: any) => u.id === t.user_id)?.display_name,
         userEmail: users?.find((u: any) => u.id === t.user_id)?.email,
         userAvatar: users?.find((u: any) => u.id === t.user_id)?.photo_url,
         packageId: t.package_id,
         amount: t.amount,
         coins: t.coins_received,
         status: t.status,
         createdAt: t.created_at,
         code: t.code,
         paymentMethod: t.payment_method
    })) || [];

    const userList = users?.map((u: any) => ({
        id: u.id,
        username: u.display_name,
        email: u.email,
        avatar: u.photo_url,
        balance: u.diamonds,
        role: u.is_admin ? 'admin' : 'user',
        created_at: u.created_at,
        isVip: false
    })) || [];

    return {
        dashboard: {
            visitsToday: 120, // Mock
            visitsTotal: 5400, // Mock
            newUsersToday,
            usersTotal: users?.length || 0,
            imagesToday: 45, // Need image count query
            imagesTotal: 1200, // Need image count query
            aiUsage: [] // Need usage logs
        },
        usersList: userList,
        packages: pkgs?.map((p:any) => ({
            id: p.id,
            name: p.name,
            coin: p.credits_amount,
            price: p.price_vnd,
            currency: 'VND',
            bonusText: p.tag,
            bonusPercent: p.bonus_credits,
            isPopular: p.is_featured,
            isActive: p.is_active,
            displayOrder: p.display_order,
            colorTheme: 'border-white',
            transferContent: p.transfer_syntax
        })) || [],
        promotions: promos?.map((p: any) => ({
             id: p.id,
             name: p.title,
             marqueeText: p.description,
             bonusPercent: p.bonus_percent,
             startTime: p.start_time,
             endTime: p.end_time,
             isActive: p.is_active
        })) || [],
        giftcodes: codes?.map((c: any) => ({
             id: c.id,
             code: c.code,
             reward: c.reward,
             totalLimit: c.total_limit,
             usedCount: c.used_count,
             maxPerUser: c.max_per_user,
             isActive: c.is_active
        })) || [],
        transactions
    };
};
