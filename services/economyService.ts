import { supabase } from './supabaseClient';
import { UserProfile, CreditPackage, Giftcode, PromotionCampaign, Transaction, HistoryItem, VcoinLog } from '../types';
import {
  creditsToVcoin,
  fetchTstModels,
  fetchTstPricing,
  filterAdminManagedPricingEntries,
  isAdminManagedPricingModel,
  sanitizePricingEntriesWithRuntimeModels,
  type TstServerAvailabilityConfig,
  DEFAULT_TST_SERVER_AVAILABILITY_CONFIG,
} from './tstCatalog';

const DEFAULT_GENERATION_PRICES = {
    flash_1k: 1,
    flash_2k: 2,
    flash_4k: 4,
    pro_1k: 5,
    pro_2k: 10,
    pro_4k: 15,
    couple: 2,
    group3: 4,
    group4: 6,
};

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

    if (error) {
        console.error("Error fetching user profile:", error);
        throw new Error("Failed to fetch user profile: " + error.message);
    }

    if (!data || !data.email || !data.display_name) {
        // Create or update profile if missing or incomplete (fallback for missing trigger)
        const newProfile = {
            id: user.id,
            email: user.email || data?.email || '',
            display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || data?.display_name || 'User',
            photo_url: user.user_metadata?.avatar_url || data?.photo_url || 'https://picsum.photos/100/100',
            vcoin_balance: data?.vcoin_balance ?? 0,
            is_admin: data?.is_admin ?? false,
            last_active: new Date().toISOString()
        };
        
        try {
            await supabase.from('users').upsert(newProfile);
        } catch (e) {
            console.warn("Failed to auto-create/update user profile", e);
        }

        return {
            id: newProfile.id,
            username: newProfile.display_name,
            email: newProfile.email,
            avatar: newProfile.photo_url,
            vcoin_balance: newProfile.vcoin_balance,
            role: newProfile.is_admin ? 'admin' : 'user',
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
        vcoin_balance: data.vcoin_balance || 0,
        role: data.is_admin ? 'admin' : 'user',
        isVip: false, // Logic for VIP could be added later
        streak: 0, // Need separate checkin table query if needed
        lastCheckin: null,
        checkinHistory: [],
        usedGiftcodes: [],
        lastActive: data.last_active || null
    };
};

export interface ModelPricing {
  id: string;
  model_id: string;
  option_id: string;
  tst_price_credits: number;
  audition_price_vcoin: number;
  updated_at: string;
}

const parseSettingValue = <T,>(value: any, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

export const getModelPricing = async (): Promise<ModelPricing[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from('model_pricing').select('*');
  if (error) {
    console.error('Error fetching model pricing:', error);
    return [];
  }
  return data || [];
};

export const saveModelPricing = async (pricing: ModelPricing): Promise<{success: boolean, error?: string}> => {
  if (!supabase) return { success: false, error: "No Database" };
  const { error } = await supabase.from('model_pricing').upsert({
    id: pricing.id,
    model_id: pricing.model_id,
    option_id: pricing.option_id,
    tst_price_credits: pricing.tst_price_credits,
    audition_price_vcoin: pricing.audition_price_vcoin,
    updated_at: new Date().toISOString()
  }, { onConflict: 'model_id, option_id' });
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const getTstServerAvailabilityConfig = async (): Promise<TstServerAvailabilityConfig> => {
  if (!supabase) return DEFAULT_TST_SERVER_AVAILABILITY_CONFIG;
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'tst_server_availability')
    .maybeSingle();

  if (error) {
    console.error('Error fetching TST server availability config:', error);
    return DEFAULT_TST_SERVER_AVAILABILITY_CONFIG;
  }

  const parsed = parseSettingValue<TstServerAvailabilityConfig>(data?.value, DEFAULT_TST_SERVER_AVAILABILITY_CONFIG);
  return {
    disabledByModel: parsed?.disabledByModel || {},
    updatedAt: parsed?.updatedAt,
  };
};

export const saveTstServerAvailabilityConfig = async (
  config: TstServerAvailabilityConfig,
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'No Database' };

  const payload: TstServerAvailabilityConfig = {
    disabledByModel: config?.disabledByModel || {},
    updatedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from('system_settings').upsert(
    {
      key: 'tst_server_availability',
      value: payload,
    },
    { onConflict: 'key' },
  );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
};

export const syncTSTPrices = async (): Promise<{success: boolean, error?: string, data?: any[]}> => {
  if (!supabase) return { success: false, error: "No Database" };

  try {
    const [rawPricing, runtimeModels] = await Promise.all([fetchTstPricing(true), fetchTstModels(true)]);
    const livePricing = filterAdminManagedPricingEntries(
      sanitizePricingEntriesWithRuntimeModels(rawPricing, runtimeModels),
    );
    const currentPricing = await getModelPricing();
    const currentPricingMap = new Map(
      currentPricing.map((row) => [`${row.model_id}::${row.option_id}`, row]),
    );

    const rows = livePricing.map((entry) => {
      const optionId = entry.config_key || [
        entry.server,
        entry.resolution,
        entry.duration,
        entry.speed,
        entry.audio ? 'audio' : ''
      ].filter(Boolean).join('|');

      return {
        model_id: entry.model,
        option_id: optionId,
        tst_price_credits: entry.credits,
        audition_price_vcoin:
          currentPricingMap.get(`${entry.model}::${optionId}`)?.audition_price_vcoin ??
          creditsToVcoin(entry.credits),
        updated_at: new Date().toISOString()
      };
    });

    const validKeys = new Set(rows.map((row) => row.model_id + '::' + row.option_id));
    const staleIds = currentPricing
      .filter((row) => !isAdminManagedPricingModel(row.model_id) || !validKeys.has(row.model_id + '::' + row.option_id))
      .map((row) => row.id)
      .filter(Boolean);

    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from('model_pricing').delete().in('id', staleIds);
      if (deleteError) throw deleteError;
    }

    for (const row of rows) {
      const { error } = await supabase.from('model_pricing').upsert(row, { onConflict: 'model_id, option_id' });
      if (error) throw error;
    }

    return { success: true, data: await getModelPricing() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const updateLastActive = async () => {
    if (!supabase) return;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', user.id);
        }
    } catch (e) {
        console.warn("Failed to update last active", e);
    }
};

// Compatibility shim for legacy GenerationTool consumers.
// New pricing is sourced from TST pricing services, but the old UI still
// imports this function while the migration is in progress.
export const getAllPrices = async (): Promise<Record<string, number>> => {
    if (!supabase) {
        return DEFAULT_GENERATION_PRICES;
    }

    try {
        const { data, error } = await supabase.from('model_pricing').select('*');

        if (error) {
            throw error;
        }

        if (data && data.length > 0) {
            const prices: Record<string, number> = {};
            data.forEach((item: any) => {
                // Create a key like "gen_model_flash"
                const normalizedOption = item.option_id.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ /g, '_');
                const key = `${item.model_id}_${normalizedOption}`;
                prices[key] = item.audition_price_vcoin;
            });
            return {
                ...DEFAULT_GENERATION_PRICES,
                ...prices
            };
        }
    } catch (error) {
        console.warn('Failed to load prices, using defaults.', error);
    }

    return DEFAULT_GENERATION_PRICES;
};

export const updateMyProfile = async (profile: UserProfile): Promise<{success: boolean, error?: string}> => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { error } = await supabase
            .from('users')
            .update({
                display_name: profile.username,
                photo_url: profile.avatar
            })
            .eq('id', profile.id);
        
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const updateAdminUserProfile = async (profile: UserProfile): Promise<{success: boolean, error?: string}> => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { error } = await supabase
            .from('users')
            .update({
                display_name: profile.username,
                vcoin_balance: profile.vcoin_balance,
                photo_url: profile.avatar
            })
            .eq('id', profile.id);
        
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

type UpdateUserBalanceOptions = {
    targetUserId?: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
};

export const updateUserBalance = async (
    amount: number,
    reason: string,
    type: string,
    targetUserIdOrOptions?: string | UpdateUserBalanceOptions
) => {
    if (!supabase) return;

    const options: UpdateUserBalanceOptions =
        typeof targetUserIdOrOptions === 'string'
            ? { targetUserId: targetUserIdOrOptions }
            : (targetUserIdOrOptions || {});

    let userId = options.targetUserId;
    if (!userId) {
        const user = await getUserProfile();
        userId = user.id;
    }

    // 1. Preferred path: atomic RPC with reference support
    try {
        const { error } = await supabase.rpc('apply_balance_transaction', {
            p_target_user_id: userId,
            p_amount: amount,
            p_reason: reason,
            p_log_type: type,
            p_reference_type: options.referenceType ?? null,
            p_reference_id: options.referenceId ?? null,
            p_metadata: options.metadata ?? {},
        });

        if (!error) {
            if (!options.targetUserId) {
                window.dispatchEvent(new Event('balance_updated'));
            }
            return;
        }

        console.warn("[Economy] apply_balance_transaction RPC failed, falling back to legacy flow", error);
    } catch (rpcError) {
        console.warn("[Economy] apply_balance_transaction RPC unavailable, falling back to legacy flow", rpcError);
    }
    
    // 2. Legacy fallback: log transaction first
    try {
        const transactionData: any = {
            amount,
            reason,
            description: reason,
            type,
            ...(options.referenceType ? { reference_type: options.referenceType } : {}),
            ...(options.referenceId ? { reference_id: options.referenceId } : {}),
            ...(options.metadata ? { metadata: options.metadata } : {}),
        };
        
        const { error } = await supabase.from('vcoin_transactions').insert({
            ...transactionData,
            user_id: userId
        });
        
        if (error) {
            const fallbackData = {
                amount,
                description: reason,
                type,
                user_id: userId
            };
            const { error: err2 } = await supabase.from('vcoin_transactions').insert(fallbackData);
            
            if (err2 && err2.message.includes('column "user_id" does not exist')) {
                 await supabase.from('vcoin_transactions').insert({
                    amount,
                    description: reason,
                    type,
                    uid: userId
                });
            }
        }
    } catch (e) {
        // Completely silent
    }
    
    // 3. Legacy balance update
    try {
        const { error } = await supabase.rpc('secure_update_balance', {
            amount: amount,
            reason: reason,
            log_type: type
        });
        
        if (error) {
            console.warn("[Economy] secure_update_balance RPC failed, falling back to direct update (Legacy Mode)", error);
            const { data: latestUser, error: fetchError } = await supabase.from('users').select('vcoin_balance').eq('id', userId).maybeSingle();
            if (fetchError) throw fetchError;
            const currentBalance = latestUser?.vcoin_balance || 0;
            const newBalance = currentBalance + amount;
            const { error: directError } = await supabase.from('users').update({ vcoin_balance: newBalance }).eq('id', userId);
            if (directError) throw directError;
        }
    } catch (e: any) {
        console.error("[Economy] Critical: Failed to update balance", e);
        throw new Error("Failed to update balance: " + e.message);
    }
    
    if (!options.targetUserId) {
        window.dispatchEvent(new Event('balance_updated'));
    }
};

export const logVisit = async () => {
    if (!supabase) return;
    try {
        let userId: string | null = null;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            userId = user?.id || null;
        } catch {}

        const visitData = {
            user_id: userId,
            visit_date: new Date().toISOString().slice(0, 10),
            route: window.location.pathname + window.location.hash,
            user_agent: navigator.userAgent || null
        };
        const { error } = await supabase.from('app_visits').insert(visitData);
        
        if (error && error.message.includes('column "user_id" does not exist')) {
            await supabase.from('app_visits').insert({ uid: null });
        }
    } catch(e) {
        // Silent
    }
};

// --- PACKAGES & PROMOTIONS ---

export const getPackages = async (): Promise<CreditPackage[]> => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
        
    if (!data) return [];
    
    return data.map((p: any) => ({
        id: p.id,
        name: p.name,
        vcoin: p.credits_amount,
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
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const payload = {
            name: pkg.name,
            credits_amount: pkg.vcoin,
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
    if (!supabase) return { success: false, error: "No Database" };
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
    if (!supabase) return { success: false, error: "No Database" };
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
    if (!supabase) return null;
    const now = new Date().toISOString();
    try {
        const { data, error } = await supabase
            .from('promotions')
            .select('*')
            .eq('is_active', true)
            .lt('start_time', now)
            .gt('end_time', now)
            .maybeSingle();
            
        if (error || !data) return null;
        
        return {
            id: data.id,
            name: data.title || 'Event',
            marqueeText: data.description || '',
            bonusPercent: data.bonus_percent || 0,
            startTime: data.start_time,
            endTime: data.end_time,
            isActive: data.is_active
        };
    } catch (e) {
        return null;
    }
};

export const savePromotion = async (promo: PromotionCampaign): Promise<{success: boolean, error?: string}> => {
    if (!supabase) return { success: false, error: "No Database" };
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
    if (!supabase) return { success: false, error: "No Database" };
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
    if (!supabase) return { streak: 0, isCheckedInToday: false, history: [], claimedMilestones: [] };
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
    if (!supabase) return { success: false, reward: 0, newStreak: 0, message: "No Database" };
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
    if (!supabase) return { success: false, message: "No Database" };
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
const MAX_REQ_PER_MIN = 4; // Safe limit (Google allows 5/min)

interface KeyStats {
    usageCount: number;
    resetAt: number;
}
const keyUsageStats = new Map<string, KeyStats>();

export const isKeyDisabled = (key: string): boolean => {
    return temporarilyDisabledKeys.has(key);
};

export const reportKeyFailure = (key: string) => {
    if (!key) return;
    const shortKey = key.substring(0, 4) + '...' + key.slice(-4);
    console.warn(`[System] 🔴 API Key ${shortKey} failed (429/503). Temporarily disabling for 1 minute.`);
    temporarilyDisabledKeys.add(key);
    
    // Also max out its usage stats so it's deprioritized
    keyUsageStats.set(key, {
        usageCount: MAX_REQ_PER_MIN,
        resetAt: Date.now() + KEY_COOLDOWN_MS
    });

    setTimeout(() => {
        temporarilyDisabledKeys.delete(key);
        console.log(`[System] 🟢 API Key ${shortKey} is back in rotation.`);
    }, KEY_COOLDOWN_MS);
};

let lastUsedKey: string | null = null;

export const getApiKeyName = async (key: string): Promise<string> => {
    if (!supabase) return 'Unknown Key';
    try {
        const { data, error } = await supabase
            .from('api_keys')
            .select('name')
            .eq('key_value', key)
            .single();
        if (error || !data) return 'Unknown Key';
        return data.name || 'Unknown Key';
    } catch (e) {
        return 'Unknown Key';
    }
};

export const getSystemApiKey = async (tier: 'flash' | 'pro' = 'flash', excludedKeys: string[] = []): Promise<string | null> => {
    if (!supabase) return process.env.API_KEY || null;
    try {
        // 1. Clean up expired stats
        const now = Date.now();
        for (const [k, v] of keyUsageStats.entries()) {
            if (now > v.resetAt) {
                keyUsageStats.delete(k);
            }
        }

        // 2. Get all active keys
        const { data: allKeys, error } = await supabase
            .from('api_keys')
            .select('id, key_value, last_used_at, name')
            .eq('status', 'active');
        
        if (error || !allKeys || allKeys.length === 0) {
            return process.env.API_KEY || null;
        }

        // 3. Filter by tier
        let tierKeys = allKeys;
        if (tier === 'pro') {
            tierKeys = allKeys.filter((k: any) => k.name && k.name.includes('[PRO]'));
        } else {
            tierKeys = allKeys.filter((k: any) => !k.name || !k.name.includes('[PRO]'));
        }

        if (tierKeys.length === 0) {
            if (allKeys.length > 0) {
                tierKeys = allKeys; // Borrow from other tier if empty
            } else {
                return process.env.API_KEY || null;
            }
        }

        // 4. Filter out disabled or excluded keys
        let validKeys = tierKeys.filter((k: any) => 
            !temporarilyDisabledKeys.has(k.key_value) && 
            !excludedKeys.includes(k.key_value)
        );

        // 5. Desperation mode: If all valid keys are exhausted, try borrowing from the other tier
        if (validKeys.length === 0) {
            console.warn(`[System] All ${tier.toUpperCase()} keys exhausted. Attempting to borrow from other tier...`);
            const otherTierKeys = allKeys.filter((k: any) => !tierKeys.includes(k));
            validKeys = otherTierKeys.filter((k: any) => 
                !temporarilyDisabledKeys.has(k.key_value) && 
                !excludedKeys.includes(k.key_value)
            );
        }

        // 6. Extreme desperation: clear temporary blacklist
        if (validKeys.length === 0) {
            console.warn("[System] ALL keys exhausted across all tiers. Resetting temporary blacklist.");
            temporarilyDisabledKeys.clear();
            validKeys = allKeys; // Use any key available
        }

        // 7. Sort by usage count (Least Recently/Frequently Used)
        validKeys.sort((a: any, b: any) => {
            const statA = keyUsageStats.get(a.key_value) || { usageCount: 0 };
            const statB = keyUsageStats.get(b.key_value) || { usageCount: 0 };
            return statA.usageCount - statB.usageCount;
        });

        // 8. Select the best key
        let selectedKey = validKeys[0];
        const bestStat = keyUsageStats.get(selectedKey.key_value) || { usageCount: 0, resetAt: now + 60000 };

        // 9. If even the best key is at max capacity, we should ideally queue, but here we just pick it and hope for the best (or the retry loop in geminiService will handle it)
        if (bestStat.usageCount >= MAX_REQ_PER_MIN) {
            console.warn(`[System] High Load Warning: Best available key is already at max capacity (${bestStat.usageCount}/${MAX_REQ_PER_MIN}).`);
        }

        // 10. Update stats
        keyUsageStats.set(selectedKey.key_value, {
            usageCount: bestStat.usageCount + 1,
            resetAt: bestStat.resetAt > now ? bestStat.resetAt : now + 60000
        });

        lastUsedKey = selectedKey.key_value;
        supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', selectedKey.id).then(() => {});
        
        return selectedKey.key_value;
    } catch (e) {
        console.error("Key rotation error:", e);
        return process.env.API_KEY || null;
    }
};

export const saveSystemApiKey = async (key: string, tier: 'flash' | 'pro' = 'flash'): Promise<{success: boolean, error?: string}> => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const cleanKey = key.trim();
        const tierTag = tier === 'pro' ? '[PRO]' : '[FLASH]';
        
        // Check if exists
        const { data: existing } = await supabase
            .from('api_keys')
            .select('id, name')
            .eq('key_value', cleanKey)
            .single();

        if (existing) {
             let newName = existing.name || `Service Account ${new Date().toISOString()}`;
             if (!newName.includes(tierTag)) {
                 newName = `${tierTag} ${newName.replace(/\[PRO\]|\[FLASH\]/g, '').trim()}`;
             }
             const { error } = await supabase.from('api_keys').update({ status: 'active', name: newName }).eq('id', existing.id);
             if (error) throw error;
        } else {
             const { error } = await supabase.from('api_keys').insert({
                 name: `${tierTag} Service Account ` + new Date().toISOString(),
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
    if (!supabase) return;
    await supabase.from('api_keys').delete().eq('id', id);
};

export const getApiKeysList = async () => {
    if (!supabase) return [];
    const { data } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false });
    return data || [];
}

// --- TRANSACTIONS ---

export const createPaymentLink = async (packageId: string): Promise<Transaction> => {
    if (!supabase) throw new Error("No Database");
    const user = await getUserProfile();
    const pkg = (await getPackages()).find(p => p.id === packageId);
    if (!pkg) throw new Error("Invalid package");

    const promo = await getActivePromotion();
    const activeBonusPercent = promo ? promo.bonusPercent : (pkg.bonusPercent || 0);
    const bonus = Math.floor(pkg.vcoin * activeBonusPercent / 100);
    const totalCoins = pkg.vcoin + bonus;

    const providerOrderCode = Date.now();
    const orderCode = `${providerOrderCode}`;
    
    // Create Pending Transaction
    const { data, error } = await supabase.from('payment_transactions').insert({
        user_id: user.id,
        package_id: packageId,
        amount_vnd: pkg.price,
        vcoin_received: totalCoins,
        status: 'pending',
        order_code: orderCode,
        provider_order_code: providerOrderCode,
    }).select().single();

    if (error) throw error;

    // Call Cloud Function to get PayOS Link
    try {
        const res = await fetch('/api/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: pkg.price,
                description: `AI${String(providerOrderCode).slice(-7)}`,
                orderCode: providerOrderCode,
                returnUrl: window.location.origin,
                cancelUrl: window.location.origin,
                buyerName: user.username,
                buyerEmail: user.email,
                items: [
                    {
                        name: pkg.name,
                        quantity: 1,
                        price: pkg.price,
                    }
                ],
                expiredAt: Math.floor(Date.now() / 1000) + (15 * 60)
            })
        });
        const payOsData = await res.json();

        if (!res.ok || !payOsData?.checkoutUrl) {
            throw new Error(payOsData?.error || 'Failed to create PayOS checkout URL');
        }

        await supabase
            .from('payment_transactions')
            .update({
                checkout_url: payOsData.checkoutUrl,
                provider_payment_link_id: payOsData.paymentLinkId || null,
            })
            .eq('id', data.id);
        
        // Update transaction with checkoutUrl if needed, or just return it
        return {
            id: data.id,
            userId: user.id,
            packageId,
            amount: pkg.price,
            vcoin_received: totalCoins,
            status: 'pending',
            createdAt: data.created_at,
            paymentMethod: 'payos',
            code: orderCode,
            order_code: orderCode,
            checkoutUrl: payOsData.checkoutUrl
        };
    } catch (e) {
        console.warn("PayOS generation failed, using manual mode");
        return {
            id: data.id,
            userId: user.id,
            packageId,
            amount: pkg.price,
            vcoin_received: totalCoins,
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
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { error } = await supabase.rpc('settle_payment_transaction_by_id', {
            p_transaction_id: txId,
            p_provider_status: 'PAID',
            p_provider_payload: { source: 'admin_manual_approval' }
        });
        if (error) throw error;
        
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const adminRejectTransaction = async (txId: string): Promise<{success: boolean, error?: string}> => {
     if (!supabase) return { success: false, error: "No Database" };
     try {
        const { error } = await supabase
            .from('payment_transactions')
            .update({ status: 'failed' })
            .eq('id', txId);
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const adminBulkApproveTransactions = async (txIds: string[]): Promise<{success: boolean, error?: string, count?: number}> => {
    if (!supabase) return { success: false, error: "No Database" };
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
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { error, count } = await supabase
            .from('payment_transactions')
            .update({ status: 'failed' })
            .in('id', txIds);
            
        if (error) throw error;
        return { success: true, count: count || txIds.length };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const deleteTransaction = async (txId: string): Promise<{success: boolean, error?: string}> => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { error } = await supabase.from('payment_transactions').delete().eq('id', txId);
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const getUnifiedHistory = async (targetUserId?: string): Promise<HistoryItem[]> => {
    if (!supabase) return [];
    let userId = targetUserId;
    if (!userId) {
        const user = await getUserProfile();
        userId = user.id;
    }
    
    // 1. Get Topup History
    const { data: txs } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    // 2. Get Usage/Reward Logs
    const { data: logs } = await supabase
        .from('vcoin_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    const history: HistoryItem[] = [];

    txs?.forEach((t: any) => {
        history.push({
            id: t.id,
            createdAt: t.created_at,
            description: `Nạp Vcoin (${t.order_code})`,
            vcoinChange: t.vcoin_received,
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
            description: l.description || l.reason || l.note || l.action || l.details || 'Giao dịch hệ thống', // Fallback to note or default
            vcoinChange: l.amount, // Amount is already signed (negative for usage)
            type: l.type || 'usage', // Fallback to usage if type is missing (for legacy logs)
            status: 'success'
        });
    });

    return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// --- MAINTENANCE MODE ---

export const getMaintenanceMode = async () => {
    if (!supabase) return { isActive: false, message: "Hệ thống đang bảo trì, vui lòng quay lại sau." };
    try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'maintenance_mode').maybeSingle();
        if (error) throw error;

        if (data?.value) {
            const parsedValue = parseSettingValue(data.value, {
                isActive: false,
                message: "Hệ thống đang bảo trì, vui lòng quay lại sau."
            });
            return {
                isActive: !!parsedValue.isActive,
                message: parsedValue.message || "Hệ thống đang bảo trì, vui lòng quay lại sau."
            };
        }
        return { isActive: false, message: "Hệ thống đang bảo trì, vui lòng quay lại sau." };
    } catch (e) {
        console.error("Get Maintenance Mode Error", e);
        return { isActive: false, message: "Hệ thống đang bảo trì, vui lòng quay lại sau." };
    }
};

export const saveMaintenanceMode = async (isActive: boolean, message: string) => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { data, error } = await supabase.from('system_settings').upsert(
            { key: 'maintenance_mode', value: { isActive, message } },
            { onConflict: 'key' }
        ).select();

        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error("Save Maintenance Mode Error", e);
        return { success: false, error: e };
    }
};

// --- GIFTCODES ---

export const getTutorialVideo = async () => {
    if (!supabase) return { url: "https://www.youtube.com/watch?v=ba2WR8txe_c", isActive: true };
    try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'tutorial_video').maybeSingle();
        if (error) throw error;

        if (data?.value) {
            const parsedValue = parseSettingValue(data.value, {
                url: "https://www.youtube.com/watch?v=ba2WR8txe_c",
                isActive: true
            });
            return {
                url: parsedValue.url || "https://www.youtube.com/watch?v=ba2WR8txe_c",
                isActive: parsedValue.isActive !== undefined ? parsedValue.isActive : true
            };
        }

        return { url: "https://www.youtube.com/watch?v=ba2WR8txe_c", isActive: true };
    } catch (e) {
        return { url: "https://www.youtube.com/watch?v=ba2WR8txe_c", isActive: true };
    }
};

export const saveTutorialVideo = async (url: string, isActive: boolean) => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { data: existing } = await supabase.from('system_settings').select('key').eq('key', 'tutorial_video').maybeSingle();
        
        let error;
        if (existing) {
            const res = await supabase.from('system_settings').update({ value: { url, isActive } }).eq('key', 'tutorial_video');
            error = res.error;
        } else {
            const res = await supabase.from('system_settings').insert({ key: 'tutorial_video', value: { url, isActive } });
            error = res.error;
        }
        
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const getGiftcodePromoConfig = async () => {
    if (!supabase) return { text: "Nhập CODE \"HELLO2026\" để nhận 20 Vcoin miễn phí !!!", isActive: true };
    try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'giftcode_promo').maybeSingle();
        if (error) throw error;

        if (data?.value) {
            const parsedValue = parseSettingValue(data.value, {
                text: "Nhập CODE \"HELLO2026\" để nhận 20 Vcoin miễn phí !!!",
                isActive: true
            });
            return {
                text: parsedValue.text || "Nhập CODE \"HELLO2026\" để nhận 20 Vcoin miễn phí !!!",
                isActive: parsedValue.isActive !== undefined ? parsedValue.isActive : true
            };
        }

        return {
            text: "Nhập CODE \"HELLO2026\" để nhận 20 Vcoin miễn phí !!!",
            isActive: true
        };
    } catch (e) {
        return {
            text: "Nhập CODE \"HELLO2026\" để nhận 20 Vcoin miễn phí !!!",
            isActive: true
        };
    }
};

export const saveGiftcodePromoConfig = async (text: string, isActive: boolean) => {
    if (!supabase) return { success: false, error: "No Database" };
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
    if (!supabase) return { success: false, error: "No Database" };
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
    if (!supabase) return;
    await supabase.from('gift_codes').delete().eq('id', id);
};

export const redeemGiftcode = async (codeStr: string): Promise<{success: boolean, reward: number, message: string}> => {
    if (!supabase) return { success: false, reward: 0, message: "No Database" };
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
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('gift_code_usages')
        .select('user_id, created_at, users(display_name, email, photo_url)')
        .eq('gift_code_id', codeId)
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    
    return data.map((u: any) => {
        const userObj = Array.isArray(u.users) ? u.users[0] : u.users;
        return {
            userId: u.user_id,
            usedAt: u.created_at,
            userName: userObj?.display_name || userObj?.email?.split('@')[0] || 'Unknown',
            userEmail: userObj?.email || 'No Email',
            userAvatar: userObj?.photo_url || 'https://picsum.photos/50/50'
        };
    });
};

// --- STYLE PRESETS ---

export const getStylePresets = async () => {
    if (!supabase) return [];
    const { data } = await supabase.from('style_presets').select('*').eq('is_active', true);
    return data || [];
};

export const saveStylePreset = async (style: any) => {
    if (!supabase) return { success: false, error: "No Database" };
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
    if (!supabase) return;
    await supabase.from('style_presets').delete().eq('id', id);
};

// --- ADMIN STATS ---

export const getAdminStats = async () => {
    if (!supabase) return {
        dashboard: { visitsToday: 0, visitsTotal: 0, newUsersToday: 0, usersTotal: 0, imagesToday: 0, imagesTotal: 0, aiUsage: [] },
        usersList: [], packages: [], promotions: [], giftcodes: [], transactions: []
    };
    // Fetch Users (Handling > 1000 rows limit)
    let users: any[] = [];
    let userError = null;
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
        if (error) {
            userError = error;
            break;
        }
        
        if (data && data.length > 0) {
            users = [...users, ...data];
            if (data.length < pageSize) break;
            page++;
        } else {
            break;
        }
    }
    console.log("Admin Stats - Users fetched:", users?.length, userError);

    if (userError) {
        console.error("Error fetching users for Admin Stats:", userError);
    }
    const { data: pkgs } = await supabase.from('credit_packages').select('*').order('display_order');
    
    let promos = [];
    try {
        const { data } = await supabase.from('promotions').select('*');
        promos = data || [];
    } catch (e) {
        // Silent
    }
    
    // Fetch giftcodes with accurate usage count from relation
    const { data: codes } = await supabase
        .from('gift_codes')
        .select('*, gift_code_usages(count)');

    let { data: txs, error: txError } = await supabase.from('payment_transactions').select('*, users(email, display_name, photo_url)').order('created_at', { ascending: false }).limit(5000);
    if (txError) {
        console.warn("Failed to join users on transactions, falling back to select *", txError);
        const fallback = await supabase.from('payment_transactions').select('*').order('created_at', { ascending: false }).limit(5000);
        txs = fallback.data;
    }
    console.log("Admin Stats - Transactions fetched:", txs?.length);
    if (txs && txs.length > 0) {
        console.log("First Tx user_id:", txs[0].user_id, "uid:", txs[0].uid, "users join:", txs[0].users);
    }
    
    // Try to fetch logs from both potential table names
    let usageLogs: any[] = [];
    
    // Attempt 1: vcoin_transactions (Fetch up to 10000)
    const { data: logs1, error: err1 } = await supabase.from('vcoin_transactions').select('*').order('created_at', { ascending: false }).limit(10000);
    if (logs1) usageLogs = [...usageLogs, ...logs1];

    // Filter for usage: type 'usage' OR negative amount
    usageLogs = usageLogs.filter((l: any) => l.type === 'usage' || (l.amount && Number(l.amount) < 0));
    
    // Debug logs
    console.log("Admin Stats - Usage Logs Found:", usageLogs.length);
    if (txs && txs.length > 0) {
        console.log("First Transaction Keys:", Object.keys(txs[0]));
        console.log("First Transaction Data:", txs[0]);
    }
    console.log("Usage Logs:", usageLogs);

    // Calculate dashboard
    const now = new Date();
    const todayStr = getLocalTodayStr();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTodayISO = startOfToday.toISOString();
    
    // 1. Users
    const newUsersToday = users?.filter((u: any) => u.created_at && new Date(u.created_at) >= startOfToday).length || 0;
    
    const countRows = async (tableName: string, since?: string): Promise<number> => {
        try {
            let query = supabase.from(tableName).select('*', { count: 'exact', head: true });
            if (since) {
                query = query.gte('created_at', since);
            }

            const { count, error } = await query;
            if (error) {
                console.warn(`[Admin Stats] Count failed for ${tableName}:`, error.message);
                return 0;
            }

            return count || 0;
        } catch (error) {
            console.warn(`[Admin Stats] Count failed for ${tableName}:`, error);
            return 0;
        }
    };

    // 2. Images (Use count for performance and to bypass limit)
    const imagesTotal = await countRows('generated_images');
    const imagesToday = await countRows('generated_images', startOfTodayISO);

    // 3. Visits (Degrade gracefully if the table is missing in the current schema)
    const visitsTotal = await countRows('app_visits');
    const visitsToday = await countRows('app_visits', startOfTodayISO);

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
         let coins = t.vcoin_received ? Number(t.vcoin_received) : (t.diamonds_received ? Number(t.diamonds_received) : (t.coins_received ? Number(t.coins_received) : (t.coins ? Number(t.coins) : (t.diamonds ? Number(t.diamonds) : (t.credits ? Number(t.credits) : 0)))));
         
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

         const txUserId = t.user_id || t.userId || t.uid;
         let txUser = null;
         if (t.users) {
             txUser = Array.isArray(t.users) ? t.users[0] : t.users;
         } else {
             txUser = users?.find((u: any) => u.id === txUserId);
         }
         
         return {
             id: t.id,
             userId: txUserId,
             userName: txUser?.display_name || txUser?.email?.split('@')[0] || t.user_name || t.userName,
             userEmail: txUser?.email || t.user_email || t.userEmail,
             userAvatar: txUser?.photo_url || t.user_avatar || t.userAvatar,
             packageId: t.package_id,
             amount: t.amount ? Number(t.amount) : (t.price ? Number(t.price) : (t.amount_vnd ? Number(t.amount_vnd) : 0)),
             vcoin_received: coins,
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
        vcoin_balance: u.vcoin_balance,
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
            vcoin: p.credits_amount,
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
