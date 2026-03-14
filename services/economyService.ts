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
        .maybeSingle();

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
        usedGiftcodes: [],
        lastActive: data.last_active || null
    };
};

export const updateLastActive = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', user.id);
        }
    } catch (e) {
        console.warn("Failed to update last active", e);
    }
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

export const updateUserBalance = async (amount: number, reason: string, type: string, targetUserId?: string) => {
    let userId = targetUserId;
    if (!userId) {
        const user = await getUserProfile();
        userId = user.id;
    }
    
    // 1. Log transaction (Silent Fail Safe)
    try {
        // Attempt 1: Try 'note' (Legacy column)
        const { error } = await supabase.from('diamond_transactions_log').insert({
            user_id: userId,
            amount,
            note: reason, 
            type
        });
        
        if (error) {
            // Attempt 2: If 'note' column missing, try 'reason' (New column)
            if (error.message?.includes('note') || error.message?.includes('does not exist')) {
                 const { error: err2 } = await supabase.from('diamond_transactions_log').insert({
                    user_id: userId,
                    amount,
                    reason: reason, 
                    type
                });
                
                if (err2) {
                    // Attempt 3: Try 'diamond_transactions' table with 'note'
                    const { error: err3 } = await supabase.from('diamond_transactions').insert({
                        user_id: userId,
                        amount,
                        note: reason, 
                        type
                    });
                    if (err3) console.warn("[Economy] Failed to log (Retry 3):", err3.message);
                }
            } else {
                console.warn("[Economy] Failed to log transaction:", error.message);
            }
        }
    } catch (e) {
        console.warn("[Economy] Log table missing or inaccessible.");
    }
    
    // 2. Update balance directly (skip RPC to avoid 404)
    try {
        // Fetch latest balance first to minimize race condition
        const { data: latestUser } = await supabase.from('users').select('diamonds').eq('id', userId).maybeSingle();
        const currentBalance = latestUser?.diamonds || 0;
        const newBalance = currentBalance + amount;
        
        const { error } = await supabase.from('users').update({ diamonds: newBalance }).eq('id', userId);
        if (error) throw error;
    } catch (e: any) {
        console.error("[Economy] Critical: Failed to update balance", e);
        throw new Error("Failed to update balance: " + e.message);
    }
    
    // Dispatch event for UI update
    if (!targetUserId) {
        window.dispatchEvent(new Event('balance_updated'));
    }
};

export const logVisit = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        // Log visit - rely on DB defaults for dates
        const { error } = await supabase.from('app_visits').insert({
            user_id: user?.id || null
        });
        
        if (error) {
            console.warn("Failed to log visit (Table might be missing):", error.message);
        } else {
            console.log("Visit logged successfully!");
        }
    } catch(e) {
        console.warn("Error logging visit:", e);
    }
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

// --- HELPER ---
export const getLocalTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// --- CHECKIN & REWARDS ---

export const getCheckinStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { streak: 0, isCheckedInToday: false, history: [], claimedMilestones: [] };

    // Get basic stats from user table or dedicated checkin table
    // Simplified: check `daily_check_ins` table
    const today = getLocalTodayStr();
    const { data } = await supabase
        .from('daily_check_ins')
        .select('check_in_date')
        .eq('user_id', user.id);

    const history = data?.map((r: any) => r.check_in_date) || [];
    const isCheckedInToday = history.includes(today);
    
    // Simple streak calculation (count of this month)
    const currentMonthPrefix = today.substring(0, 7);
    const streak = history.filter((d: string) => d.startsWith(currentMonthPrefix)).length;

    // Get milestones for the current month ONLY
    const startOfMonth = new Date(today.substring(0, 7) + '-01').toISOString();
    const { data: milestones } = await supabase
        .from('milestone_claims')
        .select('day_milestone')
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth);
        
    return {
        streak,
        isCheckedInToday,
        history,
        claimedMilestones: milestones?.map((m: any) => m.day_milestone) || []
    };
};

export const performCheckin = async (): Promise<{success: boolean, reward: number, newStreak: number, message?: string}> => {
    const user = await getUserProfile();
    const today = getLocalTodayStr();
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

    const today = getLocalTodayStr();
    const startOfMonth = new Date(today.substring(0, 7) + '-01').toISOString();

    try {
        // Double check if already claimed THIS MONTH to prevent race conditions
        const { data: existing } = await supabase
            .from('milestone_claims')
            .select('id')
            .eq('user_id', user.id)
            .eq('day_milestone', day)
            .gte('created_at', startOfMonth)
            .single();

        if (existing) {
            throw new Error(`Bạn đã nhận mốc ${day} ngày trong tháng này rồi!`);
        }

        const { error } = await supabase.from('milestone_claims').insert({
            user_id: user.id,
            day_milestone: day,
            reward_amount: amount,
            claim_month: today.substring(0, 7)
        });

        if (error) throw error;

        await updateUserBalance(amount, `Milestone ${day} Days`, 'reward');
        return { success: true, message: `Nhận thưởng mốc ${day} ngày thành công!` };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
};

// --- API KEYS (WITH INTELLIGENT ROTATION) ---

// In-memory blacklist for the current session (to avoid hitting bad keys repeatedly in a loop)
const temporarilyDisabledKeys: Set<string> = new Set();
const KEY_COOLDOWN_MS = 60000; // 1 minute cooldown for bad keys

export const isKeyDisabled = (key: string): boolean => {
    return temporarilyDisabledKeys.has(key);
};

export const reportKeyFailure = (key: string) => {
    if (!key) return;
    const shortKey = key.substring(0, 4) + '...' + key.slice(-4);
    console.warn(`[System] 🔴 API Key ${shortKey} failed. Temporarily disabling for 1 minute.`);
    temporarilyDisabledKeys.add(key);
    setTimeout(() => {
        temporarilyDisabledKeys.delete(key);
        console.log(`[System] 🟢 API Key ${shortKey} is back in rotation.`);
    }, KEY_COOLDOWN_MS);
};

let lastUsedKey: string | null = null;

export const getSystemApiKey = async (tier: 'flash' | 'pro' = 'flash', excludedKeys: string[] = []): Promise<string | null> => {
    try {
        // 1. Get all active keys
        const { data: allKeys, error } = await supabase
            .from('api_keys')
            .select('id, key_value, last_used_at, name')
            .eq('status', 'active');
        
        if (error || !allKeys || allKeys.length === 0) {
            // Fallback if DB error or empty
            return process.env.API_KEY || null;
        }

        // Filter by tier
        let tierKeys = allKeys;
        if (tier === 'pro') {
            tierKeys = allKeys.filter((k: any) => k.name && k.name.includes('[PRO]'));
        } else {
            // Flash keys are those without [PRO] (or explicitly marked [FLASH])
            tierKeys = allKeys.filter((k: any) => !k.name || !k.name.includes('[PRO]'));
        }

        if (tierKeys.length === 0) {
            // If no keys for this tier, fallback to env key
            return process.env.API_KEY || null;
        }

        // 2. Filter out keys that are in the in-memory blacklist OR the excluded list (from retry loop)
        let validKeys = tierKeys.filter((k: any) => 
            !temporarilyDisabledKeys.has(k.key_value) && 
            !excludedKeys.includes(k.key_value)
        );

        // 3. If all keys are disabled/excluded, clear the temporary blacklist and try again (Desperation mode)
        if (validKeys.length === 0) {
            console.warn("[System] All keys exhausted. Resetting temporary blacklist.");
            temporarilyDisabledKeys.clear();
            validKeys = tierKeys;
        }

        // 4. Avoid picking the exact same key as last time if we have multiple choices
        let candidates = validKeys;
        if (candidates.length > 1 && lastUsedKey) {
            const filtered = candidates.filter((k: any) => k.key_value !== lastUsedKey);
            if (filtered.length > 0) {
                candidates = filtered;
            }
        }

        // 5. Pick a RANDOM candidate
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const selectedKey = candidates[randomIndex];

        // 6. Update usage timestamp & state
        lastUsedKey = selectedKey.key_value;
        supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', selectedKey.id).then(() => {});
        
        return selectedKey.key_value;
    } catch (e) {
        console.error("Key rotation error:", e);
        return process.env.API_KEY || null;
    }
};

export const saveSystemApiKey = async (key: string, tier: 'flash' | 'pro' = 'flash'): Promise<{success: boolean, error?: string}> => {
    try {
        const cleanKey = key.trim();
        const prefix = tier === 'pro' ? '[PRO]' : '[FLASH]';
        
        // Check if exists
        const { data: existing } = await supabase
            .from('api_keys')
            .select('id, name')
            .eq('key_value', cleanKey)
            .single();

        if (existing) {
             const newName = existing.name?.includes('[') 
                ? existing.name.replace(/\[.*?\]/, prefix) 
                : `${prefix} ${existing.name || 'Admin Key'}`;
             const { error } = await supabase.from('api_keys').update({ status: 'active', name: newName }).eq('id', existing.id);
             if (error) throw error;
        } else {
             const { error } = await supabase.from('api_keys').insert({
                 name: `${prefix} Admin Key ` + new Date().toISOString(),
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
    const activeBonusPercent = promo ? promo.bonusPercent : (pkg.bonusPercent || 0);
    const bonus = Math.floor(pkg.coin * activeBonusPercent / 100);
    const totalCoins = pkg.coin + bonus;

    const orderCode = `${Date.now()}`;
    
    // Create Pending Transaction
    const { data, error } = await supabase.from('transactions').insert({
        user_id: user.id,
        package_id: packageId,
        amount_vnd: pkg.price, // Changed from price to amount_vnd
        diamonds_received: totalCoins, // Changed from coins_received to diamonds_received
        status: 'pending',
        order_code: orderCode,
        // payment_method: 'payos' // Removed as it's not in schema
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
        await updateUserBalance(tx.diamonds_received, `Topup: ${tx.order_code || tx.code || tx.id}`, 'topup', tx.user_id);
        
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

export const adminBulkApproveTransactions = async (txIds: string[]): Promise<{success: boolean, error?: string, count?: number}> => {
    try {
        let successCount = 0;
        for (const id of txIds) {
            const res = await adminApproveTransaction(id);
            if (res.success) successCount++;
        }
        return { success: true, count: successCount };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const adminBulkRejectTransactions = async (txIds: string[]): Promise<{success: boolean, error?: string, count?: number}> => {
    try {
        const { error, count } = await supabase
            .from('transactions')
            .update({ status: 'failed' })
            .in('id', txIds);
            
        if (error) throw error;
        return { success: true, count: count || txIds.length };
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

export const getUnifiedHistory = async (targetUserId?: string): Promise<HistoryItem[]> => {
    let userId = targetUserId;
    if (!userId) {
        const user = await getUserProfile();
        userId = user.id;
    }
    
    // 1. Get Topup History
    const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    // 2. Get Usage/Reward Logs
    const { data: logs } = await supabase
        .from('diamond_transactions_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    const history: HistoryItem[] = [];

    txs?.forEach((t: any) => {
        history.push({
            id: t.id,
            createdAt: t.created_at,
            description: `Nạp Vcoin (${t.order_code})`,
            vcoinChange: t.diamonds_received,
            amountVnd: t.amount_vnd,
            type: t.status === 'paid' ? 'topup' : 'pending_topup',
            status: t.status === 'paid' ? 'success' : t.status === 'pending' ? 'pending' : 'failed',
            code: t.order_code
        });
    });

    logs?.forEach((l: any) => {
        history.push({
            id: l.id,
            createdAt: l.created_at,
            description: l.reason || l.note || 'Giao dịch hệ thống', // Fallback to note or default
            vcoinChange: l.amount, // Amount is already signed (negative for usage)
            type: l.type || 'usage', // Fallback to usage if type is missing (for legacy logs)
            status: 'success'
        });
    });

    return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// --- GENERATION PRICES ---

export const getGenerationPrices = async () => {
    try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'generation_prices').maybeSingle();
        
        if (data && data.value) {
            return {
                flash_1k: data.value.flash_1k ?? 1,
                flash_2k: data.value.flash_2k ?? 2,
                flash_4k: data.value.flash_4k ?? 4,
                pro_1k: data.value.pro_1k ?? 5,
                pro_2k: data.value.pro_2k ?? 10,
                pro_4k: data.value.pro_4k ?? 15,
                couple: data.value.couple ?? 2,
                group3: data.value.group3 ?? 4,
                group4: data.value.group4 ?? 6,
            };
        }
        
        return { 
            flash_1k: 1, flash_2k: 2, flash_4k: 4,
            pro_1k: 5, pro_2k: 10, pro_4k: 15,
            couple: 2, group3: 4, group4: 6
        };
    } catch (e) {
        return { 
            flash_1k: 1, flash_2k: 2, flash_4k: 4,
            pro_1k: 5, pro_2k: 10, pro_4k: 15,
            couple: 2, group3: 4, group4: 6
        };
    }
};

export const saveGenerationPrices = async (prices: any) => {
    try {
        const { error } = await supabase.from('system_settings').upsert(
            { key: 'generation_prices', value: prices },
            { onConflict: 'key' }
        );
        
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error("saveGenerationPrices error:", e);
        return { success: false, error: e.message };
    }
};

// --- GIFTCODES ---

export const getGiftcodePromoConfig = async () => {
    try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'giftcode_promo').maybeSingle();
        
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
        const { data: existing } = await supabase.from('system_settings').select('key').eq('key', 'giftcode_promo').maybeSingle();
        
        let error;
        if (existing) {
            const res = await supabase.from('system_settings').update({ value: { text, isActive } }).eq('key', 'giftcode_promo');
            error = res.error;
        } else {
            const res = await supabase.from('system_settings').insert({ key: 'giftcode_promo', value: { text, isActive } });
            error = res.error;
        }
        
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
        const { data: code, error } = await supabase.from('gift_codes').select('*').eq('code', cleanCode).maybeSingle();
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

export const getGiftcodeUsages = async (codeId: string) => {
    const { data, error } = await supabase
        .from('gift_code_usages')
        .select('user_id, created_at, users(display_name, email, photo_url)')
        .eq('gift_code_id', codeId)
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    
    return data.map((u: any) => ({
        userId: u.user_id,
        usedAt: u.created_at,
        userName: u.users?.display_name || 'Unknown',
        userEmail: u.users?.email || 'No Email',
        userAvatar: u.users?.photo_url || 'https://picsum.photos/50/50'
    }));
};

// --- STYLE PRESETS ---

export const getStylePresets = async () => {
    const { data } = await supabase.from('style_presets').select('*').eq('is_active', true);
    return data || [];
};

export const saveStylePreset = async (style: any) => {
    try {
        if (style.is_default) {
            // Unset other defaults
            await supabase.from('style_presets').update({ is_default: false }).neq('id', style.id);
        }
        
        const payload = {
            name: style.name,
            image_url: style.image_url,
            trigger_prompt: style.trigger_prompt,
            is_active: style.is_active,
            is_default: style.is_default
        };

        let error;
        if (style.id.startsWith('temp_')) {
            ({ error } = await supabase.from('style_presets').insert(payload));
        } else {
            ({ error } = await supabase.from('style_presets').update(payload).eq('id', style.id));
        }
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const deleteStylePreset = async (id: string) => {
    await supabase.from('style_presets').delete().eq('id', id);
};

// --- ADMIN STATS ---

export const getAdminStats = async () => {
    // Fetch Users
    const { data: users, error: userError } = await supabase.from('users').select('id, email, display_name, diamonds, is_admin, created_at, photo_url, last_active');

    if (userError) {
        console.error("Error fetching users for Admin Stats:", userError);
    }
    const { data: pkgs } = await supabase.from('credit_packages').select('*').order('display_order');
    const { data: promos } = await supabase.from('promotions').select('*');
    
    // Fetch giftcodes with accurate usage count from relation
    const { data: codes } = await supabase
        .from('gift_codes')
        .select('*, gift_code_usages(count)');

    const { data: txs } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
    
    // Try to fetch logs from both potential table names
    let usageLogs: any[] = [];
    
    // Attempt 1: diamond_transactions_log
    const { data: logs1, error: err1 } = await supabase.from('diamond_transactions_log').select('*');
    if (logs1) usageLogs = [...usageLogs, ...logs1];
    
    // Attempt 2: diamond_transactions
    const { data: logs2, error: err2 } = await supabase.from('diamond_transactions').select('*');
    if (logs2) usageLogs = [...usageLogs, ...logs2];

    // Filter for usage: type 'usage' OR negative amount
    usageLogs = usageLogs.filter((l: any) => l.type === 'usage' || (l.amount && Number(l.amount) < 0));
    
    // Debug logs
    console.log("Admin Stats - Usage Logs Found:", usageLogs.length);
    if (txs && txs.length > 0) {
        console.log("First Transaction Keys:", Object.keys(txs[0]));
        console.log("First Transaction Data:", txs[0]);
    }
    console.log("Usage Logs:", usageLogs);

    const { data: generatedImages } = await supabase.from('generated_images').select('created_at');
    const { data: visits } = await supabase.from('app_visits').select('created_at');

    // Calculate dashboard
    const now = new Date();
    const todayStr = getLocalTodayStr();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTodayISO = startOfToday.toISOString();
    
    // 1. Users
    const newUsersToday = users?.filter((u: any) => u.created_at && new Date(u.created_at) >= startOfToday).length || 0;
    
    // 2. Images (Use count for performance and to bypass limit)
    const { count: imagesTotal } = await supabase.from('generated_images').select('*', { count: 'exact', head: true });
    const { count: imagesToday } = await supabase.from('generated_images').select('*', { count: 'exact', head: true }).gte('created_at', startOfTodayISO);

    // 3. Visits (Use count for performance)
    const { count: visitsTotal } = await supabase.from('app_visits').select('*', { count: 'exact', head: true });
    const { count: visitsToday } = await supabase.from('app_visits').select('*', { count: 'exact', head: true }).gte('created_at', startOfTodayISO);

    // Calculate AI Usage Stats
    const usageStats: Record<string, { count: number, vcoins: number }> = {};
    const userUsageCounts: Record<string, number> = {}; // New: Track usage per user

    usageLogs?.forEach((log: any) => {
        // Track per user
        if (log.user_id) {
            userUsageCounts[log.user_id] = (userUsageCounts[log.user_id] || 0) + 1;
        }

        // Try to find the reason field from various potential column names
        let rawFeature = log.reason || log.description || log.note || log.action || log.activity || log.details || 'Khác';
        
        // If still 'Khác', try to find any property that looks like a feature name
        if (rawFeature === 'Khác') {
            for (const key in log) {
                if (typeof log[key] === 'string' && (log[key].startsWith('Gen') || log[key].startsWith('Edit') || log[key].includes(':'))) {
                    rawFeature = log[key];
                    break;
                }
            }
        }

        // Grouping Logic
        let feature = 'Khác';
        const lower = rawFeature.toLowerCase();

        if (lower.includes('nâng cấp') || lower.includes('upscale') || lower.includes('làm nét') || lower.includes('hd')) {
            feature = 'Làm Nét Ảnh (Upscale)';
        } else if (lower.includes('tách nền') || lower.includes('remove background') || lower.includes('background')) {
            feature = 'Tách Nền (Remove BG)';
        } else if (lower.includes('4 người') || lower.includes('group of 4') || lower.includes('squad of 4')) {
            feature = 'Tạo Ảnh 4 Người';
        } else if (lower.includes('3 người') || lower.includes('group of 3') || lower.includes('squad of 3')) {
            feature = 'Tạo Ảnh 3 Người';
        } else if (lower.includes('2 người') || lower.includes('couple') || lower.includes('đôi') || lower.includes('song ca')) {
            feature = 'Tạo Ảnh Đôi (Couple)';
        } else if (lower.includes('tạo ảnh') || lower.includes('gen:') || lower.includes('generate') || lower.includes('chân dung') || lower.includes('1 ảnh') || lower.includes('single')) {
            feature = 'Tạo Ảnh Đơn (Single)';
        } else if (lower.includes('xử lý') || lower.includes('edit') || lower.includes('face')) {
             feature = 'Chỉnh Sửa / Xử Lý Ảnh';
        } else {
            feature = rawFeature.length > 50 ? rawFeature.substring(0, 50) + '...' : rawFeature;
        }
        
        if (!usageStats[feature]) {
            usageStats[feature] = { count: 0, vcoins: 0 };
        }
        usageStats[feature].count += 1;
        // Ensure amount is positive for display
        usageStats[feature].vcoins += Math.abs(Number(log.amount) || 0);
    });

    const aiUsage = Object.keys(usageStats).map(key => ({
        feature: key,
        count: usageStats[key].count,
        vcoins: usageStats[key].vcoins,
        revenue: usageStats[key].vcoins * 1000 // Estimate 1 Vcoin = 1000 VND (example)
    }));
    
    const transactions = txs?.map((t: any) => {
         // Fallback for coins: Check DB columns -> Check Package Info -> Estimate from Amount
         let coins = t.diamonds_received ? Number(t.diamonds_received) : (t.coins_received ? Number(t.coins_received) : (t.coins ? Number(t.coins) : (t.diamonds ? Number(t.diamonds) : (t.credits ? Number(t.credits) : 0))));
         
         if (coins === 0) {
             // Try to get from Package
             if (t.package_id) {
                 const pkg = pkgs?.find((p: any) => p.id === t.package_id);
                 if (pkg) {
                     coins = pkg.credits_amount || 0;
                     if (pkg.bonus_credits) {
                         coins += Math.floor(coins * pkg.bonus_credits / 100);
                     }
                 }
             }
             
             // Last resort: Estimate from Amount (1000 VND = 1 Vcoin)
             if (coins === 0 && t.amount) {
                 coins = Math.floor(Number(t.amount) / 1000);
             }
         }

         return {
             id: t.id,
             userId: t.user_id,
             userName: users?.find((u: any) => u.id === t.user_id)?.display_name,
             userEmail: users?.find((u: any) => u.id === t.user_id)?.email,
             userAvatar: users?.find((u: any) => u.id === t.user_id)?.photo_url,
             packageId: t.package_id,
             amount: t.amount ? Number(t.amount) : (t.price ? Number(t.price) : (t.amount_vnd ? Number(t.amount_vnd) : 0)),
             coins: coins,
             status: t.status,
             createdAt: t.created_at,
             code: t.code,
             paymentMethod: t.payment_method
         };
    }) || [];

    const userList = users?.map((u: any) => ({
        id: u.id,
        username: u.display_name,
        email: u.email,
        avatar: u.photo_url,
        balance: u.diamonds,
        role: u.is_admin ? 'admin' : 'user',
        created_at: u.created_at,
        isVip: false,
        lastActive: u.last_active,
        usageCount: userUsageCounts[u.id] || 0 // New: Include usage count
    })) || [];

    return {
        dashboard: {
            visitsToday: visitsToday || 0,
            visitsTotal: visitsTotal || 0,
            newUsersToday,
            usersTotal: users?.length || 0,
            imagesToday: imagesToday || 0,
            imagesTotal: imagesTotal || 0,
            aiUsage
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
        giftcodes: codes?.map((c: any) => {
             // Use count from relation if available, otherwise fallback to column
             const realCount = c.gift_code_usages && c.gift_code_usages[0] ? c.gift_code_usages[0].count : (c.used_count || 0);
             
             return {
                 id: c.id,
                 code: c.code,
                 reward: c.reward,
                 totalLimit: c.total_limit,
                 usedCount: realCount,
                 maxPerUser: c.max_per_user,
                 isActive: c.is_active
             };
        }) || [],
        transactions
    };
};
