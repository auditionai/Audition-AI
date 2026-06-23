
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getSupabaseUser, supabase } from '../services/supabaseClient';
import { 
    getAdminStats, 
    getApiKeysList, 
    saveSystemApiKey, 
    deleteApiKey, 
    updateAdminUserProfile, 
    savePackage, 
    deletePackage, 
    updatePackageOrder, 
    saveGiftcode, 
    deleteGiftcode, 
    getGiftcodePromoConfig, 
    saveGiftcodePromoConfig, 
    getTutorialVideo,
    saveTutorialVideo,
    getGenerationGuideImages,
    saveGenerationGuideImages,
    savePromotion, 
    deletePromotion,
    adminApproveTransaction, 
    adminRejectTransaction, 
    adminBulkApproveTransactions,
    adminBulkRejectTransactions,
    deleteTransaction,
    getSystemApiKey,
    getUserProfile,
    getStylePresets,
    saveStylePreset,
    deleteStylePreset,
    getAdminUserHistory,
    getAdminQueueJobs,
    getAdminQueueJobDetail,
    stopAdminQueueJob,
    getGiftcodeUsages,
    getMaintenanceMode,
    saveMaintenanceMode,
    getPaymentGatewayConfig,
    savePaymentGatewayConfig,
    PaymentGateway,
    getFeatureMaintenanceConfig,
    saveFeatureMaintenanceConfig,
    FeatureMaintenanceConfig,
    getSystemAnnouncementConfig,
    saveSystemAnnouncementConfig,
    SystemAnnouncementConfig,
    getAppToursConfig,
    saveAppToursConfig,
    APP_TOUR_TARGETS,
    DEFAULT_APP_TOURS_CONFIG,
    AppToursConfig,
    AppTourDefinition,
    AppTourStep,
    getModelPricing,
    saveModelPricing,
    syncTSTPrices,
    ModelPricing,
    getTstServerAvailabilityConfig,
    saveTstServerAvailabilityConfig,
    getAdminQueueHealthReport,
    runAdminQueueReconcile,
    forceRescueFailedQueueJobs
} from '../services/economyService';
import { getAllImagesFromStorage, deleteImageFromStorage, checkR2Connection, getUserImagesFromStorage, cleanupExpiredImages, cleanupR2Directly } from '../services/storageService';
import { checkConnection, analyzeStyleImage } from '../services/geminiService';
import { checkSupabaseConnection } from '../services/supabaseClient';
import {
    clearTstCatalogCache,
    filterAdminManagedPricingRows,
    getPricingRows,
    isAdminManagedPricingModel,
    tstServerToUi,
    tstSpeedToUi,
    isServerEnabledForModel,
    type TstPricingRow,
    type TstServerAvailabilityConfig
} from '../services/tstCatalog';
import { Icons } from '../components/Icons';
import { APP_CONFIG } from '../constants';
import { UserProfile, CreditPackage, Giftcode, PromotionCampaign, Transaction, GeneratedImage, Language, StylePreset, HistoryItem, AdminQueueJob, AdminQueueSummary, AdminQueueJobDetail, AdminQueueInputMedia, AdminQueueMediaSection, AdminQueueHealthReport, AdminQueueHealthSnapshot } from '../types';

interface AdminProps {
  lang: Language;
  isAdmin: boolean;
}

interface SystemHealth {
    gemini: { status: string, latency: number };
    supabase: { status: string, latency: number };
    storage: { status: string, type: string };
}

interface ToastMsg {
    id: number;
    msg: string;
    type: 'success' | 'error' | 'info';
}

const isQueueHealthSnapshot = (value: AdminQueueHealthReport['liveDbReport']): value is AdminQueueHealthSnapshot =>
    value !== null && value !== undefined && typeof value === 'object' && !('error' in value);

interface ConfirmState {
    show: boolean;
    msg: string;
    title?: string;
    isAlertOnly?: boolean;
    onConfirm: () => void;
}

// SQL Code for fixing Giftcode table issues
const GIFTCODE_FIX_SQL = `-- FIX DATABASE STRUCTURE (GIFTCODES & SETTINGS)

-- 1. GIFT CODES TABLE
CREATE TABLE IF NOT EXISTS public.gift_codes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL,
    campaign_key text,
    reward numeric DEFAULT 0,
    total_limit numeric DEFAULT 100,
    used_count numeric DEFAULT 0,
    max_per_user numeric DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Ensure columns exist
DO $$
BEGIN
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS reward numeric DEFAULT 0;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS campaign_key text;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS total_limit numeric DEFAULT 100;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS used_count numeric DEFAULT 0;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS max_per_user numeric DEFAULT 1;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
END $$;

UPDATE public.gift_codes
SET campaign_key = upper(btrim(code))
WHERE campaign_key IS NULL OR btrim(campaign_key) = '';

-- 2. USAGE TRACKING TABLE
CREATE TABLE IF NOT EXISTS public.gift_code_usages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id),
    gift_code_id uuid REFERENCES public.gift_codes(id),
    created_at timestamptz DEFAULT now()
);

-- 3. SYSTEM SETTINGS (For Promo Banners)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value jsonb
);

-- 4. VCOIN TRANSACTIONS LOG (For Usage Stats)
CREATE TABLE IF NOT EXISTS public.vcoin_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id),
    amount numeric NOT NULL,
    description text,
    type text, -- 'usage', 'topup', 'reward', etc.
    created_at timestamptz DEFAULT now()
);

-- 5. ENABLE RLS & POLICIES
ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vcoin_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for Giftcodes
DROP POLICY IF EXISTS "Public read giftcodes" ON public.gift_codes;
CREATE POLICY "Public read giftcodes" ON public.gift_codes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admin manage giftcodes" ON public.gift_codes;
CREATE POLICY "Admin manage giftcodes" ON public.gift_codes FOR ALL TO authenticated USING (public.check_is_admin());

-- Policies for System Settings
DROP POLICY IF EXISTS "Public read settings" ON public.system_settings;
CREATE POLICY "Public read settings" ON public.system_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admin manage settings" ON public.system_settings;
CREATE POLICY "Admin manage settings" ON public.system_settings FOR ALL TO authenticated USING (public.check_is_admin());

-- 6. API KEYS ROTATION SUPPORT
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_used_at timestamptz DEFAULT now();

-- 7. STYLE PRESETS (NEW)
CREATE TABLE IF NOT EXISTS public.style_presets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    image_url text NOT NULL,
    trigger_prompt text,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.style_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read styles" ON public.style_presets;
CREATE POLICY "Public read styles" ON public.style_presets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin manage styles" ON public.style_presets;
CREATE POLICY "Admin manage styles" ON public.style_presets FOR ALL TO authenticated USING (true);

-- Policies for Logs
DROP POLICY IF EXISTS "User read own logs" ON public.vcoin_transactions;
CREATE POLICY "User read own logs" ON public.vcoin_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User insert own logs" ON public.vcoin_transactions;
CREATE POLICY "User insert own logs" ON public.vcoin_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin read all logs" ON public.vcoin_transactions;
CREATE POLICY "Admin read all logs" ON public.vcoin_transactions FOR ALL TO authenticated USING (true); -- Ideally check is_admin

-- 8. RPC FOR ATOMIC INCREMENT (Fixes concurrency issues)
CREATE OR REPLACE FUNCTION public.increment_giftcode_usage(code_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.gift_codes
  SET used_count = used_count + 1
  WHERE id = code_id;
$$;

-- 9. APP VISITS TRACKING
CREATE TABLE IF NOT EXISTS public.app_visits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id),
    visit_date date DEFAULT CURRENT_DATE,
    user_agent text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_visits ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (logging visit)
DROP POLICY IF EXISTS "Public insert visits" ON public.app_visits;
CREATE POLICY "Public insert visits" ON public.app_visits FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Allow admins to read all
DROP POLICY IF EXISTS "Admin read visits" ON public.app_visits;
CREATE POLICY "Admin read visits" ON public.app_visits FOR SELECT TO authenticated USING (true);
`;

const USER_FIX_SQL = `
-- RECOVERY SCRIPT (Run in Supabase SQL Editor)

-- 1. Reset Policies to avoid recursion loops (Fixes 500 Error)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can do everything" ON public.users;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Public read access" ON public.users;
DROP POLICY IF EXISTS "Self update" ON public.users;
DROP POLICY IF EXISTS "Admin full access" ON public.users;

-- 2. Create SECURE function to check admin status (Bypasses RLS recursion)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true);
$$;

-- 3. Ensure columns exist (Fixes missing data)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vcoin_balance numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 4. Sync from auth.users (Restores Avatar/Name, preserves latest activity)
INSERT INTO public.users (id, email, display_name, photo_url, created_at, last_active)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', email), 
    COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture'), 
    created_at, 
    last_sign_in_at
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.users.display_name, EXCLUDED.display_name),
    photo_url = COALESCE(public.users.photo_url, EXCLUDED.photo_url),
    last_active = GREATEST(public.users.last_active, EXCLUDED.last_active);

-- 5. Restore Admin Rights (Replace email if needed)
UPDATE public.users 
SET is_admin = true 
WHERE email = 'khoknightyb97@gmail.com';

-- 6. Re-enable RLS with SAFE policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read basic info
CREATE POLICY "Public read access" ON public.users FOR SELECT USING (true);

-- Policy: Users can update their own data (EXCLUDING vcoin_balance and is_admin)
-- Note: This policy allows updating display_name and photo_url
CREATE POLICY "Self update" ON public.users FOR UPDATE USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id AND 
  (is_admin = (SELECT is_admin FROM public.users WHERE id = auth.uid())) AND
  (vcoin_balance = (SELECT vcoin_balance FROM public.users WHERE id = auth.uid()))
);

-- Policy: Admins can do everything (Uses SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Admin full access" ON public.users FOR ALL USING (
  public.check_is_admin() = true
);

-- 7. RPC FOR SECURE BALANCE UPDATES (Prevents client-side manipulation)
CREATE OR REPLACE FUNCTION public.secure_update_balance(amount numeric, reason text, log_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update balance
  UPDATE public.users 
  SET vcoin_balance = vcoin_balance + amount
  WHERE id = auth.uid();

  -- Log transaction
  INSERT INTO public.vcoin_transactions (user_id, amount, description, type)
  VALUES (auth.uid(), amount, reason, log_type);
END;
$$;

-- 8. Refresh Schema Cache (Fixes "column does not exist" errors)
NOTIFY pgrst, 'reload config';
`;

const BALANCE_FIX_SQL = `
-- 1. RESET NEGATIVE BALANCES
UPDATE public.users SET vcoin_balance = 0 WHERE vcoin_balance < 0;

-- 2. RECONSTRUCT BALANCES FROM TRANSACTION LOGS (CRITICAL RECOVERY)
-- Use this to restore accurate balances if the 'vcoin_balance' column was corrupted.
-- This script sums up all paid transactions + all usage/reward logs.

DO $$
DECLARE
    user_record RECORD;
    total_from_transactions NUMERIC;
    total_from_logs NUMERIC;
    final_balance NUMERIC;
BEGIN
    FOR user_record IN SELECT id, email FROM public.users LOOP
        -- Sum from paid transactions (Topups)
        SELECT COALESCE(SUM(vcoin_received), 0) INTO total_from_transactions
        FROM public.payment_transactions
        WHERE user_id = user_record.id AND status = 'paid';

        -- Sum from logs (Rewards, Usage, Giftcodes)
        -- Note: Usage amounts are stored as negative numbers (e.g., -1)
        SELECT COALESCE(SUM(amount), 0) INTO total_from_logs
        FROM public.vcoin_transactions
        WHERE user_id = user_record.id;

        final_balance := total_from_transactions + total_from_logs;

        -- Update user balance with the calculated total
        UPDATE public.users
        SET vcoin_balance = GREATEST(0, final_balance)
        WHERE id = user_record.id;
        
        RAISE NOTICE 'Restored %: % (From Tx: %, From Logs: %)', 
            user_record.email, final_balance, total_from_transactions, total_from_logs;
    END LOOP;
END $$;

-- 3. AUDIT SUSPICIOUS BALANCES
/*
SELECT u.email, u.vcoin_balance, u.display_name
FROM public.users u
LEFT JOIN public.payment_transactions t ON u.id = t.user_id AND t.status = 'paid'
WHERE u.is_admin = false
GROUP BY u.email, u.vcoin_balance, u.display_name
HAVING u.vcoin_balance > 500 AND COUNT(t.id) = 0;
*/
`;

// Helper for time ago
const getTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Chưa truy cập';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    return `${diffDays} ngày trước`;
};

const isUserOnline = (dateString?: string) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return diffMs < 5 * 60 * 1000; // Online if active within last 5 mins
};

const getInactiveDays = (dateString?: string) => {
    if (!dateString) return Number.POSITIVE_INFINITY;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
};

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const formatVietnamDateTimeLocal = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: VIETNAM_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};

const parseVietnamDateTimeLocalToIso = (value: string, fallback?: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return fallback || new Date().toISOString();
    const [, year, month, day, hour, minute] = match;
    const utcMs = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 7,
        Number(minute),
        0,
        0,
    );
    return new Date(utcMs).toISOString();
};

const formatVietnamDateTimeDisplay = (value?: string) =>
    value
        ? new Date(value).toLocaleString('vi-VN', {
            timeZone: VIETNAM_TIME_ZONE,
            hour12: false,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
        : '-';

const AdminModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(children, document.body);
};

const ADMIN_PRICING_DRAFTS_STORAGE_KEY = 'admin_pricing_drafts_v1';
const EMPTY_QUEUE_SUMMARY: AdminQueueSummary = {
    total: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    overduePolls: 0,
    untouchedQueued: 0,
    stalledPreDispatch: 0,
};
const getQueueMediaSectionTone = (key: AdminQueueMediaSection['key']) => {
    switch (key) {
        case 'result':
            return 'border-emerald-500/20 bg-emerald-500/5';
        case 'sample':
            return 'border-fuchsia-500/20 bg-fuchsia-500/5';
        default:
            return 'border-cyan-500/20 bg-cyan-500/5';
    }
};
const getQueueMediaMeta = (media: AdminQueueInputMedia) => `${media.kind} · ${media.sourceType}${media.userProvided === false ? ' · hệ thống' : ''}`;

export const Admin: React.FC<AdminProps> = ({ lang, isAdmin = false }) => {
  const [activeView, setActiveView] = useState<'overview' | 'transactions' | 'users' | 'queue' | 'packages' | 'marketing' | 'pricing' | 'system' | 'styles' | 'tours'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [allImages, setAllImages] = useState<GeneratedImage[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [giftcodes, setGiftcodes] = useState<Giftcode[]>([]);
  const [promotions, setPromotions] = useState<PromotionCampaign[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [modelPricing, setModelPricing] = useState<ModelPricing[]>([]);
  const [pricingRows, setPricingRows] = useState<TstPricingRow[]>([]);
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, string>>({});
  const [savingAllPricing, setSavingAllPricing] = useState(false);
  const [serverAvailabilityConfig, setServerAvailabilityConfig] = useState<TstServerAvailabilityConfig>({ disabledByModel: {}, autoDisabledCombos: {} });
  const [editingStyle, setEditingStyle] = useState<StylePreset | null>(null);
  
  const [maintenanceMode, setMaintenanceMode] = useState({ isActive: false, message: "Hệ thống đang bảo trì, vui lòng quay lại sau." });
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({
      disabledFeatureIds: [],
      message: 'Tính năng đang bảo trì. Vui lòng quay lại sau.',
  });
  const [paymentGateway, setPaymentGateway] = useState<PaymentGateway>('sepay');
  const [systemAnnouncement, setSystemAnnouncement] = useState<SystemAnnouncementConfig>({
      isActive: false,
      title: 'Thông báo từ AUDITION AI',
      message: 'Chào mừng bạn quay lại AUDITION AI.',
      variant: 'info',
  });
  const [appTours, setAppTours] = useState<AppToursConfig>(DEFAULT_APP_TOURS_CONFIG);
  const [selectedTourId, setSelectedTourId] = useState(DEFAULT_APP_TOURS_CONFIG.tours[0]?.id || '');

  // API Key States
  const [apiKey, setApiKey] = useState('');
  const [apiKeyTier, setApiKeyTier] = useState<'flash' | 'pro'>('flash');
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'valid' | 'invalid' | 'unknown' | 'checking'>('unknown');
  const [dbKeys, setDbKeys] = useState<any[]>([]); 
  
  // Giftcode Promo Config
  const [giftcodePromo, setGiftcodePromo] = useState({ text: '', isActive: false });

  // Tutorial Video Config
  const [tutorialVideo, setTutorialVideo] = useState({ url: '', isActive: true });
  const [generationGuideImages, setGenerationGuideImages] = useState({ characterUrl: '', sampleUrl: '' });

  // Search States
  const [userSearchEmail, setUserSearchEmail] = useState('');
  const [userActivityFilter, setUserActivityFilter] = useState<'all' | 'online' | 'inactive_60' | 'inactive_90'>('all');
  const [userSortMode, setUserSortMode] = useState<'last_active_desc' | 'vcoin_desc' | 'usage_desc' | 'name_asc'>('last_active_desc');
  const [userListLimit, setUserListLimit] = useState(30);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [queueEmailFilter, setQueueEmailFilter] = useState('');
  const [queueStatusFilter, setQueueStatusFilter] = useState<'all' | 'queued' | 'processing' | 'completed' | 'failed' | 'rescuing'>('all');
  const [queueAssetFilter, setQueueAssetFilter] = useState<'all' | 'image' | 'video'>('all');
  const [queueTimeScope, setQueueTimeScope] = useState<'today' | 'all'>('all');
  const [queueStageFilter, setQueueStageFilter] = useState('all');
  const [queueStuckOnly, setQueueStuckOnly] = useState(false);
  const [queueSummaryFilter, setQueueSummaryFilter] = useState<'all' | 'queued' | 'processing' | 'failed' | 'completed' | 'overdue_polls' | 'untouched_queued' | 'stalled_pre_dispatch'>('all');
  const [queueJobs, setQueueJobs] = useState<AdminQueueJob[]>([]);
  const [queueSummary, setQueueSummary] = useState<AdminQueueSummary>(EMPTY_QUEUE_SUMMARY);
  const [queueHealthReport, setQueueHealthReport] = useState<AdminQueueHealthReport | null>(null);
  const [loadingQueueJobs, setLoadingQueueJobs] = useState(false);
  const [reconcilingQueue, setReconcilingQueue] = useState(false);
  const [rescuingFailedQueueJobs, setRescuingFailedQueueJobs] = useState(false);
  const [selectedQueueJobId, setSelectedQueueJobId] = useState<string | null>(null);
  const [selectedQueueJobDetail, setSelectedQueueJobDetail] = useState<AdminQueueJobDetail | null>(null);
  const [loadingQueueJobDetail, setLoadingQueueJobDetail] = useState(false);
  const [stoppingQueueJob, setStoppingQueueJob] = useState(false);
  const [queuePromptExpanded, setQueuePromptExpanded] = useState(false);
  const [reopeningAutoDisabledKey, setReopeningAutoDisabledKey] = useState<string | null>(null);

  // Health State
  const [health, setHealth] = useState<SystemHealth>({
      gemini: { status: 'checking', latency: 0 },
      supabase: { status: 'checking', latency: 0 },
      storage: { status: 'checking', type: 'None' }
  });

  // Modal States
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingUserOriginalBalance, setEditingUserOriginalBalance] = useState<number | null>(null);
  const [adminUserAdjustmentReason, setAdminUserAdjustmentReason] = useState('');
  const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);
  const [userHistory, setUserHistory] = useState<HistoryItem[]>([]);
  const [userImages, setUserImages] = useState<GeneratedImage[]>([]);
  const [totalImagesCreated, setTotalImagesCreated] = useState(0);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [userLedgerDateScope, setUserLedgerDateScope] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [userLedgerSectionLimits, setUserLedgerSectionLimits] = useState<Record<string, number>>({});
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [editingGiftcode, setEditingGiftcode] = useState<Giftcode | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<PromotionCampaign | null>(null);
  const [viewingGiftcodeUsage, setViewingGiftcodeUsage] = useState<Giftcode | null>(null);
  const [giftcodeUsers, setGiftcodeUsers] = useState<any[]>([]);
  const [loadingGiftcodeUsers, setLoadingGiftcodeUsers] = useState(false);

  // Error Recovery States
  const [showGiftcodeFix, setShowGiftcodeFix] = useState(false);
  const [showUserFix, setShowUserFix] = useState(false);
  const [showBalanceFix, setShowBalanceFix] = useState(false);

  // UX States
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);

  // Notification State
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>({ show: false, msg: '', onConfirm: () => {} });

  // Helpers for Notifications
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, msg, type }]);
      setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
  };

  const showConfirm = (msg: string, action: () => void) => {
      setConfirmDialog({
          show: true,
          msg,
          onConfirm: () => {
              action();
              setConfirmDialog(prev => ({ ...prev, show: false }));
          }
      });
  };

  // Load Data Sequence
  useEffect(() => {
    if (isAdmin) {
        const init = async () => {
            await refreshData();
            await runSystemChecks(undefined);
        };
        init();
    }
    // Get current user email for recovery instructions
    if (supabase) {
      getSupabaseUser().then((user: any) => {
          if (user?.email) setCurrentUserEmail(user.email);
      });
    }
  }, [isAdmin]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
          const raw = window.localStorage.getItem(ADMIN_PRICING_DRAFTS_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
              setPricingDrafts(parsed);
          }
      } catch (error) {
          console.warn('Failed to restore pricing drafts from localStorage', error);
      }
  }, []);

  useEffect(() => {
      if (!isAdmin || activeView !== 'pricing') return;

      const refreshPricingView = async () => {
          try {
              clearTstCatalogCache();
              const [pricing, livePricingRows, serverConfig] = await Promise.all([
                  getModelPricing(),
                  getPricingRows(true),
                  getTstServerAvailabilityConfig()
              ]);
              setModelPricing((pricing || []).filter((row) => isAdminManagedPricingModel(row.model_id)));
              setPricingRows(filterAdminManagedPricingRows(livePricingRows));
              setServerAvailabilityConfig(serverConfig);
          } catch (error) {
              console.warn('Failed to auto-refresh pricing view', error);
              setPricingRows([]);
          }
      };

      refreshPricingView();
  }, [activeView, isAdmin]);

  const refreshData = async () => {
      const s = await getAdminStats();
      if (s) {
          setStats(s);
          setPackages(s.packages || []);
          setPromotions(s.promotions || []);
          setGiftcodes(s.giftcodes || []);
          setTransactions(s.transactions || []); 
          const imgs = await getAllImagesFromStorage();
          setAllImages(imgs);
      }
      
      const keys = await getApiKeysList();
      setDbKeys(keys);

      const promoConfig = await getGiftcodePromoConfig();
      setGiftcodePromo(promoConfig);

      const tutorialConfig = await getTutorialVideo();
      setTutorialVideo(tutorialConfig);

      const guideImagesConfig = await getGenerationGuideImages();
      setGenerationGuideImages(guideImagesConfig);

      const styles = await getStylePresets();
      setStylePresets(styles || []);

      const maintenance = await getMaintenanceMode();
      setMaintenanceMode(maintenance);

      const featureMaintenanceConfig = await getFeatureMaintenanceConfig();
      setFeatureMaintenance(featureMaintenanceConfig);

      const paymentGatewayConfig = await getPaymentGatewayConfig();
      setPaymentGateway(paymentGatewayConfig.gateway);

      const announcementConfig = await getSystemAnnouncementConfig();
      setSystemAnnouncement(announcementConfig);

      const toursConfig = await getAppToursConfig();
      setAppTours(toursConfig);
      setSelectedTourId((current) => current && toursConfig.tours.some((tour) => tour.id === current)
          ? current
          : toursConfig.tours[0]?.id || '');

      const pricing = await getModelPricing();
      setModelPricing((pricing || []).filter((row) => isAdminManagedPricingModel(row.model_id)));
      const serverConfig = await getTstServerAvailabilityConfig();
      setServerAvailabilityConfig(serverConfig);

      try {
          const livePricingRows = await getPricingRows();
          setPricingRows(filterAdminManagedPricingRows(livePricingRows));
      } catch (error) {
          console.warn('Failed to load live TST pricing rows', error);
          setPricingRows([]);
      }
  };

  const loadQueueJobs = async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
          setLoadingQueueJobs(true);
      }

      try {
          const result = await getAdminQueueJobs({
              search: queueEmailFilter.trim() || undefined,
              status: queueStatusFilter,
              assetType: queueAssetFilter,
              timeScope: queueTimeScope,
              stage: queueStageFilter !== 'all' ? queueStageFilter : undefined,
              stuckOnly: queueStuckOnly,
              limit: 120,
          });
          setQueueJobs(result.jobs || []);
          setQueueSummary(result.summary || EMPTY_QUEUE_SUMMARY);
          try {
              setQueueHealthReport(await getAdminQueueHealthReport());
          } catch (healthError) {
              console.warn('Failed to load queue health report', healthError);
          }
      } catch (error: any) {
          showToast(`Lỗi tải queue: ${error?.message || error}`, 'error');
      } finally {
          setLoadingQueueJobs(false);
      }
  };

  useEffect(() => {
      if (pricingRows.length === 0) return;

      setPricingDrafts((prev) => {
          const next = { ...prev };
          for (const row of pricingRows) {
              const key = `${row.modelId}::${row.configKey}`;
              const saved = modelPricing.find((item) => item.model_id === row.modelId && item.option_id === row.configKey);
              next[key] = prev[key] ?? String(saved?.audition_price_vcoin ?? row.defaultAuditionVcoin ?? row.vcoin);
          }
          return next;
      });
  }, [modelPricing, pricingRows]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
          window.localStorage.setItem(ADMIN_PRICING_DRAFTS_STORAGE_KEY, JSON.stringify(pricingDrafts));
      } catch (error) {
          console.warn('Failed to persist pricing drafts', error);
      }
  }, [pricingDrafts]);

  const getPricingLookupKey = (modelId: string, configKey: string) => `${modelId}::${configKey}`;

  const getSavedAuditionPrice = (row: TstPricingRow) =>
      modelPricing.find((item) => item.model_id === row.modelId && item.option_id === row.configKey);

  const getDraftAuditionPrice = (row: TstPricingRow) => {
      const draftKey = getPricingLookupKey(row.modelId, row.configKey);
      const savedPricing = getSavedAuditionPrice(row);
      const fallbackValue = savedPricing?.audition_price_vcoin ?? row.defaultAuditionVcoin ?? row.vcoin;
      const rawDraft = pricingDrafts[draftKey];
      const parsedDraft = Number(rawDraft);
      return Number.isFinite(parsedDraft) && parsedDraft > 0 ? parsedDraft : fallbackValue;
  };

  const isPricingRowDirty = (row: TstPricingRow) => {
      const draftKey = getPricingLookupKey(row.modelId, row.configKey);
      const rawDraft = pricingDrafts[draftKey];
      if (rawDraft === undefined) return false;
      const savedPricing = getSavedAuditionPrice(row);
      const baseline = savedPricing?.audition_price_vcoin ?? row.defaultAuditionVcoin ?? row.vcoin;
      const parsedDraft = Number(rawDraft);

      if (!Number.isFinite(parsedDraft) || parsedDraft <= 0) {
          return rawDraft !== '' && rawDraft !== String(baseline);
      }

      return parsedDraft !== baseline;
  };

  const dirtyPricingRows = pricingRows.filter(isPricingRowDirty);
  const dirtyPricingCount = dirtyPricingRows.length;

  useEffect(() => {
      if (typeof window === 'undefined' || dirtyPricingCount === 0) return;

      const handleBeforeUnload = (event: BeforeUnloadEvent) => {
          event.preventDefault();
          event.returnValue = '';
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyPricingCount]);

  const pricingServerGroups = Array.from(
      pricingRows
      .filter((row) => row.type !== 'edit' && !!row.server)
      .reduce((map, row) => {
          const existing = map.get(row.modelId) || {
              modelId: row.modelId,
              modelName: row.modelName,
              type: row.type,
              servers: new Set<string>(),
          };
          if (row.server) {
              existing.servers.add(row.server);
          }
          map.set(row.modelId, existing);
          return map;
      }, new Map<string, { modelId: string; modelName: string; type: string; servers: Set<string> }>())
      .values()
  ).map((group) => ({
      ...group,
      servers: Array.from(group.servers).sort((a, b) => a.localeCompare(b)),
  }));

  const persistPricingRow = async (
      row: TstPricingRow,
      nextValue: number,
      options?: { silent?: boolean; refreshAfterSave?: boolean }
  ) => {
      if (!Number.isFinite(nextValue) || nextValue <= 0) {
          return { success: false, error: 'Vui lòng nhập giá Vcoin hợp lệ lớn hơn 0.' };
      }

      const existing = getSavedAuditionPrice(row);
      const result = await saveModelPricing({
          id: existing?.id || crypto.randomUUID(),
          model_id: row.modelId,
          option_id: row.configKey,
          tst_price_credits: row.credits,
          audition_price_vcoin: nextValue,
          updated_at: new Date().toISOString()
      });

      if (!result.success) {
          return result;
      }

      if (options?.refreshAfterSave !== false) {
          await refreshData();
      }

      return { success: true };
  };

  const handleSavePricingRow = async (row: TstPricingRow) => {
      const draftKey = getPricingLookupKey(row.modelId, row.configKey);
      const nextValue = Number(pricingDrafts[draftKey]);

      const result = await persistPricingRow(row, nextValue);

      if (result.success) {
          showToast('Đã lưu giá AUDITION AI.', 'success');
      } else {
          showToast(`Lỗi lưu giá: ${result.error}`, 'error');
      }
  };

  const handleSaveAllPricing = async () => {
      if (dirtyPricingRows.length === 0) {
          showToast('Không có thay đổi nào cần lưu.', 'info');
          return;
      }

      setSavingAllPricing(true);
      let successCount = 0;
      let failedCount = 0;

      for (const row of dirtyPricingRows) {
          const draftKey = getPricingLookupKey(row.modelId, row.configKey);
          const nextValue = Number(pricingDrafts[draftKey]);
          const result = await persistPricingRow(row, nextValue, { refreshAfterSave: false });

          if (result.success) {
              successCount += 1;
          } else {
              failedCount += 1;
          }
      }

      await refreshData();
      setSavingAllPricing(false);

      if (failedCount === 0) {
          showToast(`Đã lưu ${successCount} cấu hình giá.`, 'success');
      } else if (successCount > 0) {
          showToast(`Đã lưu ${successCount}/${dirtyPricingRows.length} cấu hình giá.`, 'info');
      } else {
          showToast('Không lưu được thay đổi nào trong bảng giá.', 'error');
      }
  };

  const handleTogglePricingServer = async (modelId: string, serverId: string) => {
      const normalizedModelId = modelId.trim().toLowerCase();
      const normalizedServerId = serverId.trim().toLowerCase();
      const currentDisabled = new Set(serverAvailabilityConfig.disabledByModel?.[normalizedModelId] || []);

      if (currentDisabled.has(normalizedServerId)) {
          currentDisabled.delete(normalizedServerId);
      } else {
          currentDisabled.add(normalizedServerId);
      }

      const nextDisabledByModel = {
          ...(serverAvailabilityConfig.disabledByModel || {}),
          [normalizedModelId]: Array.from(currentDisabled),
      };

      if (nextDisabledByModel[normalizedModelId].length === 0) {
          delete nextDisabledByModel[normalizedModelId];
      }

      const nextConfig: TstServerAvailabilityConfig = {
          disabledByModel: nextDisabledByModel,
          autoDisabledCombos: serverAvailabilityConfig.autoDisabledCombos || {},
          manualReopenedCombos: serverAvailabilityConfig.manualReopenedCombos || {},
          updatedAt: new Date().toISOString(),
      };

      const result = await saveTstServerAvailabilityConfig(nextConfig);
      if (!result.success) {
          showToast(`Lỗi lưu cấu hình server: ${result.error}`, 'error');
          return;
      }

      setServerAvailabilityConfig(nextConfig);
      showToast('Đã cập nhật trạng thái server.', 'success');
  };

  const handleEnableAllPricingServers = async () => {
      const nextConfig: TstServerAvailabilityConfig = {
          disabledByModel: {},
          autoDisabledCombos: serverAvailabilityConfig.autoDisabledCombos || {},
          manualReopenedCombos: serverAvailabilityConfig.manualReopenedCombos || {},
          updatedAt: new Date().toISOString(),
      };

      const result = await saveTstServerAvailabilityConfig(nextConfig);
      if (!result.success) {
          showToast(`L\u1ed7i l\u01b0u c\u1ea5u h\u00ecnh server: ${result.error}`, 'error');
          return;
      }

      setServerAvailabilityConfig(nextConfig);
      showToast('\u0110\u00e3 b\u1eadt t\u1ea5t c\u1ea3 server.', 'success');
  };

  const handleFastOnlyPricingServers = async () => {
      const nextDisabledByModel: Record<string, string[]> = {};

      pricingServerGroups.forEach((group) => {
          const normalizedModelId = group.modelId.trim().toLowerCase();
          const normalizedServers = group.servers.map((serverId) => serverId.trim().toLowerCase());

          if (!normalizedServers.includes('fast')) {
              return;
          }

          const disabledServers = normalizedServers.filter((serverId) => serverId !== 'fast');
          if (disabledServers.length > 0) {
              nextDisabledByModel[normalizedModelId] = disabledServers;
          }
      });

      const nextConfig: TstServerAvailabilityConfig = {
          disabledByModel: nextDisabledByModel,
          autoDisabledCombos: serverAvailabilityConfig.autoDisabledCombos || {},
          manualReopenedCombos: serverAvailabilityConfig.manualReopenedCombos || {},
          updatedAt: new Date().toISOString(),
      };

      const result = await saveTstServerAvailabilityConfig(nextConfig);
      if (!result.success) {
          showToast(`L\u1ed7i l\u01b0u c\u1ea5u h\u00ecnh server: ${result.error}`, 'error');
          return;
      }

      setServerAvailabilityConfig(nextConfig);
      showToast('\u0110\u00e3 chuy\u1ec3n sang ch\u1ebf \u0111\u1ed9 ch\u1ec9 d\u00f9ng FAST.', 'success');
  };

  const handleRestorePricingServersFromLive = async () => {
      const nextConfig: TstServerAvailabilityConfig = {
          disabledByModel: {},
          autoDisabledCombos: serverAvailabilityConfig.autoDisabledCombos || {},
          manualReopenedCombos: serverAvailabilityConfig.manualReopenedCombos || {},
          updatedAt: new Date().toISOString(),
      };

      const result = await saveTstServerAvailabilityConfig(nextConfig);
      if (!result.success) {
          showToast(`L\u1ed7i l\u01b0u c\u1ea5u h\u00ecnh server: ${result.error}`, 'error');
          return;
      }

      setServerAvailabilityConfig(nextConfig);
      showToast('\u0110\u00e3 kh\u00f4i ph\u1ee5c c\u1ea5u h\u00ecnh server theo TST live.', 'success');
  };

  const activeAutoDisabledCombos = useMemo(() => {
      const now = Date.now();
      return Object.entries(serverAvailabilityConfig.autoDisabledCombos || {})
          .flatMap(([modelId, combos]) =>
              (Array.isArray(combos) ? combos : [])
                  .map((entry) => ({
                      modelId,
                      serverId: String(entry.serverId || '').trim().toLowerCase(),
                      speed: String(entry.speed || '').trim().toLowerCase(),
                      disabledUntil: String(entry.disabledUntil || ''),
                      hiddenAt: entry.hiddenAt ? String(entry.hiddenAt) : undefined,
                      reason: entry.reason ? String(entry.reason) : undefined,
                      hitCount: Number(entry.hitCount || 0) || 0,
                      windowHours: Number(entry.windowHours || 0) || 0,
                  }))
                  .filter((entry) => entry.serverId && entry.speed && new Date(entry.disabledUntil).getTime() > now),
          )
          .sort((a, b) => new Date(a.disabledUntil).getTime() - new Date(b.disabledUntil).getTime());
  }, [serverAvailabilityConfig]);

  const handleManualReopenAutoDisabledCombo = async (modelId: string, serverId: string, speed: string) => {
      const key = `${modelId}::${serverId}::${speed}`;
      setReopeningAutoDisabledKey(key);
      const nextAutoDisabledCombos = Object.fromEntries(
          Object.entries(serverAvailabilityConfig.autoDisabledCombos || {}).map(([entryModelId, combos]) => [
              entryModelId,
              (Array.isArray(combos) ? combos : []).filter((entry) => {
                  const sameServer = String(entry?.serverId || '').trim().toLowerCase() === serverId;
                  const sameSpeed = String(entry?.speed || '').trim().toLowerCase() === speed;
                  return !(entryModelId === modelId && sameServer && sameSpeed);
              }),
          ]).filter(([, combos]) => Array.isArray(combos) && combos.length > 0),
      );

      const nextConfig: TstServerAvailabilityConfig = {
          disabledByModel: serverAvailabilityConfig.disabledByModel || {},
          autoDisabledCombos: nextAutoDisabledCombos,
          manualReopenedCombos: {
              ...(serverAvailabilityConfig.manualReopenedCombos || {}),
              [modelId]: [
                  ...((serverAvailabilityConfig.manualReopenedCombos?.[modelId] || []).filter((entry) => {
                      const sameServer = String(entry?.serverId || '').trim().toLowerCase() === serverId;
                      const sameSpeed = String(entry?.speed || '').trim().toLowerCase() === speed;
                      return !(sameServer && sameSpeed);
                  })),
                  {
                      serverId,
                      speed,
                      reopenedAt: new Date().toISOString(),
                  },
              ],
          },
          updatedAt: new Date().toISOString(),
      };

      const result = await saveTstServerAvailabilityConfig(nextConfig);
      setReopeningAutoDisabledKey(null);
      if (!result.success) {
          showToast(`Lỗi mở lại combo: ${result.error}`, 'error');
          return;
      }

      setServerAvailabilityConfig(nextConfig);
      showToast('Đã mở lại combo server thủ công.', 'success');
  };

  const runSystemChecks = async (specificKey?: string) => {
      const startGemini = Date.now();
      const keyToUse = specificKey !== undefined ? specificKey : (apiKey || undefined);
      
      const geminiOk = await checkConnection(keyToUse);
      const geminiLatency = Date.now() - startGemini;
      const sbCheck = await checkSupabaseConnection();
      const r2Ok = await checkR2Connection();
      
      let storageStatus: 'connected' | 'disconnected' = 'disconnected';
      let storageType: 'R2' | 'Supabase' | 'None' = 'None';

      if (r2Ok) {
          storageStatus = 'connected';
          storageType = 'R2';
      } else if (sbCheck.storage) {
          storageStatus = 'connected';
          storageType = 'Supabase';
      }

      setHealth({
          gemini: { status: geminiOk ? 'connected' : 'disconnected', latency: geminiLatency },
          supabase: { status: sbCheck.db ? 'connected' : 'disconnected', latency: sbCheck.latency },
          storage: { status: storageStatus, type: storageType }
      });
      
      if (keyToUse || geminiOk) {
          setKeyStatus(geminiOk ? 'valid' : 'invalid');
      }
  };

  // --- ACTIONS ---

  const handleSaveApiKey = async () => {
      if (!apiKey.trim()) return;
      
      setKeyStatus('checking');
      const check = await checkConnection(apiKey);
      
      // Allow saving if valid OR if user confirms to bypass
      let shouldSave = check.success;
      if (!check.success) {
          setKeyStatus('invalid');
          if (window.confirm(`API Key này có vẻ không hoạt động:\n"${check.message}"\n\nBạn có chắc chắn muốn lưu nó vào Database không?`)) {
              shouldSave = true;
          }
      }

      if (shouldSave) {
          const result = await saveSystemApiKey(apiKey, apiKeyTier);
          if (result.success) {
              setKeyStatus('valid');
              showToast('Đã lưu API Key vào Database thành công!');
              setApiKey(''); // Clear input for security
              await refreshData(); 
              runSystemChecks();
          } else {
              setKeyStatus('unknown');
              showToast(`Lỗi Database: ${result.error}`, 'error');
          }
      } else {
          showToast(`Lỗi: ${check.message}`, 'error');
      }
  };

  const handleTestKey = async (key: string) => {
      showToast('Đang kiểm tra key...', 'info');
      const check = await checkConnection(key);
      if (check.success) {
          showToast('Kết nối thành công! Key hoạt động tốt.', 'success');
      } else {
          showToast(`Kết nối thất bại: ${check.message}`, 'error');
      }
  };

  const handleDeleteApiKey = async (id: string) => {
      showConfirm('Xóa API Key này khỏi database?', async () => {
          await deleteApiKey(id);
          refreshData();
          showToast('Đã xóa API Key');
      });
  }

  const buildAssetFallbackHistory = (images: GeneratedImage[]): HistoryItem[] => {
      return images
          .filter((image) => Number(image.cost || 0) > 0)
          .map((image) => ({
              id: `asset-charge-${image.id}`,
              createdAt: new Date(image.updatedAt || image.timestamp).toISOString(),
              description: image.toolName || image.toolId || (image.assetType === 'video' ? 'Tạo video AI' : 'Tạo ảnh AI'),
              vcoinChange: -Math.abs(Number(image.cost || 0)),
              balanceAfter: null,
              category: image.assetType === 'video' || String(image.queueKind || '').includes('video') || String(image.queueKind || '').includes('motion') ? 'video' as const : 'image' as const,
              referenceType: 'generated_image_charge',
              referenceId: image.id,
              toolName: image.toolName || image.toolId || null,
              assetType: image.assetType || 'image',
              queueKind: image.queueKind || null,
              jobStatus: image.status || null,
              type: 'usage' as const,
              status: 'success' as const,
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const handleViewUser = async (user: UserProfile) => {
      setViewingUser(user);
      setLoadingUserDetails(true);
      setUserLedgerDateScope('all');
      setUserLedgerSectionLimits({});
      setUserHistory([]);
      setUserImages([]);
      try {
          const [historyResult, imagesResult] = await Promise.allSettled([
              getAdminUserHistory(user.id),
              getUserImagesFromStorage(user.id, 80),
          ]);

          const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
          const images = imagesResult.status === 'fulfilled' ? imagesResult.value : [];
          const fallbackHistory = history.length === 0 ? buildAssetFallbackHistory(images) : [];

          setUserHistory(history.length > 0 ? history : fallbackHistory);
          setUserImages(images);
          setTotalImagesCreated(images.length);

          if (historyResult.status === 'rejected' && imagesResult.status === 'rejected') {
              throw historyResult.reason || imagesResult.reason;
          }
      } catch (e) {
          showToast('Lỗi tải dữ liệu người dùng', 'error');
      } finally {
          setLoadingUserDetails(false);
      }
  };

  const formatVcoinValue = (value?: number | null) => {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
      return `${Number(value).toLocaleString('vi-VN')} VC`;
  };

  const isRefundHistoryItem = (item: HistoryItem) =>
      item.type === 'refund' ||
      String(item.referenceType || '').toLowerCase().includes('refund') ||
      String(item.description || '').toLowerCase().includes('refund') ||
      String(item.description || '').toLowerCase().includes('hoàn');

  const getHistoryStatusClass = (item: HistoryItem) => {
      if (isRefundHistoryItem(item)) return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25';
      if (item.status === 'success') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
      if (item.status === 'pending') return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
      return 'bg-red-500/10 text-red-300 border-red-500/20';
  };

  const getHistoryStatusLabel = (item: HistoryItem) => {
      if (isRefundHistoryItem(item)) return 'Hoàn tiền';
      if (item.status === 'success') return 'Thành công';
      if (item.status === 'pending') return 'Đang chờ';
      return 'Thất bại';
  };

  const isHistoryItemInScope = (item: HistoryItem) => {
      if (userLedgerDateScope === 'all') return true;
      const createdAt = new Date(item.createdAt).getTime();
      if (!Number.isFinite(createdAt)) return false;
      const now = new Date();
      if (userLedgerDateScope === 'today') {
          return new Date(createdAt).toLocaleDateString('en-CA', { timeZone: VIETNAM_TIME_ZONE }) === now.toLocaleDateString('en-CA', { timeZone: VIETNAM_TIME_ZONE });
      }
      const days = userLedgerDateScope === '7d' ? 7 : 30;
      return now.getTime() - createdAt <= days * 24 * 60 * 60 * 1000;
  };

  const filteredUserHistory = userHistory.filter(isHistoryItemInScope);

  const openEditUser = (user: UserProfile) => {
      setEditingUser(user);
      setEditingUserOriginalBalance(Number(user.vcoin_balance || 0));
      setAdminUserAdjustmentReason('');
  };

  const userLedgerSections = [
      {
          id: 'image',
          title: 'Giao dịch tạo ảnh',
          description: 'Tạo ảnh, chỉnh sửa ảnh, tách nền, làm nét, hoàn tiền ảnh',
          icon: Icons.Image,
          items: filteredUserHistory.filter((item) => (item.category || (item.assetType === 'image' ? 'image' : 'other')) === 'image'),
      },
      {
          id: 'video',
          title: 'Giao dịch tạo video',
          description: 'Tạo video AI và Motion Control',
          icon: Icons.Video,
          items: filteredUserHistory.filter((item) => (item.category || (item.assetType === 'video' ? 'video' : 'other')) === 'video'),
      },
      {
          id: 'checkin',
          title: 'Giao dịch điểm danh',
          description: 'Điểm danh hằng ngày và thưởng tích lũy',
          icon: Icons.Calendar,
          items: filteredUserHistory.filter((item) => item.category === 'checkin'),
      },
      {
          id: 'topup',
          title: 'Giao dịch nạp tiền',
          description: 'Nạp tiền thành công, pending, thất bại hoặc hủy',
          icon: Icons.Gem,
          items: filteredUserHistory.filter((item) => item.category === 'topup' || item.type === 'topup' || item.type === 'pending_topup'),
      },
      {
          id: 'giftcode',
          title: 'Giao dịch giftcode',
          description: 'Nhập mã quà tặng và phần thưởng VCoin',
          icon: Icons.Gift,
          items: filteredUserHistory.filter((item) => item.category === 'giftcode' || item.type === 'giftcode'),
      },
      {
          id: 'admin_transaction',
          title: 'Giao dịch sửa VCoin',
          description: 'Admin chỉnh số dư trực tiếp cho tài khoản',
          icon: Icons.Settings,
          items: filteredUserHistory.filter((item) => item.category === 'admin_transaction' || item.type === 'admin_adjustment'),
      },
      {
          id: 'other',
          title: 'Điều chỉnh và giao dịch khác',
          description: 'Reward khác và các log hệ thống còn lại',
          icon: Icons.Activity,
          items: filteredUserHistory.filter((item) => {
              const category = item.category || 'other';
              return item.type !== 'admin_adjustment' && !['image', 'video', 'checkin', 'topup', 'giftcode', 'admin_transaction'].includes(category);
          }),
      },
  ];

  const userImageById = useMemo(() => {
      const lookup = new Map<string, GeneratedImage>();
      userImages.forEach((image) => {
          if (image.id) lookup.set(image.id, image);
      });
      return lookup;
  }, [userImages]);

  const getHistoryGeneratedAsset = (item: HistoryItem) => {
      const directId = String(item.referenceId || '').trim();
      if (directId && userImageById.has(directId)) return userImageById.get(directId) || null;
      const fallbackId = String(item.id || '').replace(/^asset-charge-/, '');
      return fallbackId && userImageById.has(fallbackId) ? userImageById.get(fallbackId) || null : null;
  };

  const getUserLedgerSectionLimit = (sectionId: string) => userLedgerSectionLimits[sectionId] || 10;

  const showMoreUserLedgerSection = (sectionId: string) => {
      setUserLedgerSectionLimits((current) => ({
          ...current,
          [sectionId]: (current[sectionId] || 10) + 10,
      }));
  };

  const filteredUsers = (stats?.usersList || [])
      .filter((u: any) => (u.email || '').toLowerCase().includes(userSearchEmail.toLowerCase()))
      .filter((u: UserProfile) => {
          if (userActivityFilter === 'all') return true;
          if (userActivityFilter === 'online') return isUserOnline(u.lastActive);

          const inactiveDays = getInactiveDays(u.lastActive);
          if (userActivityFilter === 'inactive_60') return inactiveDays >= 60;
          if (userActivityFilter === 'inactive_90') return inactiveDays >= 90;
          return true;
      })
      .sort((a: UserProfile, b: UserProfile) => {
          if (userSortMode === 'vcoin_desc') {
              return Number(b.vcoin_balance || 0) - Number(a.vcoin_balance || 0);
          }
          if (userSortMode === 'usage_desc') {
              return Number(b.usageCount || 0) - Number(a.usageCount || 0);
          }
          if (userSortMode === 'name_asc') {
              return (a.username || '').localeCompare(b.username || '', 'vi');
          }

          const aOnline = isUserOnline(a.lastActive);
          const bOnline = isUserOnline(b.lastActive);
          if (aOnline && !bOnline) return -1;
          if (!aOnline && bOnline) return 1;
          const timeA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
          const timeB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
          return timeB - timeA;
      });

  const visibleUsers = filteredUsers.slice(0, userListLimit);
  const queueStageOptions = Array.from(new Set(queueJobs.map((job) => job.queueStage).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
  const filteredQueueJobs = queueJobs.filter((job) => {
      switch (queueSummaryFilter) {
          case 'queued':
              return (job.displayStatus || job.status) === 'queued';
          case 'processing':
              return (job.displayStatus || job.status) === 'processing';
          case 'failed':
              return (job.displayStatus || job.status) === 'failed';
          case 'completed':
              return (job.displayStatus || job.status) === 'completed';
          case 'overdue_polls':
              return job.health?.code === 'poll_overdue';
          case 'untouched_queued':
              return job.health?.code === 'queued_stale';
          case 'stalled_pre_dispatch':
              return ['pre_dispatch_safe_requeue_due', 'pre_dispatch_provider_risk'].includes(job.health?.code || '');
          default:
              return true;
      }
  });
  const selectedQueuePrompt = selectedQueueJobDetail?.prompt || selectedQueueJobDetail?.job.prompt || 'Không có prompt';
  const selectedQueueMediaSections = selectedQueueJobDetail?.mediaSections || [];
  const orderedQueueMediaSections = [...selectedQueueMediaSections].sort((left, right) => {
      const order = { result: 0, reference: 1, sample: 2 };
      return order[left.key] - order[right.key];
  });
  const selectedQueueStatus = selectedQueueJobDetail?.job.displayStatus || selectedQueueJobDetail?.job.status;
  const getQueueStageLabel = (stage?: string) => {
      switch (stage) {
          case 'queued': return 'Đã vào hàng đợi';
          case 'preparing': return 'Đang chuẩn bị';
          case 'uploading_refs': return 'Đang tải ảnh tham chiếu';
          case 'synthesizing_prompt': return 'Đang xử lý prompt text + role metadata';
          case 'building_payload': return 'Đang dựng payload';
          case 'dispatching': return 'Đang gửi provider';
          case 'submitted': return 'Provider đã nhận job';
          case 'polling': return 'Đang chờ provider';
          case 'verifying_output': return 'Đang hậu kiểm kết quả';
          case 'completed': return 'Hoàn thành';
          case 'failed': return 'Thất bại';
          default: return stage || '-';
      }
  };
  const getQueueStatusLabel = (status?: string) => {
      switch (status) {
          case 'queued': return 'Đang chờ';
          case 'processing': return 'Đang xử lý';
          case 'completed': return 'Hoàn thành';
          case 'failed': return 'Thất bại';
          case 'rescuing': return 'Đang cứu kết quả';
          default: return status || '-';
      }
  };
  const getQueuePlatformLabel = (platform?: string) => {
      switch (platform) {
          case 'mobile': return 'Điện thoại';
          case 'desktop': return 'Máy tính';
          default: return 'Không rõ';
      }
  };
  const getQueueStatusClass = (status?: string) => {
      switch (status) {
          case 'failed': return 'bg-red-500/15 text-red-400';
          case 'completed': return 'bg-green-500/15 text-green-400';
          case 'processing': return 'bg-cyan-500/15 text-cyan-300';
          case 'rescuing': return 'bg-violet-500/15 text-violet-300';
          default: return 'bg-yellow-500/15 text-yellow-300';
      }
  };
  const handleQueueSummaryFilter = (filter: typeof queueSummaryFilter) => {
      setQueueSummaryFilter((current) => current === filter ? 'all' : filter);
  };
  const getQueueErrorCategoryLabel = (category?: string) => {
      switch (category) {
          case 'input': return 'Input';
          case 'queue': return 'Queue';
          case 'provider': return 'Provider';
          case 'config': return 'Config';
          default: return 'Unknown';
      }
  };
  const getQueueErrorCategoryClass = (category?: string) => {
      switch (category) {
          case 'input': return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
          case 'queue': return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20';
          case 'provider': return 'bg-violet-500/15 text-violet-300 border-violet-500/20';
          case 'config': return 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20';
          default: return 'bg-white/10 text-slate-300 border-white/10';
      }
  };

  const getAssetKind = (asset: GeneratedImage) => {
      if (asset.assetType) return asset.assetType;
      if (asset.toolId?.includes('video') || asset.toolId?.includes('motion')) return 'video';
      if ((asset.engine || '').toLowerCase().includes('kling') || (asset.engine || '').toLowerCase().includes('motion')) return 'video';
      if ((asset.url || '').toLowerCase().endsWith('.mp4') || (asset.url || '').toLowerCase().includes('.mp4?')) return 'video';
      return 'image';
  };

  useEffect(() => {
      setUserListLimit(30);
  }, [userSearchEmail, userActivityFilter, userSortMode]);

  useEffect(() => {
      if (!isAdmin || activeView !== 'queue') return;
      loadQueueJobs({ silent: false });
  }, [activeView, isAdmin, queueEmailFilter, queueStatusFilter, queueAssetFilter, queueTimeScope, queueStageFilter, queueStuckOnly]);
  useEffect(() => {
      setQueueSummaryFilter('all');
  }, [queueEmailFilter, queueStatusFilter, queueAssetFilter, queueTimeScope, queueStageFilter, queueStuckOnly]);

  const handleViewGiftcodeUsage = async (code: Giftcode) => {
      setViewingGiftcodeUsage(code);
      setLoadingGiftcodeUsers(true);
      try {
          const users = await getGiftcodeUsages(code.id);
          setGiftcodeUsers(users);
      } catch (e) {
          showToast('Lỗi tải danh sách người dùng', 'error');
      } finally {
          setLoadingGiftcodeUsers(false);
      }
  };

  const handleQueueReconcile = async () => {
      setReconcilingQueue(true);
      try {
          const payload = await runAdminQueueReconcile();
          const resetQueued = Number(payload?.resetSummary?.resetQueued || 0);
          const resetProcessing = Number(payload?.resetSummary?.resetProcessing || 0);
          const resetStalledPreDispatch = Number(payload?.resetSummary?.resetStalledPreDispatch || 0);
          const submitted = Number(payload?.summary?.submitted || 0);
          const polled = Number(payload?.summary?.claimedForPoll || 0);
          if (payload?.skipped && payload?.reason === 'dedicated_worker_mode') {
              showToast(`Reconcile đã reset queued=${resetQueued}, processing=${resetProcessing}, pre-dispatch=${resetStalledPreDispatch}. Worker riêng sẽ xử lý tiếp.`, 'success');
          } else {
              showToast(`Reconcile xong. Reset queued=${resetQueued}, processing=${resetProcessing}, pre-dispatch=${resetStalledPreDispatch}, poll=${polled}, submitted=${submitted}.`, 'success');
          }
          await loadQueueJobs({ silent: false });
      } catch (error: any) {
          showToast(`Lỗi reconcile queue: ${error?.message || error}`, 'error');
      } finally {
          setReconcilingQueue(false);
      }
  };

  const handleRescueFailedJobs = async () => {
      showConfirm('Kéo lại kết quả đã tạo xong từ TST cho mọi job đã fail timeout trong 7 ngày gần đây? Hành động này chỉ cập nhật job có result trên TST, không dispatch lại job mới.', async () => {
          setRescuingFailedQueueJobs(true);
          try {
              const payload = await forceRescueFailedQueueJobs({
                  assetType: 'all',
                  lookbackHours: 168,
                  limit: 50,
              });
              showToast(
                  `Rescue TST xong. Kiểm tra=${payload.checked}, kéo lại=${payload.rescued}, đưa về processing=${payload.revived}, ứng viên=${payload.totalCandidates}.`,
                  payload.rescued > 0 || payload.revived > 0 ? 'success' : 'info',
              );
              await loadQueueJobs({ silent: false });
          } catch (error: any) {
              showToast(`Lỗi rescue job TST: ${error?.message || error}`, 'error');
          } finally {
              setRescuingFailedQueueJobs(false);
          }
      });
  };

  const handleOpenQueueJobDetail = async (jobId: string) => {
      setSelectedQueueJobId(jobId);
      setSelectedQueueJobDetail(null);
      setQueuePromptExpanded(false);
      setLoadingQueueJobDetail(true);
      try {
          const detail = await getAdminQueueJobDetail(jobId);
          setSelectedQueueJobDetail(detail);
      } catch (error: any) {
          showToast(`Lỗi tải chi tiết job: ${error?.message || error}`, 'error');
      } finally {
          setLoadingQueueJobDetail(false);
      }
  };

  const handleStopQueueJob = async (jobId: string) => {
      showConfirm('Dừng thủ công job này? Queue sẽ ngừng poll/rescue và đánh dấu job là thất bại.', async () => {
          setStoppingQueueJob(true);
          try {
              const result = await stopAdminQueueJob(jobId);
              showToast(result?.refunded ? 'Đã dừng job và hoàn lại Vcoin.' : 'Đã dừng job.');
              await loadQueueJobs({ silent: false });
              if (selectedQueueJobId === jobId) {
                  const detail = await getAdminQueueJobDetail(jobId);
                  setSelectedQueueJobDetail(detail);
              }
          } catch (error: any) {
              showToast(`Không thể dừng job: ${error?.message || error}`, 'error');
          } finally {
              setStoppingQueueJob(false);
          }
      });
  };

  const handleSaveUser = async () => {
      if (editingUser) {
          const nextBalance = Number(editingUser.vcoin_balance || 0);
          const balanceChanged = editingUserOriginalBalance !== null && Math.abs(nextBalance - editingUserOriginalBalance) > 0.0001;
          const adjustmentReason = adminUserAdjustmentReason.trim();

          if (balanceChanged && !adjustmentReason) {
              showToast('Vui lòng nhập nội dung giao dịch sửa VCoin.', 'error');
              return;
          }

          const result = await updateAdminUserProfile(editingUser, { adjustmentReason });
          
          if (result.success) {
              setEditingUser(null);
              setEditingUserOriginalBalance(null);
              setAdminUserAdjustmentReason('');
              await refreshData();
              showToast('Cập nhật người dùng thành công!');
          } else {
              showToast(`Lỗi: ${result.error}`, 'error');
          }
      }
  };

  const handleSavePackage = async () => {
      if (editingPackage) {
          const result = await savePackage(editingPackage);
          if (result.success) {
              setEditingPackage(null);
              refreshData();
              showToast('Cập nhật gói nạp thành công!');
          } else {
              showToast(`Lỗi: ${result.error}`, 'error');
          }
      }
  };

  const handleDeletePackage = async (id: string) => {
      showConfirm('Bạn có chắc chắn muốn xóa gói nạp này?', async () => {
          const result = await deletePackage(id);
          if (result.success) {
              refreshData();
              if (result.action === 'hidden') {
                  showToast('Gói đã chuyển sang trạng thái ẨN (do có giao dịch lịch sử)', 'info');
              } else {
                  showToast('Đã xóa gói nạp vĩnh viễn');
              }
          } else {
              showToast('Lỗi khi xóa: ' + result.error, 'error');
          }
      });
  };

  const handleMovePackage = async (index: number, direction: number) => {
      const newPackages = [...packages];
      const newIndex = index + direction;

      if (newIndex < 0 || newIndex >= newPackages.length) return;

      [newPackages[index], newPackages[newIndex]] = [newPackages[newIndex], newPackages[index]];
      setPackages(newPackages);

      const result = await updatePackageOrder(newPackages);
      if (!result.success) {
          showToast('Lỗi khi lưu thứ tự: ' + result.error, 'error');
      }
  };

  const handleSaveGiftcode = async () => {
      if (editingGiftcode) {
          const result = await saveGiftcode(editingGiftcode);
          if (result.success) {
              setEditingGiftcode(null);
              refreshData();
              showToast('Lưu Giftcode thành công!');
          } else {
              showToast(`Lỗi: ${result.error}`, 'error');
              // Detect specific DB Error for missing column
              if (result.error?.includes('column') || result.error?.includes('schema cache')) {
                  setShowGiftcodeFix(true);
              }
          }
      }
  };

  const handleDeleteGiftcode = async (id: string) => {
      showConfirm('Xóa mã này vĩnh viễn?', async () => {
          await deleteGiftcode(id);
          refreshData();
          showToast('Đã xóa Giftcode');
      });
  };

  const handleSaveGiftcodePromo = async () => {
      if (giftcodePromo.isActive && !giftcodePromo.text.trim()) {
          showToast('Vui lòng nhập nội dung thông báo!', 'error');
          return;
      }
      const result = await saveGiftcodePromoConfig(giftcodePromo.text, giftcodePromo.isActive);
      if (result.success) {
          showToast('Đã lưu thông báo thành công!');
      } else {
          showToast('Lỗi lưu: ' + result.error, 'error');
          // If table system_settings is missing, trigger fix modal
          if (result.error?.includes('relation "public.system_settings" does not exist')) {
              setShowGiftcodeFix(true);
          }
      }
  }

  const handleSaveTutorialVideo = async () => {
      if (tutorialVideo.isActive && !tutorialVideo.url.trim()) {
          showToast('Vui lòng nhập link video YouTube!', 'error');
          return;
      }
      const result = await saveTutorialVideo(tutorialVideo.url, tutorialVideo.isActive);
      if (result.success) {
          showToast('Đã lưu link video hướng dẫn thành công!');
      } else {
          showToast('Lỗi lưu: ' + result.error, 'error');
      }
  }

  const handleSaveGenerationGuideImages = async () => {
      const result = await saveGenerationGuideImages(
          generationGuideImages.characterUrl,
          generationGuideImages.sampleUrl,
      );
      if (result.success) {
          showToast('Đã lưu ảnh ví dụ cho trình tạo ảnh!');
      } else {
          showToast('Lỗi lưu: ' + result.error, 'error');
      }
  }

  const handleSavePaymentGateway = async () => {
      const result = await savePaymentGatewayConfig(paymentGateway);
      if (result.success) {
          showToast('Đã lưu cổng thanh toán SePay!');
      } else {
          showToast('Lỗi lưu cổng thanh toán: ' + result.error, 'error');
      }
  }

  const handleSaveSystemAnnouncement = async () => {
      const result = await saveSystemAnnouncementConfig(systemAnnouncement);
      if (result.success) {
          showToast('Đã lưu thông báo hệ thống!');
      } else {
          showToast('Lỗi lưu thông báo hệ thống: ' + result.error, 'error');
      }
  }

  const handleToggleFeatureMaintenance = (featureId: string) => {
      setFeatureMaintenance((current) => {
          const currentIds = new Set(current.disabledFeatureIds || []);
          if (currentIds.has(featureId)) {
              currentIds.delete(featureId);
          } else {
              currentIds.add(featureId);
          }
          return {
              ...current,
              disabledFeatureIds: Array.from(currentIds),
          };
      });
  };

  const handleSaveFeatureMaintenance = async () => {
      const result = await saveFeatureMaintenanceConfig(featureMaintenance);
      if (result.success) {
          showToast('Đã lưu cấu hình bảo trì chức năng!', 'success');
      } else {
          showToast('Lỗi lưu bảo trì chức năng: ' + result.error, 'error');
      }
  };

  const updateAppTour = (tourId: string, updater: (tour: AppTourDefinition) => AppTourDefinition) => {
      setAppTours((current) => ({
          ...current,
          tours: current.tours.map((tour) => tour.id === tourId ? updater(tour) : tour),
      }));
  };

  const updateAppTourStep = (tourId: string, stepId: string, updater: (step: AppTourStep) => AppTourStep) => {
      updateAppTour(tourId, (tour) => ({
          ...tour,
          steps: tour.steps.map((step) => step.id === stepId ? updater(step) : step),
      }));
  };

  const handleAddTour = () => {
      const id = `tour_${Date.now()}`;
      const nextTour: AppTourDefinition = {
          id,
          title: 'Hướng dẫn mới',
          surface: 'desktop',
          screen: 'home',
          isActive: true,
          steps: [{
              id: `step_${Date.now()}`,
              targetId: 'desktop.home.features',
              title: 'Bước hướng dẫn',
              description: 'Nhập nội dung hướng dẫn tại đây.',
              placement: 'auto',
              order: 1,
              isActive: true,
          }],
      };
      setAppTours((current) => ({ ...current, tours: [...current.tours, nextTour] }));
      setSelectedTourId(id);
  };

  const handleDuplicateTour = (tour: AppTourDefinition) => {
      const id = `${tour.id}_copy_${Date.now()}`;
      const nextTour: AppTourDefinition = {
          ...tour,
          id,
          title: `${tour.title} Copy`,
          steps: tour.steps.map((step, index) => ({ ...step, id: `${id}_step_${index + 1}` })),
      };
      setAppTours((current) => ({ ...current, tours: [...current.tours, nextTour] }));
      setSelectedTourId(id);
  };

  const handleDeleteTour = (tourId: string) => {
      showConfirm('Xóa tour hướng dẫn này?', () => {
          setAppTours((current) => {
              const nextTours = current.tours.filter((tour) => tour.id !== tourId);
              setSelectedTourId(nextTours[0]?.id || '');
              return { ...current, tours: nextTours };
          });
      });
  };

  const handleAddTourStep = (tourId: string) => {
      updateAppTour(tourId, (tour) => {
          const nextOrder = (tour.steps || []).length + 1;
          const fallbackTarget = APP_TOUR_TARGETS.find((target) => target.surface === tour.surface && (target.screen === tour.screen || target.screen === 'global'));
          return {
              ...tour,
              steps: [
                  ...tour.steps,
                  {
                      id: `step_${Date.now()}`,
                      targetId: fallbackTarget?.id || '',
                      title: 'Bước hướng dẫn',
                      description: 'Nhập nội dung hướng dẫn tại đây.',
                      placement: 'auto',
                      order: nextOrder,
                      isActive: true,
                  },
              ],
          };
      });
  };

  const handleDeleteTourStep = (tourId: string, stepId: string) => {
      updateAppTour(tourId, (tour) => ({
          ...tour,
          steps: tour.steps.filter((step) => step.id !== stepId).map((step, index) => ({ ...step, order: index + 1 })),
      }));
  };

  const handleSaveAppTours = async () => {
      const result = await saveAppToursConfig(appTours);
      if (result.success) {
          window.dispatchEvent(new Event('auditionai:app-tours-updated'));
          showToast('Đã lưu cấu hình hướng dẫn!', 'success');
      } else {
          showToast('Lỗi lưu hướng dẫn: ' + result.error, 'error');
      }
  };
  const getQueueHealthClass = (severity?: string) => {
      switch (severity) {
          case 'ok': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
          case 'info': return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
          case 'critical': return 'bg-red-500/10 text-red-300 border-red-500/25';
          default: return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      }
  };

  const handleSavePromotion = async () => {
      if (editingPromotion) {
          const result = await savePromotion(editingPromotion);
          if (result.success) {
              setEditingPromotion(null);
              refreshData();
              showToast('Lưu chiến dịch thành công!');
          } else {
              showToast(`Lỗi: ${result.error}`, 'error');
          }
      }
  };

  const handleDeletePromotion = async (id: string) => {
      showConfirm('Xóa chiến dịch này vĩnh viễn?', async () => {
          await deletePromotion(id);
          refreshData();
          showToast('Đã xóa chiến dịch');
      });
  };

  const handleDeleteContent = async (id: string) => {
      showConfirm('Xóa vĩnh viễn hình ảnh này?', async () => {
          const targetImage = allImages.find((img) => img.id === id);
          await deleteImageFromStorage(id, targetImage?.userId, targetImage?.url);
          setAllImages(prev => prev.filter(img => img.id !== id));
          showToast('Đã xóa ảnh');
      });
  }

  const handleApproveTransaction = async (txId: string) => {
      if (processingTxId) return;

      showConfirm('Xác nhận duyệt giao dịch này và cộng Vcoin cho user?', async () => {
          setProcessingTxId(txId);
          const result = await adminApproveTransaction(txId);
          if (result.success) {
              setTransactions(prev => prev.map(t => 
                  t.id === txId ? { ...t, status: 'paid' } : t
              ));
              showToast('Đã duyệt thành công!');
              await refreshData();
          } else {
              showToast('Lỗi: ' + result.error, 'error');
              await refreshData();
          }
          setProcessingTxId(null);
      });
  }

  const handleRejectTransaction = async (txId: string) => {
      if (processingTxId) return;

      showConfirm('Từ chối giao dịch này?', async () => {
          setProcessingTxId(txId);
          const result = await adminRejectTransaction(txId);
          if (result.success) {
              setTransactions(prev => prev.map(t => 
                  t.id === txId ? { ...t, status: 'failed' } : t
              ));
              showToast('Đã từ chối giao dịch', 'info');
              await refreshData();
          } else {
              showToast('Lỗi: ' + result.error, 'error');
          }
          setProcessingTxId(null);
      });
  }

  const handleDeleteTransaction = async (txId: string) => {
      if (processingTxId) return;

      showConfirm('Xóa lịch sử giao dịch này khỏi hệ thống?', async () => {
          setProcessingTxId(txId);
          const res = await deleteTransaction(txId);
          if (res.success) {
              setTransactions(prev => prev.filter(t => t.id !== txId));
              showToast('Đã xóa giao dịch vĩnh viễn', 'info');
          } else {
               showToast('Lỗi xóa: ' + res.error, 'error');
          }
          setProcessingTxId(null);
      });
  }

  const handleCleanupImages = async () => {
      showConfirm('Xóa toàn bộ asset chưa publish đã quá 7 ngày trong lịch sử tạo (giữ lại ảnh đã public)?', async () => {
          showToast('Đang tiến hành xóa ảnh cũ...', 'info');
          try {
              const countDB = await cleanupExpiredImages(true);
              const countR2 = await cleanupR2Directly();
              showToast(`Đã dọn ${countDB} asset hết hạn khỏi lịch sử tạo và ${countR2} file legacy trên R2 Cloud.`);
              await refreshData();
          } catch (e: any) {
              showToast(`Lỗi khi xóa ảnh: ${e.message}`, 'error');
          }
      });
  };

  // --- BULK ACTIONS ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedTxIds(transactions.map(t => t.id));
      } else {
          setSelectedTxIds([]);
      }
  };

  const handleSelectTx = (id: string) => {
      setSelectedTxIds(prev => 
          prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
      );
  };

  const handleBulkApprove = async () => {
      if (selectedTxIds.length === 0) return;
      showConfirm(`Duyệt ${selectedTxIds.length} giao dịch đã chọn?`, async () => {
          const res = await adminBulkApproveTransactions(selectedTxIds);
          if (res.success) {
              showToast(`Đã duyệt ${res.count} giao dịch thành công!`);
              await refreshData();
              setSelectedTxIds([]);
          } else {
              showToast('Lỗi: ' + res.error, 'error');
          }
      });
  };

  const handleBulkReject = async () => {
      if (selectedTxIds.length === 0) return;
      showConfirm(`Từ chối ${selectedTxIds.length} giao dịch đã chọn?`, async () => {
          const res = await adminBulkRejectTransactions(selectedTxIds);
          if (res.success) {
              showToast(`Đã từ chối ${res.count} giao dịch!`, 'info');
              await refreshData();
              setSelectedTxIds([]);
          } else {
              showToast('Lỗi: ' + res.error, 'error');
          }
      });
  };

  // --- ACCESS DENIED ---
  if (!isAdmin) {
      return (
          <div className="flex flex-col items-center justify-center h-[70vh] text-center animate-fade-in">
              <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                  <Icons.Lock className="w-10 h-10 text-red-500" />
              </div>
              <h1 className="text-4xl font-game font-bold text-white mb-2">ACCESS DENIED</h1>
              <p className="text-slate-400 font-mono">Khu vực hạn chế. Cần quyền Admin cấp 5.</p>
          </div>
      );
  }

  // --- SUB-COMPONENTS ---
  const StatusBadge = ({ status, latency }: { status: string, latency?: number }) => (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase ${
          status === 'connected' ? 'bg-green-500/10 border-green-500 text-green-500' :
          status === 'checking' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' :
          'bg-red-500/10 border-red-500 text-red-500'
      }`}>
          <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'checking' ? 'bg-yellow-500 animate-bounce' : 'bg-red-500'}`}></div>
          {status === 'connected' ? 'Ổn định' : status === 'checking' ? 'Checking' : 'Mất kết nối'}
          {latency !== undefined && latency > 0 && <span className="text-[9px] opacity-70 ml-1">({latency}ms)</span>}
      </div>
  );

  const selectedTour = appTours.tours.find((tour) => tour.id === selectedTourId) || appTours.tours[0] || null;
  const tourFeatureIds = (tour: AppTourDefinition | null) =>
      (tour?.featureId || '').split(',').map((value) => value.trim()).filter(Boolean);
  const getTourTargetOptions = (tour: AppTourDefinition | null) => APP_TOUR_TARGETS.filter((target) => {
      if (!tour) return true;
      if (target.surface !== tour.surface) return false;
      const featureIds = tourFeatureIds(tour);
      const featureMatches = !target.featureId || featureIds.length === 0 || featureIds.includes(target.featureId);
      return (target.screen === 'global' || target.screen === tour.screen) && featureMatches;
  });
  const getTourTargetMeta = (targetId: string) => APP_TOUR_TARGETS.find((target) => target.id === targetId);
  const getTourTargetDescription = (targetId: string) => {
      const meta = getTourTargetMeta(targetId);
      if (meta?.description) return meta.description;
      if (targetId.includes('.layout.logo')) return 'Khoanh vùng logo AUDITION AI ở header. Người dùng có thể bấm để quay về trang chủ.';
      if (targetId.includes('.layout.language')) return 'Khoanh vùng nút đổi ngôn ngữ trên header máy tính.';
      if (targetId.includes('.layout.dock') || targetId.includes('.layout.bottomnav')) return 'Khoanh vùng thanh điều hướng chính ở cạnh dưới màn hình.';
      if (targetId.includes('.layout.vcoin')) return 'Khoanh vùng khu vực số dư VCOIN và lối vào nạp tiền.';
      if (targetId.includes('.layout.profile')) return 'Khoanh vùng nút tài khoản/cài đặt của người dùng.';
      if (targetId.includes('.home.checkin')) return 'Khoanh vùng nút điểm danh trên trang chủ.';
      if (targetId.includes('.home.features')) return 'Khoanh vùng danh sách công cụ AI trên trang chủ.';
      if (targetId.includes('.generation.characters')) return 'Khoanh vùng khu vực tải ảnh nhân vật trong trình tạo ảnh Audition.';
      if (targetId.includes('.generation.prompt')) return 'Khoanh vùng ô nhập mô tả/prompt trong trình tạo ảnh Audition.';
      if (targetId.includes('.generation.settings')) return 'Khoanh vùng khu vực chọn model, khung hình, độ phân giải, tốc độ và server trong trình tạo ảnh Audition.';
      if (targetId.includes('.generation.generate')) return 'Khoanh vùng nút bắt đầu tạo ảnh Audition.';
      if (targetId.includes('.image.references')) return 'Khoanh vùng khu vực ảnh tham chiếu của công cụ tạo ảnh AI.';
      if (targetId.includes('.image.prompt')) return 'Khoanh vùng ô nhập prompt của công cụ tạo ảnh AI.';
      if (targetId.includes('.image.settings') || targetId.includes('.image.model')) return 'Khoanh vùng khu vực chọn model, tỷ lệ, độ phân giải, tốc độ và máy chủ của công cụ tạo ảnh AI.';
      if (targetId.includes('.image.generate')) return 'Khoanh vùng nút tạo ảnh của công cụ tạo ảnh AI.';
      if (targetId.includes('.video.mode')) return 'Khoanh vùng nút chuyển giữa Video AI và Motion Control.';
      if (targetId.includes('.video.upload')) return 'Khoanh vùng khu vực tải ảnh/video đầu vào cho Video AI hoặc Motion Control.';
      if (targetId.includes('.video.prompt')) return 'Khoanh vùng ô mô tả chuyển động/kịch bản video.';
      if (targetId.includes('.video.settings') || targetId.includes('.video.model')) return 'Khoanh vùng khu vực chọn model, thời lượng, độ phân giải, tốc độ và máy chủ video.';
      if (targetId.includes('.video.generate')) return 'Khoanh vùng nút tạo video.';
      return 'Vị trí đã được gắn data-tour-id trong giao diện. Chọn target này để khoanh đúng khu vực tương ứng khi tour chạy.';
  };

  return (
    <div className="min-h-screen pb-24 animate-fade-in bg-[#05050A]">
      {/* --- TOASTS CONTAINER --- */}
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4 md:px-0">
          {toasts.map(t => (
              <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl animate-fade-in backdrop-blur-md ${
                  t.type === 'success' ? 'bg-[#0f1f12]/90 border-green-500/50 text-green-400' : 
                  t.type === 'error' ? 'bg-[#1f0f0f]/90 border-red-500/50 text-red-400' : 'bg-[#0f151f]/90 border-blue-500/50 text-blue-400'
              }`}>
                  {t.type === 'success' && <Icons.Check className="w-5 h-5 shrink-0" />}
                  {t.type === 'error' && <Icons.X className="w-5 h-5 shrink-0" />}
                  {t.type === 'info' && <Icons.Info className="w-5 h-5 shrink-0" />}
                  <span className="text-sm font-bold break-words">{t.msg}</span>
              </div>
          ))}
      </div>

      {/* --- CONFIRM / ALERT DIALOG (Updated Overlay) --- */}
      {confirmDialog.show && (
          <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 pt-24 animate-fade-in overflow-y-auto">
              <div className="bg-[#12121a] border border-white/20 p-6 rounded-2xl max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] transform scale-100 transition-all m-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-4 text-audi-yellow mx-auto">
                      <Icons.Bell className="w-6 h-6 animate-swing" />
                  </div>
                  <h3 className="text-lg font-bold text-white text-center mb-2">{confirmDialog.title || 'Thông báo'}</h3>
                  <p className="text-slate-400 text-center text-sm mb-6 leading-relaxed">{confirmDialog.msg}</p>
                  
                  <div className="flex gap-3">
                      {!confirmDialog.isAlertOnly && (
                          <button onClick={() => setConfirmDialog(prev => ({...prev, show: false}))} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors">
                              Hủy
                          </button>
                      )}
                      <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({...prev, show: false})) }} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold transition-colors shadow-lg">
                          {confirmDialog.isAlertOnly ? 'Đã hiểu' : 'Đồng ý'}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Top Command Bar */}
      <div className="bg-[#12121a] border-b border-white/10 sticky top-[72px] z-40 shadow-lg">
          <div className="w-full max-w-[1920px] mx-auto px-4 xl:px-6 2xl:px-8 py-3 flex flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-audi-pink flex items-center justify-center text-white font-bold shadow-lg shadow-audi-pink/30">
                      <Icons.Shield className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                      <h1 className="font-game text-base md:text-xl font-bold text-white leading-none">QUẢN TRỊ</h1>
                      <p className="text-[9px] md:text-[10px] text-audi-cyan font-mono tracking-widest mt-0.5 hidden md:block">V42.0.0-RELEASE • SYSTEM MONITOR</p>
                  </div>
              </div>

              {/* Quick Health Indicators (Compact Mobile) */}
              <div className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded-full border border-white/5">
                  <div title="Gemini" className={`w-2 h-2 rounded-full ${health.gemini.status === 'connected' ? 'bg-blue-500' : 'bg-red-500'}`}></div>
                  <div title="DB" className={`w-2 h-2 rounded-full ${health.supabase.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <div title="Storage" className={`w-2 h-2 rounded-full ${health.storage.status === 'connected' ? 'bg-orange-500' : 'bg-red-500'}`}></div>
              </div>
          </div>

          {/* Navigation Tabs (Scrollable) */}
          <div className="w-full max-w-[1920px] mx-auto px-4 xl:px-6 2xl:px-8 flex gap-2 overflow-x-auto no-scrollbar py-2 border-t border-white/5">
              {[
                  { id: 'overview', icon: Icons.Home, label: 'Tổng Quan' },
                  { id: 'transactions', icon: Icons.Gem, label: 'Giao Dịch' },
                  { id: 'users', icon: Icons.User, label: 'Người Dùng' },
                  { id: 'queue', icon: Icons.Clock, label: 'Queue Jobs' },
                  { id: 'packages', icon: Icons.ShoppingBag, label: 'Gói Nạp' },
                  { id: 'marketing', icon: Icons.Zap, label: 'Sự Kiện & Code' },
                  { id: 'pricing', icon: Icons.Gem, label: 'Bảng Giá' },
                  { id: 'styles', icon: Icons.Palette, label: 'Style Mẫu' },
                  { id: 'tours', icon: Icons.Info, label: 'Hướng Dẫn' },
                  { id: 'system', icon: Icons.Cpu, label: 'Hệ Thống' },
              ].map(tab => (
                  <button
                      key={tab.id}
                      onClick={() => setActiveView(tab.id as any)}
                      className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                          activeView === tab.id 
                          ? 'bg-white text-black shadow-md' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5 bg-white/5 border border-white/5'
                      }`}
                  >
                      <tab.icon className="w-3 h-3 md:w-4 md:h-4" />
                      {tab.label}
                  </button>
              ))}
          </div>
      </div>

      <div className="w-full max-w-[1920px] mx-auto px-4 xl:px-6 2xl:px-8 py-6 space-y-6">
          
          {/* ... (Existing Views) ... */}
          {activeView === 'overview' && (
              <div className="space-y-6 animate-slide-in-right">
                  {/* Grid 3x2 Dashboard */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                      {[
                          { title: 'Truy cập hôm nay', value: stats?.dashboard?.visitsToday, icon: Icons.Menu, color: 'text-white' },
                          { title: 'Tổng truy cập', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.visitsTotal || 0), icon: Icons.Cloud, color: 'text-audi-cyan' },
                          { title: 'User mới hôm nay', value: stats?.dashboard?.newUsersToday, icon: Icons.User, color: 'text-white' },
                          { title: 'Tổng User', value: stats?.dashboard?.usersTotal, icon: Icons.User, color: 'text-green-500' },
                          { title: 'Ảnh hôm nay', value: stats?.dashboard?.imagesToday, icon: Icons.Image, color: 'text-white' },
                          { title: 'Tổng số ảnh', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.imagesTotal || 0), icon: Icons.Image, color: 'text-audi-pink' },
                      ].map((item, i) => (
                          <div key={i} className="bg-[#12121a] border border-white/5 rounded-2xl p-4 md:p-6 relative overflow-hidden shadow-lg hover:border-white/10 transition-all">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-[9px] md:text-xs font-bold text-slate-400 uppercase mb-1 md:mb-2 truncate">{item.title}</p>
                                      <h3 className={`text-2xl md:text-4xl font-game font-bold ${item.color} drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]`}>
                                          {item.value}
                                      </h3>
                                  </div>
                                  <div className="p-2 md:p-3 bg-white/5 rounded-xl text-slate-400 hidden md:block">
                                      <item.icon className="w-6 h-6" />
                                  </div>
                              </div>
                              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                          </div>
                      ))}
                  </div>

                  {/* AI Stats Table */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-6 shadow-xl">
                      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                          <Icons.BarChart className="w-5 h-5 text-audi-yellow" />
                          Thống Kê Sử Dụng
                      </h3>
                      {/* ... (Existing table) ... */}
                      <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-400">
                              <thead className="bg-[#090014] text-xs font-bold text-slate-500 uppercase">
                                  <tr>
                                      <th className="px-6 py-4">Tính năng</th>
                                      <th className="px-6 py-4 text-audi-cyan">Số lượt</th>
                                      <th className="px-6 py-4 text-audi-pink">Vcoin tiêu thụ</th>
                                      <th className="px-6 py-4 text-right text-green-500">Doanh Thu (Ước tính)</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {stats?.dashboard?.aiUsage && stats.dashboard.aiUsage.length > 0 ? (
                                      stats.dashboard.aiUsage.map((row: any, i: number) => (
                                          <tr key={i} className="hover:bg-white/5 transition-colors">
                                              <td className="px-6 py-4 font-bold text-white capitalize">{row.feature}</td>
                                              <td className="px-6 py-4 text-audi-cyan font-mono">{new Intl.NumberFormat('de-DE').format(row.count)}</td>
                                              <td className="px-6 py-4 text-audi-pink font-bold">{new Intl.NumberFormat('de-DE').format(row.vcoins)} Vcoin</td>
                                              <td className="px-6 py-4 text-right text-green-500 font-bold">
                                                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.revenue)}
                                              </td>
                                          </tr>
                                      ))
                                  ) : (
                                      <tr>
                                          <td colSpan={4} className="px-6 py-8 text-center text-slate-500 italic">Chưa có dữ liệu.</td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                      <div className="md:hidden space-y-3">
                          {stats?.dashboard?.aiUsage && stats.dashboard.aiUsage.length > 0 ? (
                              stats.dashboard.aiUsage.map((row: any, i: number) => (
                                  <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5 flex justify-between items-center">
                                      <div>
                                          <div className="font-bold text-white capitalize text-sm">{row.feature}</div>
                                          <div className="text-xs text-slate-500">{new Intl.NumberFormat('de-DE').format(row.count)} lượt</div>
                                      </div>
                                      <div className="text-right">
                                          <div className="text-audi-pink font-bold text-sm">{new Intl.NumberFormat('de-DE').format(row.vcoins)} VC</div>
                                          <div className="text-green-500 text-[10px] font-bold">
                                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.revenue)}
                                          </div>
                                      </div>
                                  </div>
                              ))
                          ) : (
                              <div className="text-center text-slate-500 italic text-sm py-4">Chưa có dữ liệu.</div>
                          )}
                      </div>
                  </div>
              </div>
          )}

          {activeView === 'transactions' && (
              // ... existing transaction view ...
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Giao Dịch</h2>
                      <div className="text-xs text-slate-400">Users fetched: {stats?.usersList?.length || 0}</div>
                      <div className="flex gap-2">
                          {selectedTxIds.length > 0 && (
                              <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg animate-fade-in">
                                  <span className="text-xs font-bold text-white">{selectedTxIds.length} đã chọn</span>
                                  <button onClick={handleBulkApprove} className="p-1.5 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white" title="Duyệt tất cả"><Icons.Check className="w-4 h-4" /></button>
                                  <button onClick={handleBulkReject} className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white" title="Hủy tất cả"><Icons.X className="w-4 h-4" /></button>
                              </div>
                          )}
                          <button onClick={refreshData} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs md:text-sm font-bold text-white flex items-center gap-2">
                              <Icons.Clock className="w-3 h-3 md:w-4 md:h-4" /> Làm mới
                          </button>
                      </div>
                  </div>
                  {/* ... same table content ... */}
                  <div className="hidden md:block bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4 w-10">
                                      <input 
                                          type="checkbox" 
                                          className="rounded border-white/20 bg-white/5 checked:bg-audi-pink"
                                          checked={transactions.length > 0 && selectedTxIds.length === transactions.length}
                                          onChange={handleSelectAll}
                                      />
                                  </th>
                                  <th className="px-6 py-4">Thời gian</th>
                                  <th className="px-6 py-4">Mã đơn</th>
                                  <th className="px-6 py-4">Người dùng</th>
                                  <th className="px-6 py-4">Gói nạp</th>
                                  <th className="px-6 py-4 text-right">Số tiền</th>
                                  <th className="px-6 py-4">Trạng thái</th>
                                  <th className="px-6 py-4 text-right">Hành động</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {transactions.length === 0 ? (
                                  <tr><td colSpan={8} className="text-center py-8">Chưa có giao dịch nào.</td></tr>
                              ) : transactions.map(tx => (
                                  <tr key={tx.id} className={`hover:bg-white/5 transition-colors ${processingTxId === tx.id ? 'opacity-50 pointer-events-none' : ''} ${selectedTxIds.includes(tx.id) ? 'bg-white/5' : ''}`}>
                                      <td className="px-6 py-4">
                                          <input 
                                              type="checkbox" 
                                              className="rounded border-white/20 bg-white/5 checked:bg-audi-pink"
                                              checked={selectedTxIds.includes(tx.id)}
                                              onChange={() => handleSelectTx(tx.id)}
                                          />
                                      </td>
                                      <td className="px-6 py-4 text-xs font-mono">{new Date(tx.createdAt).toLocaleString()}</td>
                                      <td className="px-6 py-4 font-mono font-bold text-white">{tx.order_code || tx.code}</td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <img src={tx.userAvatar || 'https://picsum.photos/100/100'} className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                                              <div className="flex flex-col">
                                                  <span className="font-bold text-white text-xs">{tx.userName || 'Unknown'}</span>
                                                  <span className="text-[10px] text-slate-500">{tx.userEmail || 'No Email'}</span>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-audi-pink font-bold">+{tx.vcoin_received} Vcoin</td>
                                      <td className="px-6 py-4 text-right font-bold text-white">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || tx.price || 0)}</td>
                                      <td className="px-6 py-4">
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                              tx.status === 'paid' ? 'bg-green-500/20 text-green-500' : 
                                              tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'
                                          }`}>
                                              {tx.status}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                          <div className="flex justify-end gap-2">
                                              {tx.status === 'pending' && (
                                                  <>
                                                      <button onClick={() => handleApproveTransaction(tx.id)} className="p-2 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white" title="Duyệt"><Icons.Check className="w-4 h-4" /></button>
                                                      <button onClick={() => handleRejectTransaction(tx.id)} className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white" title="Hủy"><Icons.X className="w-4 h-4" /></button>
                                                  </>
                                              )}
                                              <button onClick={() => handleDeleteTransaction(tx.id)} className="p-2 bg-slate-500/20 text-slate-500 rounded hover:bg-slate-500 hover:text-white" title="Xóa"><Icons.Trash className="w-4 h-4" /></button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  {/* Mobile cards also same */}
                  <div className="md:hidden space-y-4">
                      {transactions.map(tx => (
                          <div key={tx.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 relative overflow-hidden shadow-md">
                              <div className={`absolute top-0 left-0 w-1 h-full ${
                                  tx.status === 'paid' ? 'bg-green-500' : 
                                  tx.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                              }`}></div>
                              <div className="pl-3">
                                  <div className="flex justify-between items-start mb-3">
                                      <div className="flex items-center gap-3">
                                          <img src={tx.userAvatar || 'https://picsum.photos/100/100'} className="w-10 h-10 rounded-full border border-white/10 object-cover bg-black" />
                                          <div>
                                              <div className="font-bold text-white text-sm">{tx.userName || 'Unknown'}</div>
                                              <div className="text-xs text-slate-500 font-mono">{tx.order_code || tx.code}</div>
                                          </div>
                                      </div>
                                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                          tx.status === 'paid' ? 'bg-green-500/10 text-green-500 border border-green-500/30' : 
                                          tx.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30' : 
                                          'bg-red-500/10 text-red-500 border border-red-500/30'
                                      }`}>
                                          {tx.status}
                                      </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4 mb-3 bg-white/5 p-3 rounded-lg">
                                      <div>
                                          <div className="text-[10px] text-slate-500 uppercase font-bold">Số tiền</div>
                                          <div className="text-white font-bold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || tx.price || 0)}</div>
                                      </div>
                                      <div>
                                          <div className="text-[10px] text-slate-500 uppercase font-bold">Gói nạp</div>
                                          <div className="text-audi-pink font-bold">+{tx.vcoin_received} Vcoin</div>
                                      </div>
                                  </div>
                                  <div className="flex gap-2 border-t border-white/5 pt-3">
                                      {tx.status === 'pending' && (
                                          <>
                                              <button onClick={() => handleApproveTransaction(tx.id)} className="flex-1 py-2 bg-green-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-green-500/20 active:scale-95 transition-all">DUYỆT</button>
                                              <button onClick={() => handleRejectTransaction(tx.id)} className="flex-1 py-2 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg font-bold text-xs active:scale-95 transition-all">HỦY</button>
                                          </>
                                      )}
                                      <button onClick={() => handleDeleteTransaction(tx.id)} className="px-3 py-2 bg-slate-800 text-slate-400 rounded-lg font-bold text-xs border border-white/10 active:scale-95"><Icons.Trash className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {activeView === 'users' && (
              // ... existing users view ...
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Người Dùng</h2>
                      <div className="w-full md:w-auto flex flex-col md:flex-row gap-3">
                          <div className="flex items-center gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2 w-full md:w-64">
                              <Icons.Search className="w-4 h-4 text-slate-500" />
                              <input type="text" placeholder="Tìm email..." value={userSearchEmail} onChange={(e) => setUserSearchEmail(e.target.value)} className="bg-transparent border-none outline-none text-sm text-white w-full placeholder-slate-500" />
                          </div>
                          <select
                              value={userActivityFilter}
                              onChange={(e) => setUserActivityFilter(e.target.value as typeof userActivityFilter)}
                              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none min-w-[210px]"
                          >
                              <option value="all" className="bg-[#12121a]">Tất cả người dùng</option>
                              <option value="online" className="bg-[#12121a]">Đang online</option>
                              <option value="inactive_60" className="bg-[#12121a]">Không online từ 60 ngày</option>
                              <option value="inactive_90" className="bg-[#12121a]">Không online từ 90 ngày</option>
                          </select>
                          <select
                              value={userSortMode}
                              onChange={(e) => setUserSortMode(e.target.value as typeof userSortMode)}
                              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none min-w-[190px]"
                          >
                              <option value="last_active_desc" className="bg-[#12121a]">Mới hoạt động gần đây</option>
                              <option value="vcoin_desc" className="bg-[#12121a]">Nhiều Vcoin nhất</option>
                              <option value="usage_desc" className="bg-[#12121a]">Hoạt động nhiều nhất</option>
                              <option value="name_asc" className="bg-[#12121a]">Tên A-Z</option>
                          </select>
                      </div>
                  </div>
                  
                  <div className="hidden md:block bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">User</th>
                                  <th className="px-6 py-4">Trạng thái</th>
                                  <th className="px-6 py-4">Số dư</th>
                                  <th className="px-6 py-4">Hoạt động (Gen)</th>
                                  <th className="px-6 py-4">Vai trò</th>
                                  <th className="px-6 py-4 text-right">Hành động</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {visibleUsers
                                  .map((u: UserProfile) => {
                                      const online = isUserOnline(u.lastActive);
                                      return (
                                          <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-3">
                                                      <div className="relative">
                                                          <img src={u.avatar} className="w-8 h-8 rounded-full border border-white/10 object-cover" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
                                                          {online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-[#12121a] rounded-full animate-pulse"></div>}
                                                      </div>
                                                      <div>
                                                          <div className="font-bold text-white">{u.username}</div>
                                                          <div className="text-xs text-slate-500">{u.email}</div>
                                                      </div>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-2">
                                                      <div className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-slate-600'}`}></div>
                                                      <span className={`text-xs font-bold ${online ? 'text-green-500' : 'text-slate-500'}`}>
                                                          {online ? 'Online' : getTimeAgo(u.lastActive)}
                                                      </span>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4 text-audi-yellow font-bold font-mono">{u.vcoin_balance}</td>
                                              <td className="px-6 py-4">
                                                  <span className="text-white font-bold">{u.usageCount || 0}</span>
                                                  <span className="text-xs text-slate-500 ml-1">lượt</span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                                      {u.role}
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                  <button onClick={() => handleViewUser(u)} className="text-xs font-bold text-audi-pink hover:text-white bg-audi-pink/10 hover:bg-audi-pink/30 px-3 py-1.5 rounded transition-colors">Chi tiết</button>
                                                  <button onClick={() => openEditUser(u)} className="text-xs font-bold text-audi-cyan hover:text-white bg-audi-cyan/10 hover:bg-audi-cyan/30 px-3 py-1.5 rounded transition-colors">Sửa</button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                          </tbody>
                      </table>
                  </div>
                  
                  {/* Mobile View */}
                  <div className="md:hidden space-y-4">
                      {visibleUsers
                          .map((u: UserProfile) => {
                              const online = isUserOnline(u.lastActive);
                              return (
                                  <div key={u.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 relative overflow-hidden">
                                      <div className="flex justify-between items-start mb-3">
                                          <div className="flex items-center gap-3">
                                              <div className="relative">
                                                  <img src={u.avatar} className="w-10 h-10 rounded-full border border-white/10 object-cover" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
                                                  {online && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#12121a] rounded-full animate-pulse"></div>}
                                              </div>
                                              <div>
                                                  <div className="font-bold text-white text-sm">{u.username}</div>
                                                  <div className="text-xs text-slate-500">{u.email}</div>
                                              </div>
                                          </div>
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                              {u.role}
                                          </span>
                                      </div>
                                      
                                      <div className="grid grid-cols-3 gap-2 mb-3 bg-white/5 p-2 rounded-lg">
                                          <div className="text-center">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Trạng thái</div>
                                              <div className={`text-xs font-bold ${online ? 'text-green-500' : 'text-slate-400'}`}>
                                                  {online ? 'Online' : getTimeAgo(u.lastActive)}
                                              </div>
                                          </div>
                                          <div className="text-center border-l border-white/10">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Số dư</div>
                                              <div className="text-xs font-bold text-audi-yellow">{u.vcoin_balance} VC</div>
                                          </div>
                                          <div className="text-center border-l border-white/10">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Hoạt động</div>
                                              <div className="text-xs font-bold text-white">{u.usageCount || 0} gen</div>
                                          </div>
                                      </div>

                                      <div className="flex gap-2 border-t border-white/5 pt-3">
                                          <button onClick={() => handleViewUser(u)} className="flex-1 py-2 bg-audi-pink/10 text-audi-pink rounded-lg font-bold text-xs border border-audi-pink/30">Chi tiết</button>
                                          <button onClick={() => openEditUser(u)} className="flex-1 py-2 bg-audi-cyan/10 text-audi-cyan rounded-lg font-bold text-xs border border-audi-cyan/30">Sửa</button>
                                      </div>
                                  </div>
                              );
                          })}
                  </div>

                  {filteredUsers.length > userListLimit && (
                      <div className="flex justify-center pt-2">
                          <button
                              onClick={() => setUserListLimit(prev => prev + 30)}
                              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white transition-colors"
                          >
                              Xem thêm 30 người dùng
                          </button>
                      </div>
                  )}
              </div>
          )}

          {activeView === 'queue' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                      <div>
                          <h2 className="text-lg md:text-2xl font-bold text-white">Queue Jobs</h2>
                          <p className="text-sm text-slate-400 mt-1">Theo dõi job đang kẹt, poll quá hạn và queued quá lâu.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                          <button onClick={() => loadQueueJobs({ silent: false })} disabled={loadingQueueJobs} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white disabled:opacity-60">
                              {loadingQueueJobs ? 'Đang tải...' : 'Làm mới'}
                          </button>
                          <button onClick={handleRescueFailedJobs} disabled={rescuingFailedQueueJobs} className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-bold disabled:opacity-60">
                              {rescuingFailedQueueJobs ? 'Đang cứu TST...' : 'Cứu job TST timeout'}
                          </button>
                          <button onClick={handleQueueReconcile} disabled={reconcilingQueue} className="px-4 py-2 rounded-xl bg-audi-pink hover:bg-pink-600 text-white text-sm font-bold disabled:opacity-60">
                              {reconcilingQueue ? 'Đang reconcile...' : 'Reconcile Queue'}
                          </button>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                      {[
                          { key: 'all', value: queueSummary.total, label: 'Tổng', color: 'text-white' },
                          { key: 'queued', value: queueSummary.queued, label: 'Queued', color: 'text-yellow-400' },
                          { key: 'processing', value: queueSummary.processing, label: 'Processing', color: 'text-audi-cyan' },
                          { key: 'failed', value: queueSummary.failed, label: 'Failed', color: 'text-red-400' },
                          { key: 'completed', value: queueSummary.completed, label: 'Completed', color: 'text-green-400' },
                          { key: 'overdue_polls', value: queueSummary.overduePolls, label: 'Poll quá hạn', color: 'text-red-300' },
                          { key: 'untouched_queued', value: queueSummary.untouchedQueued, label: 'Queued bị bỏ đói', color: 'text-orange-400' },
                          { key: 'stalled_pre_dispatch', value: queueSummary.stalledPreDispatch, label: 'Kẹt trước TST', color: 'text-pink-400' },
                      ].map((item) => (
                          <button
                              key={item.label}
                              type="button"
                              onClick={() => handleQueueSummaryFilter(item.key as typeof queueSummaryFilter)}
                              className={`text-left bg-[#12121a] border rounded-2xl p-4 transition-all hover:border-white/30 hover:bg-white/[0.07] ${
                                  queueSummaryFilter === item.key || (item.key === 'all' && queueSummaryFilter === 'all')
                                      ? 'border-audi-pink/60 shadow-[0_0_0_1px_rgba(255,0,153,0.25)]'
                                      : 'border-white/10'
                              }`}
                          >
                              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{item.label}</div>
                              <div className={`text-2xl font-black mt-2 ${item.color}`}>{item.value}</div>
                          </button>
                      ))}
                  </div>

                  {queueHealthReport && (
                      <div className="rounded-2xl border border-white/10 bg-[#12121a] p-4">
                          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                              <div>
                                  <div className="text-sm font-black text-white">Queue Health Report</div>
                                  <div className="mt-1 text-xs text-slate-400">
                                      Live DB: {
                                          isQueueHealthSnapshot(queueHealthReport.liveDbReport)
                                              ? `${queueHealthReport.liveDbReport.scanned || 0} job, ${queueHealthReport.liveDbReport.watchdogDue || 0} cần watchdog`
                                              : `chưa có RPC hoặc lỗi: ${'error' in (queueHealthReport.liveDbReport || {}) ? (queueHealthReport.liveDbReport as any).error : 'N/A'}`
                                      }
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                      Watchdog gần nhất: {queueHealthReport.lastWatchdogReportUpdatedAt ? getTimeAgo(queueHealthReport.lastWatchdogReportUpdatedAt) : 'chưa ghi snapshot'}
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                  {(() => {
                                      const live = isQueueHealthSnapshot(queueHealthReport.liveDbReport) ? queueHealthReport.liveDbReport : null;
                                      const counts = live?.counts || {};
                                      return [
                                          ['Queued stale', counts.queued_stale || 0, 'text-orange-300'],
                                          ['Safe requeue', counts.pre_dispatch_safe_requeue_due || 0, 'text-pink-300'],
                                          ['Provider risk', counts.pre_dispatch_provider_risk || 0, 'text-red-300'],
                                          ['Poll quá hạn', counts.poll_overdue || 0, 'text-red-200'],
                                      ].map(([label, value, color]) => (
                                          <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
                                              <div className={`mt-1 text-lg font-black ${color}`}>{value}</div>
                                          </div>
                                      ));
                                  })()}
                              </div>
                          </div>
                          {queueHealthReport.lastWatchdogReport?.summary?.healthAfter?.examples?.length ? (
                              <div className="mt-4 border-t border-white/10 pt-3">
                                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">Ví dụ job còn rủi ro sau watchdog</div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                      {queueHealthReport.lastWatchdogReport.summary.healthAfter.examples.slice(0, 6).map((item) => (
                                          <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                                              <div className="font-mono text-white">{item.id.slice(0, 12)}</div>
                                              <div className="mt-1 text-slate-400">{item.code || 'unknown'} · {item.stage || 'unknown'} · {item.ageSeconds || 0}s</div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ) : null}
                      </div>
                  )}

                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_170px_repeat(3,minmax(0,1fr))_170px] gap-3">
                          <div className="flex h-12 items-center gap-2 bg-white/5 rounded-xl border border-white/10 px-3">
                              <Icons.Search className="w-4 h-4 text-slate-500" />
                              <input type="text" placeholder="Email hoặc job id" value={queueEmailFilter} onChange={(e) => setQueueEmailFilter(e.target.value)} className="bg-transparent border-none outline-none text-sm text-white w-full placeholder-slate-500" />
                          </div>
                          <div className="flex h-12 items-center gap-1 bg-white/5 rounded-xl border border-white/10 p-1">
                              <button
                                  type="button"
                                  onClick={() => setQueueTimeScope('today')}
                                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${queueTimeScope === 'today' ? 'bg-audi-cyan text-slate-950' : 'text-white hover:bg-white/5'}`}
                              >
                                  Hôm nay
                              </button>
                              <button
                                  type="button"
                                  onClick={() => setQueueTimeScope('all')}
                                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${queueTimeScope === 'all' ? 'bg-audi-pink text-white' : 'text-white hover:bg-white/5'}`}
                              >
                                  Tất cả
                              </button>
                          </div>
                          <select value={queueStatusFilter} onChange={(e) => setQueueStatusFilter(e.target.value as typeof queueStatusFilter)} className="h-12 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white outline-none">
                              <option value="all" className="bg-[#12121a]">Trạng thái</option>
                              <option value="queued" className="bg-[#12121a]">Đang chờ</option>
                              <option value="processing" className="bg-[#12121a]">Đang xử lý</option>
                              <option value="rescuing" className="bg-[#12121a]">Đang cứu kết quả</option>
                              <option value="completed" className="bg-[#12121a]">Hoàn thành</option>
                              <option value="failed" className="bg-[#12121a]">Thất bại</option>
                          </select>
                          <select value={queueAssetFilter} onChange={(e) => setQueueAssetFilter(e.target.value as typeof queueAssetFilter)} className="h-12 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white outline-none">
                              <option value="all" className="bg-[#12121a]">Ảnh + Video</option>
                              <option value="image" className="bg-[#12121a]">Chỉ ảnh</option>
                              <option value="video" className="bg-[#12121a]">Chỉ video</option>
                          </select>
                          <select value={queueStageFilter} onChange={(e) => setQueueStageFilter(e.target.value)} className="h-12 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white outline-none">
                              <option value="all" className="bg-[#12121a]">Stage</option>
                              {queueStageOptions.map((stage) => (
                                  <option key={stage} value={stage} className="bg-[#12121a]">{getQueueStageLabel(stage)}</option>
                              ))}
                          </select>
                          <label className="flex h-12 items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white">
                              <span>Đang kẹt</span>
                              <input type="checkbox" className="accent-audi-pink" checked={queueStuckOnly} onChange={(e) => setQueueStuckOnly(e.target.checked)} />
                          </label>
                      </div>

                      <div className="hidden xl:block overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-300">
                              <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/10">
                                  <tr>
                                      <th className="px-3 py-3">User</th>
                                      <th className="px-3 py-3">Job</th>
                                      <th className="px-3 py-3">Trạng thái</th>
                                      <th className="px-3 py-3">Stage</th>
                                      <th className="px-3 py-3">Tiến trình</th>
                                      <th className="px-3 py-3">Cập nhật</th>
                                      <th className="px-3 py-3">Lỗi / Log cuối</th>
                                      <th className="px-3 py-3 text-right">Chi tiết</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {filteredQueueJobs.length === 0 ? (
                                      <tr>
                                          <td colSpan={8} className="px-3 py-8 text-center text-slate-500">Không có job nào khớp bộ lọc.</td>
                                      </tr>
                                  ) : filteredQueueJobs.map((job) => {
                                      const lastLogMessage = job.lastLogMessage || (job.queueLogs && job.queueLogs.length > 0 ? job.queueLogs[job.queueLogs.length - 1]?.message : '') || job.error || '-';
                                      return (
                                          <tr key={job.id} className="align-top hover:bg-white/5">
                                              <td className="px-3 py-3">
                                                  <div className="font-bold text-white">{job.userName || 'Unknown'}</div>
                                                  <div className="text-xs text-slate-500">{job.userEmail || job.userId}</div>
                                              </td>
                                              <td className="px-3 py-3">
                                                  <div className="text-white font-mono text-xs">{job.id.slice(0, 12)}</div>
                                                  <div className="text-xs text-slate-500 mt-1">{job.assetType === 'video' ? 'Video' : 'Ảnh'}</div>
                                                  <div className="text-[11px] text-slate-500 mt-1">thiết bị: {getQueuePlatformLabel(job.clientPlatform)}</div>
                                              </td>
                                              <td className="px-3 py-3">
                                                  <div className={`inline-flex px-2 py-1 rounded text-[11px] font-bold uppercase ${getQueueStatusClass(job.displayStatus || job.status)}`}>
                                                      {getQueueStatusLabel(job.displayStatus || job.status)}
                                                  </div>
                                                  {job.isStuck && <div className="text-[11px] text-orange-400 font-bold mt-2">{job.health?.label || 'STUCK'}</div>}
                                              </td>
                                              <td className="px-3 py-3 text-xs text-slate-300">{getQueueStageLabel(job.queueStage)}</td>
                                              <td className="px-3 py-3">
                                                  <div className="text-sm font-bold text-white">{job.progress || 0}%</div>
                                                  <div className="w-24 h-2 rounded-full bg-white/10 mt-2 overflow-hidden">
                                                      <div className={`h-full ${(job.displayStatus || job.status) === 'queued' ? 'bg-yellow-400' : (job.displayStatus || job.status) === 'rescuing' ? 'bg-violet-400' : 'bg-audi-cyan'}`} style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }} />
                                                  </div>
                                              </td>
                                              <td className="px-3 py-3 text-xs text-slate-400">
                                                  <div>{getTimeAgo(job.updatedAt)}</div>
                                                  {job.nextPollAt && <div className="mt-1">poll: {getTimeAgo(job.nextPollAt)}</div>}
                                              </td>
                                              <td className="px-3 py-3 text-xs text-slate-400 max-w-[360px]">
                                                  {job.health && (
                                                      <div className={`mb-2 rounded-lg border p-2 ${getQueueHealthClass(job.health.severity)}`}>
                                                          <div className="font-bold">{job.health.label}</div>
                                                          <div className="mt-1 text-[11px] leading-relaxed opacity-90">{job.health.detail}</div>
                                                          <div className="mt-1 text-[11px] font-bold opacity-95">Hành động: {job.health.action}</div>
                                                          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                                                              <span className="rounded bg-black/20 px-1.5 py-0.5">lease: {job.health.leaseState || '-'}</span>
                                                              {typeof job.health.recoveries === 'number' && <span className="rounded bg-black/20 px-1.5 py-0.5">recoveries: {job.health.recoveries}</span>}
                                                              {job.health.providerRisk && <span className="rounded bg-black/20 px-1.5 py-0.5">provider-risk</span>}
                                                              {job.health.safeToRequeue && <span className="rounded bg-black/20 px-1.5 py-0.5">safe-requeue</span>}
                                                          </div>
                                                      </div>
                                                  )}
                                                  {job.errorCategory && job.error && (
                                                      <div className={`inline-flex px-2 py-1 rounded border text-[10px] font-bold uppercase mb-2 ${getQueueErrorCategoryClass(job.errorCategory)}`}>
                                                          {getQueueErrorCategoryLabel(job.errorCategory)}
                                                      </div>
                                                  )}
                                                  <div className="text-red-300">{job.error || '-'}</div>
                                                  {lastLogMessage && <div className="mt-2 text-slate-300">{lastLogMessage}</div>}
                                                  {job.jobId && <div className="mt-1 text-[11px] text-audi-cyan">Provider ID: {job.jobId}</div>}
                                              </td>
                                              <td className="px-3 py-3 text-right">
                                                  <button onClick={() => handleOpenQueueJobDetail(job.id)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold">
                                                      Xem
                                                  </button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>

                      <div className="xl:hidden space-y-3">
                          {filteredQueueJobs.length === 0 ? (
                              <div className="text-center text-slate-500 py-6">Không có job nào khớp bộ lọc.</div>
                          ) : filteredQueueJobs.map((job) => {
                              const lastLogMessage = job.lastLogMessage || (job.queueLogs && job.queueLogs.length > 0 ? job.queueLogs[job.queueLogs.length - 1]?.message : '') || job.error || 'Chưa có log mới';
                              return (
                                  <div key={job.id} className="border border-white/10 rounded-xl p-4 bg-black/20">
                                      <div className="flex items-start justify-between gap-3">
                                          <div>
                                              <div className="font-bold text-white text-sm">{job.userName || 'Unknown'}</div>
                                              <div className="text-xs text-slate-500">{job.userEmail || job.userId}</div>
                                          </div>
                                          <div className="text-right">
                                              <div className={`inline-flex px-2 py-1 rounded text-[11px] font-bold uppercase ${getQueueStatusClass(job.displayStatus || job.status)}`}>{getQueueStatusLabel(job.displayStatus || job.status)}</div>
                                              {job.isStuck && <div className="text-[11px] text-orange-400 font-bold mt-1">{job.health?.label || 'STUCK'}</div>}
                                          </div>
                                      </div>
                                          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                                          <div><span className="text-slate-500">Job</span><div className="text-white font-mono mt-1">{job.id.slice(0, 12)}</div></div>
                                          <div><span className="text-slate-500">Stage</span><div className="text-white mt-1">{getQueueStageLabel(job.queueStage)}</div></div>
                                          <div><span className="text-slate-500">Loại</span><div className="text-white mt-1">{job.assetType === 'video' ? 'Video' : 'Ảnh'}</div></div>
                                          <div><span className="text-slate-500">Thiết bị</span><div className="text-white mt-1">{getQueuePlatformLabel(job.clientPlatform)}</div></div>
                                          <div><span className="text-slate-500">Cập nhật</span><div className="text-white mt-1">{getTimeAgo(job.updatedAt)}</div></div>
                                      </div>
                                      {job.errorCategory && job.error && (
                                          <div className={`inline-flex mt-3 px-2 py-1 rounded border text-[10px] font-bold uppercase ${getQueueErrorCategoryClass(job.errorCategory)}`}>
                                              {getQueueErrorCategoryLabel(job.errorCategory)}
                                          </div>
                                      )}
                                      {job.health && (
                                          <div className={`mt-3 rounded-xl border p-3 text-xs ${getQueueHealthClass(job.health.severity)}`}>
                                              <div className="font-black">{job.health.label}</div>
                                              <div className="mt-1 leading-relaxed opacity-90">{job.health.detail}</div>
                                              <div className="mt-2 font-bold">Hành động: {job.health.action}</div>
                                              <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                                                  <span className="rounded bg-black/20 px-1.5 py-0.5">lease: {job.health.leaseState || '-'}</span>
                                                  {typeof job.health.recoveries === 'number' && <span className="rounded bg-black/20 px-1.5 py-0.5">recoveries: {job.health.recoveries}</span>}
                                                  {job.health.providerRisk && <span className="rounded bg-black/20 px-1.5 py-0.5">provider-risk</span>}
                                                  {job.health.safeToRequeue && <span className="rounded bg-black/20 px-1.5 py-0.5">safe-requeue</span>}
                                              </div>
                                          </div>
                                      )}
                                      <div className="mt-3 text-xs text-slate-300">{lastLogMessage}</div>
                                      {job.jobId && <div className="mt-1 text-[11px] text-audi-cyan">Provider ID: {job.jobId}</div>}
                                      <button onClick={() => handleOpenQueueJobDetail(job.id)} className="mt-3 w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold">
                                          Xem chi tiết input
                                      </button>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              </div>
          )}

          {activeView === 'packages' && (
              // ... existing packages view ...
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Gói Nạp</h2>
                      <button onClick={() => setEditingPackage({id: `temp_${Date.now()}`, name: 'Gói Mới', vcoin: 100, price: 50000, currency: 'VND', bonusText: '', bonusPercent: 0, isPopular: false, isActive: true, displayOrder: packages.length, colorTheme: 'border-slate-600', transferContent: 'NAP 50K'})} className="px-3 py-1.5 md:px-4 md:py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"><Icons.Plus className="w-4 h-4" /> Thêm Gói</button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                      {packages.map((pkg, idx) => (
                          <div key={pkg.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 flex items-center justify-between group hover:border-white/30 transition-all shadow-md">
                              <div className="flex items-center gap-3 md:gap-4">
                                  <div className="flex flex-col gap-1 pr-3 md:pr-4 border-r border-white/10">
                                      <button onClick={() => handleMovePackage(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-white/10 rounded text-slate-500 disabled:opacity-30"><Icons.ArrowUp className="w-3 h-3" /></button>
                                      <button onClick={() => handleMovePackage(idx, 1)} disabled={idx === packages.length - 1} className="p-1 hover:bg-white/10 rounded text-slate-500 disabled:opacity-30"><Icons.ArrowUp className="w-3 h-3 rotate-180" /></button>
                                  </div>
                                  <div className={`w-10 h-10 rounded-full border-2 ${pkg.colorTheme} flex items-center justify-center bg-black/50 shrink-0`}><Icons.Gem className="w-5 h-5 text-white" /></div>
                                  <div>
                                      <h4 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">{pkg.name} {!pkg.isActive && <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded">HIDDEN</span>} {pkg.isPopular && <span className="text-[9px] bg-audi-pink text-white px-1.5 py-0.5 rounded">HOT</span>}</h4>
                                      <div className="flex gap-3 text-xs text-slate-400 mt-1"><span><b className="text-green-400">{(pkg.price || 0).toLocaleString()}đ</b></span><span><b className="text-audi-yellow">{pkg.vcoin || 0} VC</b></span>{pkg.bonusPercent > 0 && <span className="text-audi-pink">+{pkg.bonusPercent}%</span>}</div>
                                  </div>
                              </div>
                              <div className="flex gap-2"><button onClick={() => setEditingPackage({ id: pkg.id || '', name: pkg.name || '', price: pkg.price || 0, vcoin: pkg.vcoin || 0, bonusPercent: pkg.bonusPercent || 0, bonusText: pkg.bonusText || '', transferContent: pkg.transferContent || '', isPopular: !!pkg.isPopular, isActive: pkg.isActive !== false, colorTheme: pkg.colorTheme || 'border-slate-600', displayOrder: pkg.displayOrder || 0, currency: pkg.currency || 'VND' })} className="p-2 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white"><Icons.Settings className="w-4 h-4" /></button><button onClick={() => handleDeletePackage(pkg.id)} className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white"><Icons.Trash className="w-4 h-4" /></button></div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {activeView === 'marketing' && (
              <div className="space-y-10 animate-slide-in-right">
                  {/* Promotion Section */}
                  <div className="space-y-6">
                      <div className="flex justify-between items-center">
                          <h2 className="text-lg md:text-2xl font-bold text-white">Chiến Dịch Khuyến Mãi</h2>
                          <div className="flex gap-2"><button onClick={refreshData} className="px-3 py-2 bg-white/10 text-white rounded-lg font-bold hover:bg-white/20" title="Làm mới danh sách"><Icons.Clock className="w-4 h-4" /></button><button onClick={() => setEditingPromotion({id: `temp_${Date.now()}`, name: '', marqueeText: '', bonusPercent: 10, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 86400000).toISOString(), isActive: true})} className="px-3 py-2 md:px-4 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"><Icons.Plus className="w-4 h-4" /> <span className="hidden md:inline">Tạo Chiến Dịch Mới</span><span className="md:hidden">Mới</span></button></div>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                          {promotions.map(p => {
                              const now = new Date().getTime(); const start = new Date(p.startTime).getTime(); const end = new Date(p.endTime).getTime();
                              let statusBadge = <span className="text-slate-500 text-xs font-bold border border-slate-500/20 px-2 py-1 rounded">Stopped</span>;
                              if (p.isActive) { if (now < start) statusBadge = <span className="text-yellow-500 text-xs font-bold border border-yellow-500/20 px-2 py-1 rounded flex items-center gap-1"><Icons.Clock className="w-3 h-3" /> Scheduled</span>; else if (now > end) statusBadge = <span className="text-slate-500 text-xs font-bold border border-slate-500/20 px-2 py-1 rounded">Expired</span>; else statusBadge = <span className="text-green-500 text-xs font-bold border border-green-500/20 px-2 py-1 rounded flex items-center gap-1 animate-pulse"><Icons.Zap className="w-3 h-3" /> Running</span>; } else { statusBadge = <span className="text-red-500 text-xs font-bold border border-red-500/20 px-2 py-1 rounded">Disabled</span>; }
                              return (<div key={p.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"><div className="flex-1"><div className="flex justify-between items-start"><div><div className="font-bold text-white text-lg">{p.name}</div><div className="text-audi-pink font-bold text-sm">+{p.bonusPercent}% Vcoin Bonus</div></div><div className="md:hidden">{statusBadge}</div></div><div className="text-xs font-mono mt-2 space-y-1 bg-black/20 p-2 rounded-lg border border-white/5"><div className="text-green-400 flex items-center gap-2"><Icons.Calendar className="w-3 h-3"/> Start: {formatVietnamDateTimeDisplay(p.startTime)}</div><div className="text-red-400 flex items-center gap-2"><Icons.Calendar className="w-3 h-3"/> End: {formatVietnamDateTimeDisplay(p.endTime)}</div></div></div><div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-white/5 pt-3 md:pt-0"><div className="hidden md:block">{statusBadge}</div><div className="flex gap-2"><button onClick={() => setEditingPromotion(p)} className="px-3 py-2 bg-blue-500/20 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white font-bold text-xs"><Icons.Settings className="w-4 h-4" /></button><button onClick={() => handleDeletePromotion(p.id)} className="px-3 py-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500 hover:text-white font-bold text-xs"><Icons.Trash className="w-4 h-4" /></button></div></div></div>);
                          })}
                      </div>
                  </div>

                  {/* Giftcode Section */}
                  <div className="space-y-6 pt-6 border-t border-white/10">
                      <div className="flex justify-between items-center">
                          <h2 className="text-lg md:text-2xl font-bold text-white">Quản Lý Giftcode</h2>
                          <div className="flex gap-2">
                              <button onClick={() => setEditingGiftcode({id: `temp_${Date.now()}`, code: '', campaignKey: '', reward: 10, totalLimit: 100, usedCount: 0, maxPerUser: 1, isActive: true})} className="px-3 py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"><Icons.Plus className="w-4 h-4" /> <span className="hidden md:inline">Tạo Code</span><span className="md:hidden">Tạo</span></button>
                          </div>
                      </div>
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-6 mb-6">
                          <h3 className="font-bold text-white mb-4 flex items-center gap-2"><Icons.Bell className="w-5 h-5 text-audi-yellow" /> Cấu Hình Thông Báo Sự Kiện (Nổi bật)</h3>
                          <div className="space-y-4">
                              <input type="text" value={giftcodePromo.text} onChange={(e) => setGiftcodePromo({...giftcodePromo, text: e.target.value})} placeholder="Ví dụ: Nhập CODE 'HELLO2026' để nhận 20 Vcoin miễn phí" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-audi-cyan outline-none" />
                              <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2 cursor-pointer bg-white/5 px-4 py-2 rounded-lg border border-white/5 hover:bg-white/10 transition-colors"><input type="checkbox" checked={giftcodePromo.isActive} onChange={(e) => setGiftcodePromo({...giftcodePromo, isActive: e.target.checked})} className="accent-audi-cyan w-4 h-4" /><span className="text-sm font-bold text-white">Hiển thị thông báo này</span></label>
                                  <button onClick={handleSaveGiftcodePromo} className="px-4 py-2 bg-audi-cyan/20 text-audi-cyan hover:bg-audi-cyan hover:text-black font-bold rounded-lg transition-colors border border-audi-cyan/30 text-xs md:text-sm">Lưu Cấu Hình</button>
                              </div>
                          </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {giftcodes.map(code => (
                              <div key={code.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 shadow-sm relative overflow-hidden">
                                  <div className="flex justify-between items-start mb-3"><div><div className="font-mono font-bold text-white text-lg tracking-wider">{code.code}</div><div className="text-[10px] text-slate-400 font-bold uppercase mt-1">Chiến dịch: {code.campaignKey || code.code}</div><div className="text-audi-yellow font-bold text-sm mt-1">+{code.reward} Vcoin</div></div>{code.isActive ? <span className="text-green-500 text-[10px] font-bold border border-green-500/20 px-2 py-1 rounded bg-green-500/10">ACTIVE</span> : <span className="text-red-500 text-[10px] font-bold border border-red-500/20 px-2 py-1 rounded bg-red-500/10">INACTIVE</span>}</div>
                                  <div className="mb-3"><div className="flex justify-between text-[10px] text-slate-500 mb-1 font-bold uppercase"><span>Sử dụng</span><span>{code.usedCount}/{code.totalLimit}</span></div><div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, (code.usedCount / code.totalLimit) * 100)}%` }}></div></div></div>
                                  <div className="flex justify-between items-center border-t border-white/5 pt-3">
                                      <span className="text-[10px] text-slate-500">Max: {code.maxPerUser}/người</span>
                                      <div className="flex gap-2">
                                          <button onClick={() => handleViewGiftcodeUsage(code)} className="p-1.5 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white transition-colors" title="Xem người dùng"><Icons.Users className="w-4 h-4" /></button>
                                          <button onClick={() => setEditingGiftcode(code)} className="p-1.5 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white transition-colors"><Icons.Settings className="w-4 h-4" /></button>
                                          <button onClick={() => handleDeleteGiftcode(code.id)} className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}

           {/* ================= VIEW: STYLES ================= */}
           {activeView === 'pricing' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <div>
                          <h2 className="text-lg md:text-2xl font-bold text-white">Bảng Giá Dịch Vụ AI</h2>
                          <p className="text-sm text-slate-400 mt-1">
                              TST là chi phí gốc live theo Trạm Sáng Tạo. 3 tool chỉnh sửa ảnh đang dùng giá riêng trên Vertex/AUDITION AI để bạn chỉnh độc lập.
                          </p>
                      </div>
                      <div className="flex gap-2">
                          <button
                              onClick={async () => {
                                  try {
                                      clearTstCatalogCache();
                                      await syncTSTPrices();
                                      await refreshData();
                                      showToast('Đã làm mới giá TST live.', 'success');
                                  } catch (error) {
                                      showToast('Lỗi khi làm mới bảng giá TST.', 'error');
                                  }
                              }}
                              className="px-3 py-2 bg-audi-cyan/20 text-audi-cyan rounded-lg font-bold flex items-center gap-2 hover:bg-audi-cyan hover:text-black text-xs md:text-sm transition-colors"
                          >
                              <Icons.RefreshCw className="w-4 h-4" />
                              <span className="hidden md:inline">Làm Mới TST</span>
                              <span className="md:hidden">Làm mới</span>
                          </button>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4">
                          <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Cấu hình live</div>
                          <div className="mt-2 text-3xl font-bold text-white">{pricingRows.length}</div>
                          <div className="text-xs text-slate-400 mt-1">Bao gồm image, video, motion control và 3 tool Vertex.</div>
                      </div>
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4">
                          <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Models</div>
                          <div className="mt-2 text-3xl font-bold text-audi-cyan">{new Set(pricingRows.map(row => row.modelId)).size}</div>
                          <div className="text-xs text-slate-400 mt-1">Nguồn live lấy trực tiếp từ catalog runtime của TST.</div>
                      </div>
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4">
                          <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Quy đổi gốc</div>
                          <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                              1 Credit = 40đ. 1 Vcoin = 1000đ. Bạn có thể chỉnh giá AUDITION AI cao hơn hoặc thấp hơn tùy chiến lược lợi nhuận.
                          </div>
                      </div>
                  </div>

                  <div className="rounded-2xl border border-audi-yellow/25 bg-audi-yellow/10 p-4 text-sm text-audi-yellow">
                      <div className="font-black uppercase tracking-wider">Kling tính phí theo giây</div>
                      <div className="mt-1 text-xs leading-relaxed text-yellow-100/80">
                          Các model Kling Video và Kling/Motion Control dùng đơn vị <b>Vcoin/s</b>. Trong bảng bên dưới, ô AUDITION AI của các dòng này là giá mỗi giây, không phải giá trọn gói. Tổng phí người dùng trả = giá mỗi giây × số giây video.
                      </div>
                  </div>

                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                              <h3 className="text-sm md:text-base font-bold text-white">Điều khiển Server</h3>
                              <p className="text-xs text-slate-400 mt-1">
                                  Bật hoặc khóa từng server theo từng model. UI và backend sẽ cùng chặn các server đang khóa.
                              </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                              <button
                                  onClick={handleEnableAllPricingServers}
                                  className="px-3 py-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-bold transition-colors"
                              >
                                  {'B\u1eadt t\u1ea5t c\u1ea3 server'}
                              </button>
                              <button
                                  onClick={handleFastOnlyPricingServers}
                                  className="px-3 py-2 rounded-xl border border-audi-cyan/30 bg-audi-cyan/10 text-audi-cyan hover:bg-audi-cyan/20 text-xs font-bold transition-colors"
                              >
                                  {'Ch\u1ec9 d\u00f9ng FAST'}
                              </button>
                              <button
                                  onClick={handleRestorePricingServersFromLive}
                                  className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 text-xs font-bold transition-colors"
                              >
                                  {'Kh\u00f4i ph\u1ee5c theo TST live'}
                              </button>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {pricingServerGroups.map((group) => (
                              <div key={group.modelId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                      <div>
                                          <div className="text-sm font-bold text-white">{group.modelName}</div>
                                          <div className="text-[10px] mt-1 font-mono text-slate-500">{group.modelId}</div>
                                      </div>
                                      <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                          {group.type === 'motion-control' ? 'Motion' : group.type}
                                      </span>
                                  </div>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                      {group.servers.map((serverId) => {
                                          const enabled = isServerEnabledForModel(serverAvailabilityConfig, group.modelId, serverId);
                                          return (
                                              <button
                                                  key={`${group.modelId}_${serverId}`}
                                                  onClick={() => handleTogglePricingServer(group.modelId, serverId)}
                                                  className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                                                      enabled
                                                          ? 'border-audi-cyan/40 bg-audi-cyan/15 text-audi-cyan hover:bg-audi-cyan hover:text-black'
                                                          : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                                                  }`}
                                              >
                                                  <span>{tstServerToUi(serverId)}</span>
                                                  <span className="ml-2 text-[10px] uppercase tracking-wider opacity-80">
                                                      {enabled ? 'Bật' : 'Khóa'}
                                                  </span>
                                              </button>
                                          );
                                      })}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>

                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-5">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                              <h3 className="text-sm md:text-base font-bold text-white">Lưu giá AUDITION AI</h3>
                              <p className="text-xs text-slate-400 mt-1">
                                  Mỗi thay đổi giá sẽ được giữ tạm ngay trên máy của bạn. Nếu chưa bấm lưu, F5 vẫn giữ lại bản nháp nhưng sẽ chưa cập nhật vào database.
                              </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-3 py-2 rounded-xl border text-xs font-bold ${
                                  dirtyPricingCount > 0
                                      ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              }`}>
                                  {dirtyPricingCount > 0 ? `${dirtyPricingCount} thay đổi chưa lưu` : 'Tất cả thay đổi đã được lưu'}
                              </span>
                              <button
                                  onClick={handleSaveAllPricing}
                                  disabled={dirtyPricingCount === 0 || savingAllPricing}
                                  className="px-4 py-2 rounded-xl bg-audi-pink/20 text-audi-pink font-bold hover:bg-audi-pink hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                  {savingAllPricing ? 'Đang lưu...' : 'Lưu tất cả thay đổi'}
                              </button>
                          </div>
                      </div>
                  </div>

                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                              <h3 className="text-sm md:text-base font-bold text-white">Combo Auto-Hide Đang Hoạt Động</h3>
                              <p className="text-xs text-slate-400 mt-1">
                                  Tự động khóa tạm đúng combo model + tốc độ + server nếu có hơn 5 job timeout trong 5 giờ.
                              </p>
                          </div>
                          <span className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-slate-200">
                              {activeAutoDisabledCombos.length} combo
                          </span>
                      </div>

                      {activeAutoDisabledCombos.length === 0 ? (
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                              Hiện chưa có combo nào đang bị auto-hide.
                          </div>
                      ) : (
                          <div className="space-y-3">
                              {activeAutoDisabledCombos.map((entry) => {
                                  const reopenKey = `${entry.modelId}::${entry.serverId}::${entry.speed}`;
                                  return (
                                      <div key={reopenKey} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                              <div className="grid flex-1 grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                                                  {[
                                                      { label: 'Model', value: entry.modelId },
                                                      { label: 'Tốc độ', value: tstSpeedToUi(entry.speed) || entry.speed },
                                                      { label: 'Server', value: tstServerToUi(entry.serverId) || entry.serverId.toUpperCase() },
                                                      { label: 'Lý do', value: entry.reason || 'image_timeout_cluster' },
                                                      { label: 'Số job timeout', value: String(entry.hitCount || 0) },
                                                      { label: 'Cửa sổ quét', value: `${entry.windowHours || 5} giờ` },
                                                      { label: 'Bắt đầu ẩn', value: entry.hiddenAt ? new Date(entry.hiddenAt).toLocaleString() : '-' },
                                                      { label: 'Mở lại lúc', value: entry.disabledUntil ? new Date(entry.disabledUntil).toLocaleString() : '-' },
                                                  ].map((item) => (
                                                      <div key={`${reopenKey}_${item.label}`} className="rounded-xl border border-white/10 bg-[#101018] p-3">
                                                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{item.label}</div>
                                                          <div className="mt-2 break-words text-sm font-bold text-white">{item.value}</div>
                                                      </div>
                                                  ))}
                                              </div>
                                              <button
                                                  onClick={() => handleManualReopenAutoDisabledCombo(entry.modelId, entry.serverId, entry.speed)}
                                                  disabled={reopeningAutoDisabledKey === reopenKey}
                                                  className="px-4 py-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 font-bold text-sm transition-colors disabled:opacity-50"
                                              >
                                                  {reopeningAutoDisabledKey === reopenKey ? 'Đang mở lại...' : 'Mở lại thủ công'}
                                              </button>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>

                  <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-300">
                              <thead className="text-xs text-slate-400 uppercase bg-black/40 border-b border-white/10">
                                  <tr>
                                      <th className="px-4 py-3 font-bold">Loại</th>
                                      <th className="px-4 py-3 font-bold">Model</th>
                                      <th className="px-4 py-3 font-bold">Server</th>
                                      <th className="px-4 py-3 font-bold">Độ phân giải</th>
                                      <th className="px-4 py-3 font-bold">Chất lượng</th>
                                      <th className="px-4 py-3 font-bold">Thời lượng</th>
                                      <th className="px-4 py-3 font-bold">Tốc độ</th>
                                      <th className="px-4 py-3 font-bold text-center">Audio</th>
                                      <th className="px-4 py-3 font-bold text-right">TST Credits</th>
                                      <th className="px-4 py-3 font-bold text-right">TST Quy Đổi</th>
                                      <th className="px-4 py-3 font-bold text-right">AUDITION AI</th>
                                      <th className="px-4 py-3 font-bold text-right">Lãi Gộp</th>
                                      <th className="px-4 py-3 font-bold">Config Key</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {pricingRows.length === 0 ? (
                                      <tr>
                                          <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                                              Chưa tải được bảng giá live từ Trạm Sáng Tạo.
                                          </td>
                                      </tr>
                                  ) : (
                                      pricingRows.map((row) => {
                                          const typeLabel = row.type === 'image'
                                              ? 'Ảnh'
                                              : row.type === 'video'
                                                  ? 'Video'
                                                  : row.type === 'motion-control'
                                                      ? 'Motion'
                                                      : 'Edit';
                                          const draftKey = getPricingLookupKey(row.modelId, row.configKey);
                                          const savedPricing = getSavedAuditionPrice(row);
                                          const rowIsDirty = isPricingRowDirty(row);
                                          const auditionPrice = getDraftAuditionPrice(row);
                                          const grossProfit = Number.isFinite(auditionPrice) ? auditionPrice - row.vcoin : 0;

                                          return (
                                              <tr key={`${row.modelId}_${row.configKey}`} className="hover:bg-white/5 transition-colors">
                                                  <td className="px-4 py-3">
                                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-wider">
                                                          {typeLabel}
                                                      </span>
                                                  </td>
                                                  <td className="px-4 py-3">
                                                      <div className="font-bold text-white">{row.modelName}</div>
                                                      <div className="text-[10px] text-slate-500 font-mono mt-1">{row.modelId}</div>
                                                  </td>
                                                  <td className="px-4 py-3 text-white">
                                                      <div className="flex items-center gap-2">
                                                          <span>{tstServerToUi(row.server) || '-'}</span>
                                                          {!isServerEnabledForModel(serverAvailabilityConfig, row.modelId, row.server) && (
                                                              <span className="px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-[10px] font-bold uppercase tracking-wider text-red-300">
                                                                  Khóa
                                                              </span>
                                                          )}
                                                      </div>
                                                  </td>
                                                  <td className="px-4 py-3 text-white uppercase">{row.resolution || '-'}</td>
                                                  <td className="px-4 py-3 text-white uppercase">{row.quality || '-'}</td>
                                                  <td className="px-4 py-3 text-white uppercase">
                                                      <div>{row.duration || '-'}</div>
                                                      {row.billingUnit === 'second' && (
                                                          <div className="mt-1 inline-flex rounded-full border border-audi-yellow/30 bg-audi-yellow/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-audi-yellow">
                                                              Theo giây
                                                          </div>
                                                      )}
                                                  </td>
                                                  <td className="px-4 py-3 text-white">{tstSpeedToUi(row.speed) || '-'}</td>
                                                  <td className="px-4 py-3 text-center text-white">{row.audio ? 'Có' : '-'}</td>
                                                  <td className="px-4 py-3 text-right font-mono text-audi-cyan">{row.type === 'edit' ? '-' : row.credits}</td>
                                                  <td className="px-4 py-3 text-right font-mono text-slate-200">
                                                      {row.type === 'edit'
                                                          ? '-'
                                                          : row.billingUnit === 'second'
                                                              ? `${row.vcoin} VC/s`
                                                              : `${row.vcoin} VC`}
                                                  </td>
                                                  <td className="px-4 py-3">
                                                      <div className="flex items-center justify-end gap-2">
                                                          <input
                                                              type="number"
                                                              min="1"
                                                              value={pricingDrafts[draftKey] ?? savedPricing?.audition_price_vcoin ?? row.defaultAuditionVcoin ?? row.vcoin}
                                                              onChange={(e) =>
                                                                  setPricingDrafts((prev) => ({
                                                                      ...prev,
                                                                      [draftKey]: e.target.value
                                                                  }))
                                                              }
                                                              className={`w-24 bg-black/40 border rounded-lg px-3 py-2 text-right text-white font-mono focus:outline-none focus:ring-2 ${
                                                                  rowIsDirty
                                                                      ? 'border-yellow-500/40 focus:ring-yellow-500/30'
                                                                      : 'border-white/10 focus:ring-audi-cyan/40'
                                                              }`}
                                                          />
                                                          <span className="min-w-[34px] text-xs font-bold text-audi-yellow">
                                                              {row.billingUnit === 'second' ? 'VC/s' : 'VC'}
                                                          </span>
                                                          <button
                                                              onClick={() => handleSavePricingRow(row)}
                                                              disabled={!rowIsDirty}
                                                              className="px-3 py-2 rounded-lg bg-audi-pink/20 text-audi-pink font-bold hover:bg-audi-pink hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                          >
                                                               Lưu
                                                          </button>
                                                      </div>
                                                      {row.billingUnit === 'second' && (
                                                          <div className="mt-1 text-right text-[10px] text-slate-500">
                                                              Ví dụ: 5s = {(Number(pricingDrafts[draftKey] ?? savedPricing?.audition_price_vcoin ?? row.defaultAuditionVcoin ?? row.vcoin) || 0) * 5} VC
                                                          </div>
                                                      )}
                                                  </td>
                                                  <td className={`px-4 py-3 text-right font-mono font-bold ${grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                      {grossProfit >= 0 ? '+' : ''}{grossProfit} {row.billingUnit === 'second' ? 'VC/s' : 'VC'}
                                                  </td>
                                                  <td className="px-4 py-3">
                                                      <span className="px-2 py-1 bg-white/10 rounded text-[10px] font-mono break-all">{row.configKey}</span>
                                                  </td>
                                              </tr>
                                          );
                                      })
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}

{activeView === 'styles' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Quản Lý Style Mẫu</h2>
                      <button 
                          onClick={() => setEditingStyle({
                              id: `temp_${Date.now()}`, 
                              name: '', 
                              image_url: '', 
                              trigger_prompt: '', 
                              is_active: true, 
                              is_default: false
                          })} 
                          className="px-3 py-2 md:px-4 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"
                      >
                          <Icons.Plus className="w-4 h-4" /> <span className="hidden md:inline">Thêm Style Mới</span><span className="md:hidden">Thêm</span>
                      </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {stylePresets.map(style => (
                          <div key={style.id} className="bg-[#12121a] border border-white/10 rounded-2xl p-4 relative overflow-hidden group hover:border-white/30 transition-all">
                              <div className="aspect-[3/4] w-full bg-black/50 rounded-xl mb-4 overflow-hidden relative">
                                  <img src={style.image_url} alt={style.name} className="w-full h-full object-cover" />
                                  {style.is_default && (
                                      <div className="absolute top-2 right-2 bg-audi-yellow text-black text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                          <Icons.Star className="w-3 h-3" /> DEFAULT
                                      </div>
                                  )}
                                  {!style.is_active && (
                                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                          <span className="text-red-500 font-bold border border-red-500 px-3 py-1 rounded uppercase">Disabled</span>
                                      </div>
                                  )}
                              </div>
                              
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <h3 className="font-bold text-white text-lg">{style.name}</h3>
                                      <p className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{style.trigger_prompt || 'No prompt'}</p>
                                  </div>
                                  <div className="flex gap-2">
                                      <button onClick={() => setEditingStyle(style)} className="p-2 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white transition-colors"><Icons.Settings className="w-4 h-4" /></button>
                                      <button onClick={() => showConfirm('Xóa style này?', async () => { await deleteStylePreset(style.id); refreshData(); showToast('Đã xóa style'); })} className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                      
                      {stylePresets.length === 0 && (
                          <div className="col-span-full py-12 text-center text-slate-500 italic border border-dashed border-white/10 rounded-2xl">
                              Chưa có style mẫu nào. Hãy thêm mới!
                          </div>
                      )}
                  </div>
              </div>
           )}

           {/* ================= VIEW: TOURS ================= */}
           {activeView === 'tours' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-5 shadow-xl">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                              <h2 className="text-lg md:text-2xl font-bold text-white flex items-center gap-2">
                                  <Icons.Info className="w-5 h-5 text-audi-cyan" />
                                  Hướng Dẫn Ứng Dụng
                              </h2>
                              <p className="mt-1 text-xs text-slate-400">Tạo tour riêng cho máy tính và điện thoại, theo từng màn hình hoặc từng công cụ.</p>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={handleAddTour} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold">Thêm tour</button>
                              <button onClick={handleSaveAppTours} className="px-5 py-2 rounded-xl bg-audi-cyan hover:bg-cyan-300 text-black text-xs font-black">Lưu cấu hình</button>
                          </div>
                      </div>
                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                          <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Trạng thái</span>
                              <select value={appTours.isActive ? 'on' : 'off'} onChange={(e) => setAppTours((c) => ({ ...c, isActive: e.target.value === 'on' }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#090914] px-3 py-2 text-sm font-bold text-white outline-none">
                                  <option value="on">Bật toàn bộ</option>
                                  <option value="off">Tắt toàn bộ</option>
                              </select>
                          </label>
                          <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tần suất</span>
                              <select value={appTours.showFrequency} onChange={(e) => setAppTours((c) => ({ ...c, showFrequency: e.target.value as AppToursConfig['showFrequency'] }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#090914] px-3 py-2 text-sm font-bold text-white outline-none">
                                  <option value="daily">Mỗi ngày một lần</option>
                                  <option value="once">Chỉ một lần</option>
                                  <option value="always">Luôn hiển thị</option>
                              </select>
                          </label>
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tổng tour</span>
                              <div className="mt-2 text-3xl font-game font-bold text-white">{appTours.tours.length}</div>
                          </div>
                      </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
                      <div className="space-y-3">
                          {appTours.tours.map((tour) => (
                              <button key={tour.id} onClick={() => setSelectedTourId(tour.id)} className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedTour?.id === tour.id ? 'border-audi-cyan bg-audi-cyan/10' : 'border-white/10 bg-[#12121a] hover:border-white/20'}`}>
                                  <div className="flex items-center justify-between gap-3">
                                      <span className="text-sm font-black text-white">{tour.title}</span>
                                      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${tour.surface === 'mobile' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-cyan-500/15 text-cyan-300'}`}>{tour.surface}</span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500">
                                      <span>{tour.screen}</span>
                                      {tour.featureId && <span>{tour.featureId}</span>}
                                      <span>{tour.steps.length} bước</span>
                                      <span>{tour.isActive ? 'Bật' : 'Tắt'}</span>
                                  </div>
                              </button>
                          ))}
                      </div>

                      {selectedTour && (
                          <div className="space-y-4">
                              <div className="rounded-2xl border border-white/10 bg-[#12121a] p-5">
                                  <div className="grid gap-4 md:grid-cols-2">
                                      <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tên tour</span><input value={selectedTour.title} onChange={(e) => updateAppTour(selectedTour.id, (t) => ({ ...t, title: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                      <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Màn hình</span><input value={selectedTour.screen} onChange={(e) => updateAppTour(selectedTour.id, (t) => ({ ...t, screen: e.target.value.trim() || 'global' }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                      <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Giao diện</span><select value={selectedTour.surface} onChange={(e) => updateAppTour(selectedTour.id, (t) => ({ ...t, surface: e.target.value as AppTourDefinition['surface'] }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan"><option value="desktop">Máy tính</option><option value="mobile">Điện thoại</option></select></label>
                                      <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Feature ID</span><input value={selectedTour.featureId || ''} placeholder="Ví dụ: ai_image_tool, video_ai_gen" onChange={(e) => updateAppTour(selectedTour.id, (t) => ({ ...t, featureId: e.target.value.trim() || undefined }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                  </div>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                      <button onClick={() => updateAppTour(selectedTour.id, (t) => ({ ...t, isActive: !t.isActive }))} className={`px-4 py-2 rounded-xl text-xs font-bold ${selectedTour.isActive ? 'bg-green-500/15 text-green-300' : 'bg-white/10 text-slate-300'}`}>{selectedTour.isActive ? 'Tour đang bật' : 'Tour đang tắt'}</button>
                                      <button onClick={() => handleDuplicateTour(selectedTour)} className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-white hover:bg-white/15">Nhân bản</button>
                                      <button onClick={() => handleAddTourStep(selectedTour.id)} className="px-4 py-2 rounded-xl bg-audi-purple text-xs font-bold text-white hover:bg-purple-600">Thêm bước</button>
                                      <button onClick={() => handleDeleteTour(selectedTour.id)} className="ml-auto px-4 py-2 rounded-xl bg-red-500/15 text-xs font-bold text-red-300 hover:bg-red-500/25">Xóa tour</button>
                                  </div>
                              </div>

                              {selectedTour.steps.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((step, index) => (
                                  <div key={step.id} className="rounded-2xl border border-white/10 bg-[#12121a] p-5">
                                      <div className="mb-4 flex items-center justify-between">
                                          <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-audi-cyan text-sm font-black text-black">{index + 1}</span><span className="text-sm font-black text-white">{step.title}</span></div>
                                          <button onClick={() => handleDeleteTourStep(selectedTour.id, step.id)} className="text-xs font-bold text-red-300 hover:text-red-200">Xóa bước</button>
                                      </div>
                                      <div className="grid gap-4 md:grid-cols-2">
                                          <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vùng khoanh</span><select value={step.targetId} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, targetId: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan">{getTourTargetOptions(selectedTour).map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
                                          <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vị trí hộp</span><select value={step.placement || 'auto'} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, placement: e.target.value as AppTourStep['placement'] }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan"><option value="auto">Tự động</option><option value="top">Trên</option><option value="right">Phải</option><option value="bottom">Dưới</option><option value="left">Trái</option></select></label>
                                          <div className="md:col-span-2 rounded-2xl border border-audi-cyan/20 bg-audi-cyan/5 p-4">
                                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                  <div>
                                                      <div className="text-sm font-black text-white">{getTourTargetMeta(step.targetId)?.label || 'Chưa chọn vùng khoanh'}</div>
                                                      <div className="mt-1 font-mono text-[10px] text-audi-cyan">{step.targetId || 'data-tour-id'}</div>
                                                  </div>
                                                  {getTourTargetMeta(step.targetId) && (
                                                      <div className="flex flex-wrap gap-1.5 text-[9px] font-bold uppercase">
                                                          <span className="rounded-full bg-white/10 px-2 py-1 text-slate-300">{getTourTargetMeta(step.targetId)?.surface}</span>
                                                          <span className="rounded-full bg-white/10 px-2 py-1 text-slate-300">{getTourTargetMeta(step.targetId)?.screen}</span>
                                                          {getTourTargetMeta(step.targetId)?.featureId && <span className="rounded-full bg-audi-purple/20 px-2 py-1 text-audi-purple">{getTourTargetMeta(step.targetId)?.featureId}</span>}
                                                      </div>
                                                  )}
                                              </div>
                                              <p className="mt-3 text-xs leading-relaxed text-slate-300">{getTourTargetDescription(step.targetId)}</p>
                                          </div>
                                          <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tiêu đề</span><input value={step.title} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, title: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                          <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Thứ tự</span><input type="number" value={step.order || index + 1} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, order: Number(e.target.value) || index + 1 }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                          <label className="md:col-span-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nội dung hướng dẫn</span><textarea value={step.description} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, description: e.target.value }))} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-audi-cyan" /></label>
                                      </div>
                                      <button onClick={() => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, isActive: s.isActive === false }))} className={`mt-4 rounded-xl px-4 py-2 text-xs font-bold ${step.isActive === false ? 'bg-white/10 text-slate-300' : 'bg-green-500/15 text-green-300'}`}>{step.isActive === false ? 'Bước đang tắt' : 'Bước đang bật'}</button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
           )}

           {/* ================= VIEW: SYSTEM ================= */}
           {activeView === 'system' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Hệ Thống</h2>
                      <button onClick={() => runSystemChecks(undefined)} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white flex items-center gap-2">
                          <Icons.Rocket className="w-4 h-4" /> <span className="hidden md:inline">Quét Ngay</span>
                      </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Health Cards */}
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Gemini AI Engine</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-400">Kết nối</span>
                              <StatusBadge status={health.gemini.status} latency={health.gemini.latency} />
                          </div>
                      </div>

                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Database</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-400">Trạng thái</span>
                              <StatusBadge status={health.supabase.status} latency={health.supabase.latency} />
                          </div>
                      </div>

                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Cloud Storage</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-400">Loại: {health.storage.type}</span>
                              <StatusBadge status={health.storage.status} />
                          </div>
                      </div>
                  </div>

                  {/* Tutorial Video Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-white flex items-center gap-2">
                              <Icons.Play className="w-5 h-5 text-audi-pink" />
                              Video Hướng Dẫn (Trình Tạo Ảnh)
                          </h3>
                          <button 
                              onClick={handleSaveTutorialVideo}
                              className="px-4 py-2 bg-audi-pink/20 text-audi-pink font-bold rounded-lg text-sm hover:bg-audi-pink hover:text-white transition-colors border border-audi-pink/30"
                          >
                              Lưu Cấu Hình
                          </button>
                      </div>
                      
                      <div className="space-y-4">
                          <div className="flex items-center gap-3">
                              <input 
                                  type="checkbox" 
                                  id="tutorialVideoToggle"
                                  checked={tutorialVideo.isActive}
                                  onChange={(e) => setTutorialVideo({...tutorialVideo, isActive: e.target.checked})}
                                  className="w-5 h-5 rounded border-white/20 bg-black/50 text-audi-pink focus:ring-audi-pink focus:ring-offset-gray-900"
                              />
                              <label htmlFor="tutorialVideoToggle" className="text-white font-medium">Hiển thị video hướng dẫn</label>
                          </div>
                          <div>
                              <label className="text-xs text-slate-400 mb-1 block">Link Video YouTube (URL)</label>
                              <input 
                                  type="text"
                                  value={tutorialVideo.url} 
                                  onChange={e => setTutorialVideo({...tutorialVideo, url: e.target.value})} 
                                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white"
                                  placeholder="Ví dụ: https://www.youtube.com/watch?v=ba2WR8txe_c"
                              />
                              <p className="text-xs text-slate-500 mt-2">
                                  Hỗ trợ các định dạng link: youtube.com/watch?v=..., youtu.be/..., youtube.com/embed/...
                              </p>
                          </div>
                      </div>
                  </div>

                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-white flex items-center gap-2">
                              <Icons.Image className="w-5 h-5 text-audi-cyan" />
                              Ảnh Ví Dụ Upload Nhân Vật
                          </h3>
                          <button
                              onClick={handleSaveGenerationGuideImages}
                              className="px-4 py-2 bg-audi-cyan/20 text-audi-cyan font-bold rounded-lg text-sm hover:bg-audi-cyan hover:text-black transition-colors border border-audi-cyan/30"
                          >
                              Lưu Cấu Hình
                          </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs text-slate-400 mb-1 block">Link VD Ảnh Nhân Vật</label>
                              <input
                                  type="text"
                                  value={generationGuideImages.characterUrl}
                                  onChange={(e) => setGenerationGuideImages({ ...generationGuideImages, characterUrl: e.target.value })}
                                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white"
                                  placeholder="https://..."
                              />
                              <p className="text-xs text-slate-500 mt-2">
                                  Ảnh mẫu dùng cho nút "VD Ảnh NV" ở desktop và mobile.
                              </p>
                          </div>
                          <div>
                              <label className="text-xs text-slate-400 mb-1 block">Link VD Ảnh Mẫu</label>
                              <input
                                  type="text"
                                  value={generationGuideImages.sampleUrl}
                                  onChange={(e) => setGenerationGuideImages({ ...generationGuideImages, sampleUrl: e.target.value })}
                                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white"
                                  placeholder="https://..."
                              />
                              <p className="text-xs text-slate-500 mt-2">
                                  Ảnh mẫu dùng cho nút "VD Ảnh Mẫu" để người dùng xem bố cục mẫu phù hợp.
                              </p>
                          </div>
                      </div>
                  </div>

                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-white flex items-center gap-2">
                              <Icons.Bell className="w-5 h-5 text-audi-cyan" />
                              Thông báo khi mở ứng dụng
                          </h3>
                          <button
                              onClick={handleSaveSystemAnnouncement}
                              className="px-4 py-2 bg-audi-cyan/20 text-audi-cyan font-bold rounded-lg text-sm hover:bg-audi-cyan hover:text-black transition-colors border border-audi-cyan/30"
                          >
                              Lưu Thông Báo
                          </button>
                      </div>

                      <div className="space-y-4">
                          <label className="flex items-center gap-3 text-sm font-bold text-white">
                              <input
                                  type="checkbox"
                                  checked={systemAnnouncement.isActive}
                                  onChange={(e) => setSystemAnnouncement({ ...systemAnnouncement, isActive: e.target.checked })}
                                  className="w-5 h-5 accent-audi-cyan"
                              />
                              Bật cửa sổ thông báo khi người dùng truy cập hoặc tải lại ứng dụng
                          </label>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">Tiêu đề</label>
                                  <input
                                      type="text"
                                      value={systemAnnouncement.title}
                                      onChange={(e) => setSystemAnnouncement({ ...systemAnnouncement, title: e.target.value })}
                                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white"
                                      placeholder="Thông báo từ AUDITION AI"
                                  />
                              </div>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">Kiểu hiển thị</label>
                                  <select
                                      value={systemAnnouncement.variant}
                                      onChange={(e) => setSystemAnnouncement({ ...systemAnnouncement, variant: e.target.value as SystemAnnouncementConfig['variant'] })}
                                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white"
                                  >
                                      <option value="info">Thông tin</option>
                                      <option value="promo">Khuyến mại</option>
                                      <option value="warning">Cảnh báo</option>
                                  </select>
                              </div>
                          </div>

                          <div>
                              <label className="text-xs text-slate-400 mb-1 block">Nội dung</label>
                              <textarea
                                  value={systemAnnouncement.message}
                                  onChange={(e) => setSystemAnnouncement({ ...systemAnnouncement, message: e.target.value })}
                                  className="w-full min-h-[120px] bg-black/40 border border-white/10 rounded-lg p-3 text-white leading-relaxed"
                                  placeholder="Nhập nội dung thông báo sẽ hiển thị cho người dùng..."
                              />
                              <p className="text-xs text-slate-500 mt-2">
                                  Người dùng đóng thông báo thì thông báo sẽ ẩn trong phiên hiện tại. Tải lại ứng dụng sẽ hiển thị lại nếu cấu hình đang bật.
                              </p>
                          </div>
                      </div>
                  </div>

                  {/* Payment Gateway Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-white flex items-center gap-2">
                              <Icons.QrCode className="w-5 h-5 text-emerald-400" />
                              Cổng thanh toán
                          </h3>
                          <button
                              onClick={handleSavePaymentGateway}
                              className="px-4 py-2 bg-emerald-500/20 text-emerald-300 font-bold rounded-lg text-sm hover:bg-emerald-500 hover:text-black transition-colors border border-emerald-500/30"
                          >
                              Lưu Cổng
                          </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                          {([
                              { id: 'sepay' as PaymentGateway, title: 'SePay', desc: 'Cổng thanh toán duy nhất. Webhook và cron đối soát giao dịch ngân hàng tự động.' },
                          ]).map((gatewayOption) => {
                              const active = paymentGateway === gatewayOption.id;
                              return (
                                  <button
                                      key={gatewayOption.id}
                                      onClick={() => setPaymentGateway(gatewayOption.id)}
                                      className={`rounded-2xl border p-4 text-left transition-all ${
                                          active
                                              ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
                                              : 'border-white/10 bg-black/20 hover:border-white/25'
                                      }`}
                                  >
                                      <div className="flex items-center justify-between gap-3">
                                          <div className="font-black text-white">{gatewayOption.title}</div>
                                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                                              active ? 'bg-emerald-400 text-black' : 'bg-white/10 text-slate-400'
                                          }`}>
                                              {active ? 'Đang bật' : 'Tắt'}
                                          </span>
                                      </div>
                                      <p className="mt-2 text-xs leading-relaxed text-slate-400">{gatewayOption.desc}</p>
                                  </button>
                              );
                          })}
                      </div>

                      <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs leading-relaxed text-yellow-100">
                          SePay cần cấu hình <code>SEPAY_MERCHANT_ID</code>, <code>SEPAY_SECRET_KEY</code> và <code>SEPAY_API_TOKEN</code> trên Netlify/Render để checkout, webhook và đối soát tự động hoạt động.
                      </div>
                  </div>

                  {/* Maintenance Mode Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-white flex items-center gap-2">
                              <Icons.AlertTriangle className="w-5 h-5 text-red-500" />
                              Chế độ bảo trì
                          </h3>
                          <button 
                              onClick={async () => {
                                  const res = await saveMaintenanceMode(maintenanceMode.isActive, maintenanceMode.message);
                                  if (res.success) showToast("Đã lưu cấu hình bảo trì thành công!", "success");
                                  else showToast(`Lỗi khi lưu cấu hình bảo trì: ${res.error}`, "error");
                              }}
                              className="px-4 py-2 bg-red-500 text-white font-bold rounded-lg text-sm hover:bg-red-600 transition-colors"
                          >
                              Lưu Cấu Hình
                          </button>
                      </div>
                      
                      <div className="space-y-4">
                          <div className="flex items-center gap-3">
                              <input 
                                  type="checkbox" 
                                  id="maintenanceToggle"
                                  checked={maintenanceMode.isActive}
                                  onChange={(e) => setMaintenanceMode({...maintenanceMode, isActive: e.target.checked})}
                                  className="w-5 h-5 rounded border-white/20 bg-black/50 text-red-500 focus:ring-red-500 focus:ring-offset-gray-900"
                              />
                              <label htmlFor="maintenanceToggle" className="text-white font-medium">Bật chế độ bảo trì</label>
                          </div>
                          <div>
                              <label className="text-xs text-slate-400 mb-1 block">Thông báo bảo trì</label>
                              <textarea 
                                  value={maintenanceMode.message} 
                                  onChange={e => setMaintenanceMode({...maintenanceMode, message: e.target.value})} 
                                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white h-24 resize-none"
                                  placeholder="Hệ thống đang bảo trì, vui lòng quay lại sau."
                              />
                          </div>
                      </div>
                  </div>

                  {/* Feature Maintenance Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-4">
                          <div>
                              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                  <Icons.Lock className="w-5 h-5 text-yellow-400" />
                                  Bảo trì từng chức năng
                              </h3>
                              <p className="text-xs text-slate-500 mt-1">
                                  Người dùng thường sẽ thấy nhãn Đang bảo trì và không mở được chức năng. Admin vẫn truy cập bình thường.
                              </p>
                          </div>
                          <button
                              onClick={handleSaveFeatureMaintenance}
                              className="px-4 py-2 bg-yellow-500/20 text-yellow-300 font-bold rounded-lg text-sm hover:bg-yellow-500 hover:text-black transition-colors border border-yellow-500/30"
                          >
                              Lưu Bảo Trì
                          </button>
                      </div>

                      <div className="mb-4">
                          <label className="text-xs text-slate-400 mb-1 block">Thông báo khi người dùng mở chức năng đang bảo trì</label>
                          <input
                              type="text"
                              value={featureMaintenance.message || ''}
                              onChange={(e) => setFeatureMaintenance((current) => ({ ...current, message: e.target.value }))}
                              className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white"
                              placeholder="Tính năng đang bảo trì. Vui lòng quay lại sau."
                          />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {APP_CONFIG.main_features.map((feature) => {
                              const isLocked = featureMaintenance.disabledFeatureIds?.includes(feature.id);
                              return (
                                  <button
                                      key={feature.id}
                                      onClick={() => handleToggleFeatureMaintenance(feature.id)}
                                      className={`rounded-2xl border p-4 text-left transition-all ${
                                          isLocked
                                              ? 'border-yellow-400 bg-yellow-500/15 shadow-[0_0_24px_rgba(234,179,8,0.16)]'
                                              : 'border-white/10 bg-black/20 hover:border-white/25'
                                      }`}
                                  >
                                      <div className="flex items-start justify-between gap-3">
                                          <div>
                                              <div className="font-black text-white">{feature.name.vi}</div>
                                              <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">{feature.id}</div>
                                          </div>
                                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                                              isLocked ? 'bg-yellow-400 text-black' : 'bg-emerald-500/15 text-emerald-300'
                                          }`}>
                                              {isLocked ? 'Bảo trì' : 'Đang mở'}
                                          </span>
                                      </div>
                                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{feature.description.vi}</p>
                                  </button>
                              );
                          })}
                      </div>
                  </div>

                  {/* API Key Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Lock className="w-5 h-5 text-audi-pink" />
                          Thêm mới Google Cloud Service Account JSON (Vertex AI)
                      </h3>
                      <div className="space-y-4">
                          <div>
                              <div className="flex justify-between items-end mb-2">
                                  <label className="text-xs font-bold text-slate-400 uppercase">Service Account JSON</label>
                                  <div className="flex items-center gap-2">
                                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                                          keyStatus === 'valid' ? 'bg-green-500/20 text-green-400' :
                                          keyStatus === 'invalid' ? 'bg-red-500/20 text-red-400' :
                                          keyStatus === 'checking' ? 'bg-yellow-500/20 text-yellow-400' :
                                          'bg-white/10 text-slate-400'
                                      }`}>
                                          {keyStatus === 'valid' ? 'VALID' :
                                           keyStatus === 'invalid' ? 'INVALID' :
                                           keyStatus === 'checking' ? 'CHECKING...' : 'IDLE'}
                                      </span>
                                  </div>
                              </div>
                              <div className="flex gap-2 relative">
                                  <select
                                      value={apiKeyTier}
                                      onChange={(e) => setApiKeyTier(e.target.value as 'flash' | 'pro')}
                                      className="bg-black/40 border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-audi-pink"
                                  >
                                      <option value="flash">Flash Key</option>
                                      <option value="pro">Pro Key</option>
                                  </select>
                                  <div className="flex-1 relative">
                                      <input 
                                          type={showKey ? "text" : "password"}
                                          value={apiKey}
                                          onChange={(e) => {
                                              setApiKey(e.target.value);
                                              setKeyStatus('unknown');
                                          }}
                                          placeholder='{"type": "service_account", "project_id": "...", ...}'
                                          className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white font-mono text-sm pr-12"
                                      />
                                      <button 
                                        onClick={() => setShowKey(!showKey)} 
                                        className="absolute right-3 top-3 text-slate-500 hover:text-white hidden md:block"
                                        title="Hiện/Ẩn Key"
                                      >
                                          {showKey ? <Icons.Eye className="w-5 h-5" /> : <Icons.Lock className="w-5 h-5" />}
                                      </button>
                                  </div>
                                  <button onClick={handleSaveApiKey} disabled={keyStatus === 'checking'} className="px-6 py-3 bg-audi-pink text-white font-bold rounded-lg hover:bg-pink-600 disabled:opacity-50 text-sm whitespace-nowrap">
                                      {keyStatus === 'checking' ? <Icons.Loader className="animate-spin w-5 h-5"/> : 'Thêm Key'}
                                  </button>
                              </div>
                              <p className="text-xs text-slate-500 mt-2">
                                  Key sẽ được lưu vào Database. Hệ thống sẽ tự động xoay vòng ngẫu nhiên giữa các key đang hoạt động để tránh quá tải.
                              </p>
                          </div>
                      </div>
                  </div>

                  {/* List of Keys in DB */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Database className="w-5 h-5 text-audi-cyan" />
                          Danh sách Service Account trong Database
                      </h3>
                      
                      <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-400">
                              <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                                  <tr>
                                      <th className="px-4 py-3 w-24">Loại</th>
                                      <th className="px-4 py-3">Tên / ID</th>
                                      <th className="px-4 py-3">Key Value</th>
                                      <th className="px-4 py-3">Trạng thái</th>
                                      <th className="px-4 py-3">Ngày tạo</th>
                                      <th className="px-4 py-3 text-right">Thao tác</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {dbKeys.length === 0 ? (
                                      <tr><td colSpan={6} className="text-center py-6 text-slate-500">Chưa tìm thấy key nào trong database.</td></tr>
                                  ) : dbKeys.map((k) => {
                                      const isPro = k.name?.includes('[PRO]');
                                      const displayName = k.name?.replace('[PRO]', '').replace('[FLASH]', '').trim() || 'Unnamed Key';
                                      
                                      return (
                                      <tr key={k.id} className="hover:bg-white/5">
                                          <td className="px-4 py-3">
                                              {isPro ? (
                                                  <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-audi-pink/20 text-audi-pink border border-audi-pink/30 text-[10px] font-bold w-16">
                                                      PRO
                                                  </span>
                                              ) : (
                                                  <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-audi-cyan/20 text-audi-cyan border border-audi-cyan/30 text-[10px] font-bold w-16">
                                                      FLASH
                                                  </span>
                                              )}
                                          </td>
                                          <td className="px-4 py-3 font-bold text-white">
                                              <div className="text-sm">{displayName}</div>
                                              <div className="text-[10px] text-slate-600 font-mono">{k.id.substring(0,8)}...</div>
                                          </td>
                                          <td className="px-4 py-3 font-mono text-xs">
                                              {k.key_value ? `${k.key_value.substring(0, 8)}...${k.key_value.substring(k.key_value.length - 6)}` : 'N/A'}
                                          </td>
                                          <td className="px-4 py-3">
                                              <span className={`text-[10px] font-bold px-2 py-1 rounded border ${k.status === 'active' ? 'bg-green-500/20 text-green-500 border-green-500/50' : 'bg-slate-500/20 text-slate-500 border-slate-500/50'}`}>
                                                  {k.status?.toUpperCase() || 'UNKNOWN'}
                                              </span>
                                          </td>
                                          <td className="px-4 py-3 text-xs">{new Date(k.created_at).toLocaleString()}</td>
                                          <td className="px-4 py-3 text-right flex justify-end gap-2">
                                              <button onClick={() => handleTestKey(k.key_value)} className="px-3 py-1 bg-audi-purple/20 text-audi-purple hover:bg-audi-purple hover:text-white rounded border border-audi-purple/50 text-xs font-bold transition-colors">Test</button>
                                              <button onClick={() => handleDeleteApiKey(k.id)} className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                          </td>
                                      </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
                      <div className="md:hidden space-y-4">
                          {dbKeys.length === 0 ? (
                              <div className="text-center py-4 text-slate-500 text-sm">Chưa có key.</div>
                          ) : dbKeys.map((k) => {
                              const isPro = k.name?.includes('[PRO]');
                              const displayName = k.name?.replace('[PRO]', '').replace('[FLASH]', '').trim() || 'Unnamed Key';
                              
                              return (
                              <div key={k.id} className="bg-white/5 rounded-xl p-4 border border-white/5 relative overflow-hidden">
                                  {/* Badge at top right */}
                                  <div className="absolute top-0 right-0">
                                      {isPro ? (
                                          <div className="bg-audi-pink text-white text-[9px] font-bold px-2 py-1 rounded-bl-lg">PRO TIER</div>
                                      ) : (
                                          <div className="bg-audi-cyan text-black text-[9px] font-bold px-2 py-1 rounded-bl-lg">FLASH TIER</div>
                                      )}
                                  </div>

                                  <div className="flex justify-between items-start mb-2 pr-12">
                                      <div>
                                          <div className="font-bold text-white text-sm">{displayName}</div>
                                          <div className="font-mono text-[10px] text-slate-500">{k.id}</div>
                                      </div>
                                      <span className={`text-[10px] font-bold px-2 py-1 rounded border ${k.status === 'active' ? 'bg-green-500/20 text-green-500 border-green-500/50' : 'bg-slate-500/20 text-slate-500 border-slate-500/50'}`}>
                                          {k.status?.toUpperCase()}
                                      </span>
                                  </div>
                                  <div className="font-mono text-xs text-slate-300 break-all mb-3 bg-black/30 p-2 rounded">
                                      {k.key_value ? `${k.key_value.substring(0, 15)}...` : 'N/A'}
                                  </div>
                                  <div className="flex justify-between items-center mt-3 border-t border-white/5 pt-3">
                                      <span className="text-[10px] text-slate-500">{new Date(k.created_at).toLocaleDateString()}</span>
                                      <div className="flex gap-2">
                                          <button onClick={() => handleTestKey(k.key_value)} className="px-3 py-1.5 bg-audi-purple/20 text-audi-purple rounded text-xs font-bold border border-audi-purple/30">Test</button>
                                          <button onClick={() => handleDeleteApiKey(k.id)} className="px-3 py-1.5 bg-red-500/10 text-red-500 rounded text-xs font-bold border border-red-500/30">Xóa</button>
                                      </div>
                                  </div>
                              </div>
                              );
                          })}
                      </div>
                  </div>

                  {/* Database Maintenance */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10 mt-6">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Database className="w-5 h-5 text-audi-cyan" />
                          Bảo trì Database
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button 
                              onClick={() => setShowGiftcodeFix(true)}
                              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-audi-purple/20 flex items-center justify-center text-audi-purple group-hover:scale-110 transition-transform">
                                      <Icons.Gift className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-white">Fix Giftcode Table</span>
                              </div>
                              <p className="text-xs text-slate-400">Sửa lỗi thiếu bảng gift_codes hoặc system_settings.</p>
                          </button>

                          <button 
                              onClick={() => setShowUserFix(true)}
                              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-audi-pink/20 flex items-center justify-center text-audi-pink group-hover:scale-110 transition-transform">
                                      <Icons.Users className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-white">Fix Users Table</span>
                              </div>
                              <p className="text-xs text-slate-400">Sửa lỗi thiếu bảng users hoặc lỗi phân quyền (RLS).</p>
                          </button>

                          <button 
                              onClick={() => setShowBalanceFix(true)}
                              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 group-hover:scale-110 transition-transform">
                                      <Icons.Gem className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-white">Fix Negative Balance</span>
                              </div>
                              <p className="text-xs text-slate-400">Sửa lỗi số dư âm (-Vcoin) cho tất cả tài khoản.</p>
                          </button>

                          <button 
                              onClick={handleCleanupImages}
                              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                                      <Icons.Trash className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-white">Dọn asset hết hạn</span>
                              </div>
                              <p className="text-xs text-slate-400">Xóa toàn bộ asset chưa publish đã quá 7 ngày trong lịch sử tạo (giữ lại ảnh public).</p>
                          </button>
                      </div>
                  </div>
              </div>
           )}

      </div>

      {/* --- MOVED MODALS (ROOT LEVEL) --- */}
      
      {/* BALANCE FIX MODAL */}
      {showBalanceFix && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in bg-black/80 backdrop-blur-sm">
              <div className="bg-[#12121a] w-full max-w-2xl p-6 rounded-2xl border border-yellow-500/50 shadow-[0_0_50px_rgba(255,200,0,0.2)] flex flex-col max-h-[90vh]">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-500 animate-pulse">
                          <Icons.Gem className="w-6 h-6" />
                      </div>
                      <div>
                          <h3 className="text-xl font-bold text-white">SỬA LỖI SỐ DƯ ÂM</h3>
                          <p className="text-slate-400 text-xs">Reset số dư về 0 cho các tài khoản bị âm Vcoin</p>
                      </div>
                  </div>
                  
                  <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl mb-4">
                      <p className="text-sm text-yellow-300 font-bold mb-1">Cảnh báo:</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                          Hành động này sẽ đặt lại số dư của tất cả người dùng có số dư &lt; 0 về 0. Hãy chắc chắn rằng bạn muốn thực hiện điều này.
                      </p>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col">
                      <p className="text-sm font-bold text-green-400 mb-2 uppercase">Copy mã SQL này và chạy trong Supabase SQL Editor</p>
                      <div className="relative h-64 bg-black/50 border border-white/10 rounded-xl overflow-hidden">
                          <pre className="absolute inset-0 p-4 text-[10px] md:text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap selection:bg-audi-pink selection:text-white">
                              {BALANCE_FIX_SQL}
                          </pre>
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(BALANCE_FIX_SQL);
                                showToast("Đã sao chép SQL!", 'info');
                            }}
                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                          >
                              <Icons.Copy className="w-4 h-4" /> Sao chép
                          </button>
                      </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 mt-6">
                      <button onClick={() => setShowBalanceFix(false)} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold transition-colors text-sm">Đóng</button>
                      <button onClick={() => window.open('https://supabase.com/dashboard/project/_/sql', '_blank')} className="px-6 py-2 bg-yellow-500 text-black hover:bg-yellow-400 rounded-lg font-bold transition-colors text-sm flex items-center gap-2">
                          <Icons.ExternalLink className="w-4 h-4" /> Mở SQL Editor
                      </button>
                  </div>
              </div>
          </div>
      )}
      {/* GIFTCODE ERROR FIX MODAL (NEW) */}
      {showGiftcodeFix && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[#12121a] w-full max-w-2xl p-6 rounded-2xl border border-red-500/50 shadow-[0_0_50px_rgba(255,0,0,0.2)] flex flex-col max-h-[90vh]">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                          <Icons.Database className="w-6 h-6" />
                      </div>
                      <div>
                          <h3 className="text-xl font-bold text-white">LỖI DATABASE: BẢNG DỮ LIỆU</h3>
                          <p className="text-slate-400 text-xs">Phát hiện thiếu bảng Giftcode hoặc System Settings</p>
                      </div>
                  </div>
                  
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-4">
                      <p className="text-sm text-red-300 font-bold mb-1">Nguyên nhân:</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                          Supabase báo lỗi thiếu bảng <code>gift_codes</code> hoặc <code>system_settings</code>. Đây là lỗi phổ biến khi tạo dự án mới chưa chạy script khởi tạo.
                      </p>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col">
                      <p className="text-sm font-bold text-green-400 mb-2 uppercase">Giải pháp: Copy mã SQL này và chạy trong Supabase SQL Editor</p>
                      <div className="relative h-64 bg-black/50 border border-white/10 rounded-xl overflow-hidden">
                          <pre className="absolute inset-0 p-4 text-[10px] md:text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap selection:bg-audi-pink selection:text-white">
                              {GIFTCODE_FIX_SQL}
                          </pre>
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(GIFTCODE_FIX_SQL);
                                showToast("Đã sao chép SQL!", 'info');
                            }}
                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                          >
                              <Icons.Copy className="w-4 h-4" /> Sao chép
                          </button>
                      </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                      <a 
                        href="https://supabase.com/dashboard/project/_/sql" 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 py-3 bg-audi-purple hover:bg-purple-600 text-white rounded-xl font-bold text-center transition-colors flex items-center justify-center gap-2"
                      >
                          <Icons.Database className="w-4 h-4" /> Mở SQL Editor
                      </a>
                      <button onClick={() => setShowGiftcodeFix(false)} className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors">
                          Đóng
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* USER DB FIX MODAL */}
      {showUserFix && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[#12121a] w-full max-w-2xl p-6 rounded-2xl border border-red-500/50 shadow-[0_0_50px_rgba(255,0,0,0.2)] flex flex-col max-h-[90vh]">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                          <Icons.Database className="w-6 h-6" />
                      </div>
                      <div>
                          <h3 className="text-xl font-bold text-white">LỖI DATABASE: BẢNG USERS</h3>
                          <p className="text-slate-400 text-xs">Phát hiện thiếu bảng Users hoặc lỗi RLS Policy</p>
                      </div>
                  </div>
                  
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-4">
                      <p className="text-sm text-red-300 font-bold mb-1">Nguyên nhân:</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                          Supabase không cho phép đọc bảng <code>public.users</code> hoặc bảng chưa được tạo. Điều này thường xảy ra khi Row Level Security (RLS) chưa được cấu hình đúng.
                      </p>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col">
                      <p className="text-sm font-bold text-green-400 mb-2 uppercase">Giải pháp: Copy mã SQL này và chạy trong Supabase SQL Editor</p>
                      <div className="relative h-64 bg-black/50 border border-white/10 rounded-xl overflow-hidden">
                          <pre className="absolute inset-0 p-4 text-[10px] md:text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap selection:bg-audi-pink selection:text-white">
                              {USER_FIX_SQL}
                          </pre>
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(USER_FIX_SQL);
                                showToast("Đã sao chép SQL!", 'info');
                            }}
                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                          >
                              <Icons.Copy className="w-4 h-4" /> Sao chép
                          </button>
                      </div>
                      
                      <div className="mt-4 bg-audi-pink/10 border border-audi-pink/30 p-3 rounded-xl">
                          <p className="text-xs font-bold text-audi-pink mb-1 uppercase">Khôi phục quyền Admin:</p>
                          <div className="flex gap-2">
                              <code className="flex-1 bg-black/50 p-2 rounded text-[10px] font-mono text-white overflow-x-auto whitespace-nowrap">
                                  UPDATE public.users SET is_admin = true WHERE email = '{currentUserEmail || 'YOUR_EMAIL'}';
                              </code>
                              <button 
                                  onClick={() => {
                                      navigator.clipboard.writeText(`UPDATE public.users SET is_admin = true WHERE email = '${currentUserEmail || 'YOUR_EMAIL'}';`);
                                      showToast("Đã sao chép lệnh!", 'info');
                                  }}
                                  className="px-3 bg-audi-pink text-white rounded font-bold text-xs hover:bg-pink-600 transition-colors"
                              >
                                  Copy
                              </button>
                          </div>
                      </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                      <a 
                        href="https://supabase.com/dashboard/project/_/sql" 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 py-3 bg-audi-purple hover:bg-purple-600 text-white rounded-xl font-bold text-center transition-colors flex items-center justify-center gap-2"
                      >
                          <Icons.Database className="w-4 h-4" /> Mở SQL Editor
                      </a>
                      <button onClick={() => setShowUserFix(false)} className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors">
                          Đóng
                      </button>
                  </div>
              </div>
          </div>
      )}

      {selectedQueueJobId && (
          <AdminModalPortal>
          <div className="fixed inset-0 z-[2100] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4 md:p-6 animate-fade-in">
              <div className="bg-[#12121a] w-full max-w-6xl rounded-2xl border border-white/20 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
                      <div>
                          <h3 className="text-xl font-bold text-white">Chi tiết Queue Job</h3>
                          <p className="text-xs text-slate-400 font-mono mt-1">{selectedQueueJobId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                          {selectedQueueJobDetail && ['queued', 'processing', 'rescuing'].includes(selectedQueueJobDetail.job.displayStatus || selectedQueueJobDetail.job.status) && (
                              <button
                                  onClick={() => handleStopQueueJob(selectedQueueJobDetail.job.id)}
                                  disabled={stoppingQueueJob}
                                  className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-200 text-sm font-bold disabled:opacity-60"
                              >
                                  {stoppingQueueJob ? 'Đang dừng...' : 'Dừng tiến trình'}
                              </button>
                          )}
                          <button onClick={() => { setSelectedQueueJobId(null); setSelectedQueueJobDetail(null); setQueuePromptExpanded(false); }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white">
                              <Icons.X className="w-5 h-5" />
                          </button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                      {loadingQueueJobDetail ? (
                          <div className="py-20 text-center text-slate-400">Đang tải chi tiết job...</div>
                      ) : !selectedQueueJobDetail ? (
                          <div className="py-20 text-center text-slate-400">Không tải được dữ liệu chi tiết cho job này.</div>
                      ) : (
                          <div className="space-y-6">
                              <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-6">
                                  <div className="space-y-6">
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                                              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Người dùng</div>
                                              <div className="mt-2 text-lg font-bold text-white break-words">{selectedQueueJobDetail.job.userName || 'Unknown'}</div>
                                              <div className="mt-1 text-xs text-slate-400 break-all">{selectedQueueJobDetail.job.userEmail || '-'}</div>
                                          </div>
                                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                                              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Trạng thái</div>
                                              <div className={`mt-2 inline-flex px-3 py-1.5 rounded-full text-xs font-bold uppercase ${getQueueStatusClass(selectedQueueStatus)}`}>
                                                  {getQueueStatusLabel(selectedQueueStatus)}
                                              </div>
                                              <div className="mt-3 text-sm text-slate-300">{getQueueStageLabel(selectedQueueJobDetail.job.queueStage)}</div>
                                          </div>
                                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                                              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Tiến trình</div>
                                              <div className="mt-2 text-3xl font-black text-white">{Math.round(selectedQueueJobDetail.job.progress || 0)}%</div>
                                              <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                                                  <div className={`h-full ${selectedQueueStatus === 'failed' ? 'bg-red-400' : selectedQueueStatus === 'completed' ? 'bg-emerald-400' : 'bg-audi-cyan'}`} style={{ width: `${Math.max(0, Math.min(100, selectedQueueJobDetail.job.progress || 0))}%` }} />
                                              </div>
                                          </div>
                                      </div>

                                      <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                                          <div className="flex items-center justify-between gap-3 mb-3">
                                              <div>
                                                  <div className="text-sm font-bold text-white">Prompt</div>
                                                  <div className="text-xs text-slate-500 mt-1">{selectedQueuePrompt.length.toLocaleString('vi-VN')} ký tự</div>
                                              </div>
                                              {selectedQueuePrompt.length > 240 && (
                                                  <button
                                                      onClick={() => setQueuePromptExpanded((current) => !current)}
                                                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold"
                                                  >
                                                      {queuePromptExpanded ? 'Thu gọn' : 'Xem toàn bộ'}
                                                  </button>
                                              )}
                                          </div>
                                          <div className={`text-sm text-slate-300 whitespace-pre-wrap leading-relaxed ${queuePromptExpanded ? '' : 'line-clamp-4'}`}>
                                              {selectedQueuePrompt}
                                          </div>
                                      </div>

                                      <div className="space-y-4">
                                          {orderedQueueMediaSections.length === 0 ? (
                                              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 text-sm text-slate-500">
                                                  Không tìm thấy ảnh tham chiếu, ảnh mẫu hoặc kết quả để hiển thị cho job này.
                                              </div>
                                          ) : orderedQueueMediaSections.map((section) => (
                                              <div key={section.key} className={`rounded-2xl border p-4 ${getQueueMediaSectionTone(section.key)}`}>
                                                  <div className="flex items-center justify-between gap-3 mb-4">
                                                      <div>
                                                          <div className="text-sm font-bold text-white">{section.label}</div>
                                                          {section.description && <div className="text-xs text-slate-400 mt-1">{section.description}</div>}
                                                      </div>
                                                      <div className="text-xs text-slate-500">{section.items.length} mục</div>
                                                  </div>
                                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                      {section.items.map((media, index) => (
                                                          <div key={`${section.key}-${media.role}-${index}`} className="rounded-2xl overflow-hidden border border-white/10 bg-[#0f0f16]">
                                                              <div className="px-3 py-2 border-b border-white/10">
                                                                  <div className="text-sm font-bold text-white">{media.label}</div>
                                                                  <div className="text-[11px] text-slate-500 mt-1">{getQueueMediaMeta(media)}</div>
                                                              </div>
                                                              <div className="p-3">
                                                                  {media.url ? (
                                                                      media.kind === 'video' ? (
                                                                          <video src={media.url} controls className="w-full rounded-xl bg-black max-h-80" />
                                                                      ) : (
                                                                          <img src={media.url} alt={media.label} className="w-full rounded-xl bg-black max-h-80 object-contain" />
                                                                      )
                                                                  ) : (
                                                                      <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                                                                          {media.note || 'Media quá lớn hoặc không thể render trực tiếp.'}
                                                                      </div>
                                                                  )}
                                                              </div>
                                                          </div>
                                                      ))}
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  </div>

                                  <div className="space-y-6">
                                      {selectedQueueJobDetail.job.health && (
                                          <div className={`rounded-2xl border p-4 ${getQueueHealthClass(selectedQueueJobDetail.job.health.severity)}`}>
                                              <div className="flex items-start justify-between gap-3">
                                                  <div>
                                                      <div className="text-sm font-black text-white">Queue Health</div>
                                                      <div className="mt-2 text-lg font-black">{selectedQueueJobDetail.job.health.label}</div>
                                                  </div>
                                                  <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-bold uppercase">
                                                      {selectedQueueJobDetail.job.health.code}
                                                  </div>
                                              </div>
                                              <div className="mt-3 text-sm leading-relaxed opacity-90">{selectedQueueJobDetail.job.health.detail}</div>
                                              <div className="mt-3 text-sm font-bold opacity-95">Hành động: {selectedQueueJobDetail.job.health.action}</div>
                                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                                                  <span className="rounded-full bg-black/20 px-2 py-1">lease: {selectedQueueJobDetail.job.health.leaseState || '-'}</span>
                                                  {typeof selectedQueueJobDetail.job.health.recoveries === 'number' && <span className="rounded-full bg-black/20 px-2 py-1">recoveries: {selectedQueueJobDetail.job.health.recoveries}</span>}
                                                  {typeof selectedQueueJobDetail.job.health.secondsSinceUpdated === 'number' && <span className="rounded-full bg-black/20 px-2 py-1">updated: {selectedQueueJobDetail.job.health.secondsSinceUpdated}s</span>}
                                                  {typeof selectedQueueJobDetail.job.health.secondsUntilWatchdogDue === 'number' && selectedQueueJobDetail.job.health.secondsUntilWatchdogDue > 0 && <span className="rounded-full bg-black/20 px-2 py-1">watchdog còn: {selectedQueueJobDetail.job.health.secondsUntilWatchdogDue}s</span>}
                                                  {selectedQueueJobDetail.job.health.providerRisk && <span className="rounded-full bg-black/20 px-2 py-1">provider-risk</span>}
                                                  {selectedQueueJobDetail.job.health.safeToRequeue && <span className="rounded-full bg-black/20 px-2 py-1">safe-requeue</span>}
                                                  {selectedQueueJobDetail.job.health.watchdogDue && <span className="rounded-full bg-black/20 px-2 py-1">watchdog-due</span>}
                                              </div>
                                          </div>
                                      )}

                                      <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                                          <div className="text-sm font-bold text-white mb-4">Tóm tắt nhanh</div>
                                          <div className="grid grid-cols-2 gap-3">
                                              {[
                                                  { label: 'Thiết bị', value: getQueuePlatformLabel(selectedQueueJobDetail.job.clientPlatform) },
                                                  { label: 'Asset', value: selectedQueueJobDetail.job.assetType },
                                                  { label: 'Queue Kind', value: selectedQueueJobDetail.job.queueKind || '-' },
                                                  { label: 'Provider Job', value: selectedQueueJobDetail.job.jobId || '-' },
                                                  { label: 'Error Type', value: getQueueErrorCategoryLabel(selectedQueueJobDetail.job.errorCategory) },
                                                  { label: 'Cập nhật', value: getTimeAgo(selectedQueueJobDetail.job.updatedAt) },
                                              ].map((item) => (
                                                  <div key={item.label} className="rounded-xl border border-white/10 bg-[#11111a] px-3 py-3">
                                                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{item.label}</div>
                                                      <div className="mt-2 text-sm font-bold text-white break-words">{item.value}</div>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>

                                      {selectedQueueJobDetail.runtimeConfig && (
                                          <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                                              <div className="text-sm font-bold text-white mb-4">Cấu hình chạy</div>
                                              <div className="grid grid-cols-2 gap-3">
                                                  {[
                                                      { label: 'Chế độ tạo', value: selectedQueueJobDetail.runtimeConfig.generationMode || '-' },
                                                      { label: 'Model UI', value: selectedQueueJobDetail.runtimeConfig.modelMode || '-' },
                                                      { label: 'Model ID', value: selectedQueueJobDetail.runtimeConfig.modelId || '-' },
                                                      { label: 'Tốc độ', value: selectedQueueJobDetail.runtimeConfig.speedMode || '-' },
                                                      { label: 'Speed Key', value: selectedQueueJobDetail.runtimeConfig.speedKey || '-' },
                                                      { label: 'Server', value: selectedQueueJobDetail.runtimeConfig.serverId || '-' },
                                                      { label: 'Độ phân giải', value: selectedQueueJobDetail.runtimeConfig.resolution || '-' },
                                                      { label: 'Tỷ lệ', value: selectedQueueJobDetail.runtimeConfig.aspectRatio || '-' },
                                                      { label: 'Config Key', value: selectedQueueJobDetail.runtimeConfig.configKey || '-' },
                                                      { label: 'Số nhân vật', value: selectedQueueJobDetail.runtimeConfig.characterCount != null ? String(selectedQueueJobDetail.runtimeConfig.characterCount) : '-' },
                                                  ].map((item) => (
                                                      <div key={item.label} className="rounded-xl border border-white/10 bg-[#11111a] px-3 py-3">
                                                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{item.label}</div>
                                                          <div className="mt-2 text-sm font-bold text-white break-words">{item.value}</div>
                                                      </div>
                                                  ))}
                                              </div>
                                          </div>
                                      )}

                                      {(selectedQueueJobDetail.job.error || selectedQueueJobDetail.job.errorRaw) && (
                                          <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-3">
                                              <div className="flex items-center gap-3">
                                                  <div className="text-sm font-bold text-white">Phân tích lỗi</div>
                                                  {selectedQueueJobDetail.job.errorCategory && (
                                                      <div className={`inline-flex px-2 py-1 rounded border text-[10px] font-bold uppercase ${getQueueErrorCategoryClass(selectedQueueJobDetail.job.errorCategory)}`}>
                                                          {getQueueErrorCategoryLabel(selectedQueueJobDetail.job.errorCategory)}
                                                      </div>
                                                  )}
                                              </div>
                                              {selectedQueueJobDetail.job.error && (
                                                  <div>
                                                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Tóm tắt dễ hiểu</div>
                                                      <div className="text-sm text-red-300 mt-2 leading-relaxed">{selectedQueueJobDetail.job.error}</div>
                                                  </div>
                                              )}
                                              {selectedQueueJobDetail.job.errorRaw && selectedQueueJobDetail.job.errorRaw !== selectedQueueJobDetail.job.error && (
                                                  <div>
                                                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Lỗi gốc từ hệ thống</div>
                                                      <div className="text-sm text-slate-400 mt-2 leading-relaxed break-all">{selectedQueueJobDetail.job.errorRaw}</div>
                                                  </div>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
                                  <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                                      <div className="text-sm font-bold text-white mb-3">Log tiến trình</div>
                                      <div className="space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-2">
                                          {(selectedQueueJobDetail.job.queueLogs || []).length === 0 ? (
                                              <div className="text-sm text-slate-500">Chưa có log cho job này.</div>
                                          ) : (
                                              (selectedQueueJobDetail.job.queueLogs || []).map((log, index) => (
                                                  <div key={`${log.at}-${index}`} className="border border-white/10 rounded-xl p-3 bg-[#0f0f16]">
                                                      <div className="flex items-center justify-between gap-3">
                                                          <div className="text-xs font-bold text-white uppercase">{getQueueStageLabel(log.stage)}</div>
                                                          <div className="text-[11px] text-slate-500">{new Date(log.at).toLocaleString()}</div>
                                                      </div>
                                                      <div className="text-sm text-slate-300 mt-2">{log.message}</div>
                                                  </div>
                                              ))
                                          )}
                                      </div>
                                  </div>

                                  <details className="bg-black/20 border border-white/10 rounded-2xl p-4">
                                      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-bold text-white">
                                          <span>Payload Preview</span>
                                          <span className="text-xs text-slate-500">Mở khi cần debug sâu</span>
                                      </summary>
                                      <pre className="mt-4 text-[11px] text-slate-300 bg-[#0f0f16] border border-white/10 rounded-xl p-4 overflow-auto max-h-[420px] whitespace-pre-wrap break-all">
{JSON.stringify(selectedQueueJobDetail.queuePayloadPreview || {}, null, 2)}
                                      </pre>
                                  </details>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
          </AdminModalPortal>
      )}

      {viewingUser && (
          <AdminModalPortal>
          <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4 md:p-6 animate-fade-in overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-7xl p-4 md:p-6 rounded-2xl border border-white/20 shadow-2xl relative max-h-[92vh] overflow-y-auto custom-scrollbar flex flex-col">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
                      <div className="flex items-center gap-4 min-w-0">
                          <img src={viewingUser.avatar || 'https://picsum.photos/100/100'} className="w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-audi-pink object-cover shrink-0" />
                          <div>
                              <h3 className="text-xl md:text-2xl font-bold text-white break-words">{viewingUser.username}</h3>
                              <p className="text-slate-400 text-sm break-all">{viewingUser.email}</p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                  <span className="text-audi-yellow font-bold text-xs bg-audi-yellow/10 px-2 py-0.5 rounded">{viewingUser.vcoin_balance} Vcoin</span>
                                  <span className="text-blue-400 font-bold text-xs bg-blue-400/10 px-2 py-0.5 rounded uppercase">{viewingUser.role}</span>
                                  <span className="text-slate-300 font-bold text-xs bg-white/5 px-2 py-0.5 rounded">{filteredUserHistory.length} giao dịch</span>
                              </div>
                          </div>
                      </div>
                      <button onClick={() => setViewingUser(null)} className="self-end md:self-auto p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors">
                          <Icons.X className="w-6 h-6" />
                      </button>
                  </div>

                  {loadingUserDetails ? (
                      <div className="flex-1 flex items-center justify-center py-12">
                          <Icons.Loader className="w-8 h-8 text-audi-pink animate-spin" />
                      </div>
                  ) : (
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-8">
                          <div>
                              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                                  <div>
                                      <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                          <Icons.History className="w-5 h-5 text-audi-cyan" />
                                          Lịch sử VCoin chi tiết
                                      </h4>
                                      <div className="text-xs text-slate-400 mt-1">Hiển thị theo từng nhóm, có mã đối soát và số dư sau giao dịch.</div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:flex gap-2">
                                      {[
                                          { id: 'all', label: 'Tất cả' },
                                          { id: 'today', label: 'Hôm nay' },
                                          { id: '7d', label: '7 ngày' },
                                          { id: '30d', label: '30 ngày' },
                                      ].map((option) => (
                                          <button
                                              key={option.id}
                                              onClick={() => setUserLedgerDateScope(option.id as typeof userLedgerDateScope)}
                                              className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                                                  userLedgerDateScope === option.id
                                                      ? 'bg-audi-pink text-white border-audi-pink'
                                                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                                              }`}
                                          >
                                              {option.label}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              {filteredUserHistory.length === 0 ? (
                                  <div className="text-center py-10 text-slate-500 italic bg-black/30 rounded-xl border border-white/5">
                                      Không có giao dịch trong bộ lọc này.
                                  </div>
                              ) : (
                                  <div className="space-y-5">
                                      {userLedgerSections.map((section) => {
                                          const SectionIcon = section.icon;
                                          const sectionTotal = section.items.reduce((sum, item) => sum + Number(item.vcoinChange || 0), 0);
                                          const sectionLimit = getUserLedgerSectionLimit(section.id);
                                          const visibleItems = section.items.slice(0, sectionLimit);
                                          return (
                                              <div key={section.id} className="rounded-xl border border-white/10 bg-black/25 overflow-hidden">
                                                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-4 border-b border-white/10 bg-white/[0.03]">
                                                      <div className="flex items-start gap-3">
                                                          <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                                              <SectionIcon className="w-5 h-5 text-audi-cyan" />
                                                          </div>
                                                          <div>
                                                              <div className="font-bold text-white">{section.title}</div>
                                                              <div className="text-xs text-slate-400 mt-0.5">{section.description}</div>
                                                          </div>
                                                      </div>
                                                      <div className="flex flex-wrap gap-2 text-xs">
                                                          <span className="px-2 py-1 rounded bg-white/5 text-slate-300 border border-white/10">{section.items.length} giao dịch</span>
                                                          <span className={`px-2 py-1 rounded border font-bold ${sectionTotal >= 0 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-pink-500/10 text-audi-pink border-pink-500/20'}`}>
                                                              {sectionTotal > 0 ? '+' : ''}{formatVcoinValue(sectionTotal)}
                                                          </span>
                                                      </div>
                                                  </div>

                                                  {section.items.length === 0 ? (
                                                      <div className="px-4 py-6 text-sm text-slate-500 italic">Không có dữ liệu.</div>
                                                  ) : (
                                                      <div className="divide-y divide-white/5">
                                                          {visibleItems.map((item) => {
                                                              const generatedAsset = getHistoryGeneratedAsset(item);
                                                              const assetKind = generatedAsset ? getAssetKind(generatedAsset) : null;
                                                              return (
                                                              <div key={item.id} className="p-4 hover:bg-white/[0.03] transition-colors">
                                                                  <div className="grid grid-cols-1 xl:grid-cols-[160px_1fr_120px_120px] gap-3 xl:items-center">
                                                                      <div>
                                                                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Thời gian</div>
                                                                          <div className="mt-1 text-xs font-mono text-slate-300">{new Date(item.createdAt).toLocaleString('vi-VN')}</div>
                                                                      </div>
                                                                      <div className="min-w-0">
                                                                          <div className="flex flex-col sm:flex-row gap-3">
                                                                              {generatedAsset?.url && (
                                                                                  <a
                                                                                      href={generatedAsset.url}
                                                                                      target="_blank"
                                                                                      rel="noreferrer"
                                                                                      className="block w-full sm:w-24 h-32 sm:h-24 rounded-lg overflow-hidden border border-white/10 bg-black/40 shrink-0"
                                                                                      title="Mở tài sản đã tạo từ job này"
                                                                                  >
                                                                                      {assetKind === 'video' ? (
                                                                                          <video src={generatedAsset.url} className="w-full h-full object-cover" muted playsInline />
                                                                                      ) : (
                                                                                          <img src={generatedAsset.url} className="w-full h-full object-cover" alt={generatedAsset.toolName || item.description} />
                                                                                      )}
                                                                                  </a>
                                                                              )}
                                                                              <div className="min-w-0 flex-1">
                                                                                  <div className="flex flex-wrap items-center gap-2">
                                                                                      <div className="font-bold text-white break-words">{item.description}</div>
                                                                                      <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${getHistoryStatusClass(item)}`}>
                                                                                          {getHistoryStatusLabel(item)}
                                                                                      </span>
                                                                                      {(item.category === 'admin_transaction' || item.type === 'admin_adjustment') && (
                                                                                          <span className="inline-flex px-2 py-0.5 rounded border text-[10px] font-bold bg-violet-500/10 text-violet-300 border-violet-500/20">
                                                                                              Admin Transaction
                                                                                          </span>
                                                                                      )}
                                                                                      {generatedAsset && (
                                                                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${
                                                                                              assetKind === 'video'
                                                                                                  ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                                                                                                  : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                                                                                          }`}>
                                                                                              {assetKind === 'video' ? <Icons.Video className="w-3 h-3" /> : <Icons.Image className="w-3 h-3" />}
                                                                                              {assetKind === 'video' ? 'VIDEO' : 'ẢNH'}
                                                                                          </span>
                                                                                      )}
                                                                                  </div>
                                                                                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px] text-slate-500">
                                                                                      <div className="break-all">ID: <span className="font-mono text-slate-300">{item.referenceId || item.id}</span></div>
                                                                                      <div className="break-all">Mã: <span className="font-mono text-slate-300">{item.code || item.referenceType || '-'}</span></div>
                                                                                      {item.toolName && <div className="break-all">Công cụ: <span className="text-slate-300">{item.toolName}</span></div>}
                                                                                      {item.jobStatus && <div>Job: <span className="text-slate-300 uppercase">{item.jobStatus}</span></div>}
                                                                                  </div>
                                                                              </div>
                                                                          </div>
                                                                      </div>
                                                                      <div>
                                                                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold xl:text-right">Biến động</div>
                                                                          <div className={`mt-1 text-sm font-black xl:text-right ${item.vcoinChange > 0 ? 'text-emerald-300' : item.vcoinChange < 0 ? 'text-audi-pink' : 'text-slate-300'}`}>
                                                                              {item.vcoinChange > 0 ? '+' : ''}{formatVcoinValue(item.vcoinChange)}
                                                                          </div>
                                                                      </div>
                                                                      <div>
                                                                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold xl:text-right">Số dư sau</div>
                                                                          <div className="mt-1 text-sm font-black text-audi-yellow xl:text-right">{formatVcoinValue(item.balanceAfter)}</div>
                                                                      </div>
                                                                  </div>
                                                              </div>
                                                              );
                                                          })}
                                                          {section.items.length > sectionLimit && (
                                                              <div className="px-4 py-3 text-center bg-black/20">
                                                                  <button
                                                                      onClick={() => showMoreUserLedgerSection(section.id)}
                                                                      className="text-xs font-bold text-audi-cyan hover:text-white transition-colors py-2 px-4 rounded-lg hover:bg-white/5 border border-white/10"
                                                                  >
                                                                      Xem thêm 10 giao dịch ({section.items.length - sectionLimit} còn lại)
                                                                  </button>
                                                              </div>
                                                          )}
                                                      </div>
                                                  )}
                                              </div>
                                          );
                                      })}
                                  </div>
                              )}
                          </div>

                      </div>
                  )}
              </div>
          </div>
          </AdminModalPortal>
      )}

      {editingUser && (
          <AdminModalPortal>
          <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4 md:p-6 animate-fade-in overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <h3 className="text-xl font-bold text-white mb-4">Sửa Người Dùng</h3>
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên hiển thị</label>
                          <input value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-audi-pink outline-none" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Số dư Vcoin</label>
                          <input type="number" value={editingUser.vcoin_balance || 0} onChange={e => setEditingUser({...editingUser, vcoin_balance: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold focus:border-audi-pink outline-none" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nội dung giao dịch sửa VCoin</label>
                          <textarea
                              value={adminUserAdjustmentReason}
                              onChange={(e) => setAdminUserAdjustmentReason(e.target.value)}
                              rows={3}
                              placeholder="VD: Bù lỗi nạp tiền, cộng thưởng hỗ trợ khách hàng..."
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-audi-pink outline-none resize-none"
                          />
                          <div className="mt-1 text-[11px] text-slate-500">Bắt buộc khi thay đổi số dư VCoin. Nội dung này sẽ hiển thị trong lịch sử giao dịch.</div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Ảnh đại diện URL</label>
                          <input value={editingUser.avatar || ''} onChange={e => setEditingUser({...editingUser, avatar: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-slate-300 text-xs font-mono focus:border-audi-pink outline-none" />
                      </div>
                  </div>
                  <div className="flex gap-3"><button onClick={() => { setEditingUser(null); setEditingUserOriginalBalance(null); setAdminUserAdjustmentReason(''); }} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSaveUser} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu</button></div>
              </div>
          </div>
          </AdminModalPortal>
      )}
      {/* ... Other modals ... */}
      {editingPackage && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <h3 className="text-xl font-bold text-white mb-6">{editingPackage.id.startsWith('temp_') ? 'Thêm Gói Mới' : 'Sửa Gói Nạp'}</h3>
                  <div className="space-y-4 mb-6">
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên gói</label><input value={editingPackage.name} onChange={e => setEditingPackage({...editingPackage, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tag (VD: Mới)</label><input value={editingPackage.bonusText} onChange={e => setEditingPackage({...editingPackage, bonusText: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div></div>
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Giá (VND)</label><input type="number" value={editingPackage.price} onChange={e => setEditingPackage({...editingPackage, price: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-green-400 font-bold" /></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Vcoin nhận</label><input type="number" value={editingPackage.vcoin} onChange={e => setEditingPackage({...editingPackage, vcoin: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" /></div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">% Bonus thêm (Mặc định)</label><div className="relative"><input type="number" value={editingPackage.bonusPercent} onChange={e => setEditingPackage({...editingPackage, bonusPercent: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-pink font-bold pl-3" /><span className="absolute right-3 top-3.5 text-xs text-slate-500 font-bold">%</span></div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Cú pháp chuyển khoản</label><input value={editingPackage.transferContent} onChange={e => setEditingPackage({...editingPackage, transferContent: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono" /></div>
                      <div className="flex gap-4 pt-2"><label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors"><input type="checkbox" checked={editingPackage.isPopular} onChange={e => setEditingPackage({...editingPackage, isPopular: e.target.checked})} className="accent-audi-pink w-4 h-4" /><span className="text-sm font-bold text-white">Gói HOT (Nổi bật)</span></label><label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors"><input type="checkbox" checked={editingPackage.isActive} onChange={e => setEditingPackage({...editingPackage, isActive: e.target.checked})} className="accent-green-500 w-4 h-4" /><span className="text-sm font-bold text-white">Đang bán (Active)</span></label></div>
                  </div>
                  <div className="flex gap-3"><button onClick={() => setEditingPackage(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSavePackage} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu Thay Đổi</button></div>
              </div>
          </div>
      )}
      {editingPromotion && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
                  <h3 className="text-xl font-bold text-white mb-6 sticky top-0 bg-[#12121a] z-10 py-2 border-b border-white/10 shrink-0">
                      {editingPromotion.id.startsWith('temp_') ? 'Tạo Chiến Dịch Mới' : 'Sửa Chiến Dịch'}
                  </h3>
                  <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên chiến dịch (Nội bộ)</label>
                          <input value={editingPromotion.name} onChange={e => setEditingPromotion({...editingPromotion, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" placeholder="Ví dụ: Sale 8/3"/>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Thông báo chạy (Marquee)</label>
                          <input value={editingPromotion.marqueeText} onChange={e => setEditingPromotion({...editingPromotion, marqueeText: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" placeholder="Khuyến mãi đặc biệt..."/>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">% Bonus Vcoin</label>
                          <div className="relative">
                              <input type="number" value={editingPromotion.bonusPercent} onChange={e => setEditingPromotion({...editingPromotion, bonusPercent: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-pink font-bold pl-3" />
                              <span className="absolute right-3 top-3.5 text-xs text-slate-500 font-bold">%</span>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Bắt đầu (giờ Việt Nam)</label>
                              <input type="datetime-local" value={formatVietnamDateTimeLocal(editingPromotion.startTime)} onChange={e => setEditingPromotion({...editingPromotion, startTime: parseVietnamDateTimeLocalToIso(e.target.value, editingPromotion.startTime)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-xs" />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Kết thúc (giờ Việt Nam)</label>
                              <input type="datetime-local" value={formatVietnamDateTimeLocal(editingPromotion.endTime)} onChange={e => setEditingPromotion({...editingPromotion, endTime: parseVietnamDateTimeLocalToIso(e.target.value, editingPromotion.endTime)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-xs" />
                          </div>
                      </div>
                      <p className="text-[10px] text-audi-cyan font-bold -mt-2">Múi giờ áp dụng: Việt Nam (UTC+7). Lưu xuống hệ thống bằng ISO để chạy khuyến mãi chính xác.</p>
                      <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setEditingPromotion({...editingPromotion, isActive: !editingPromotion.isActive})}>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${editingPromotion.isActive ? 'bg-audi-lime border-audi-lime' : 'border-slate-500'}`}>{editingPromotion.isActive && <Icons.Check className="w-3 h-3 text-black" />}</div>
                          <label className="text-sm font-bold text-white cursor-pointer select-none">Kích hoạt (Manual Switch)</label>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">Chiến dịch chỉ chạy khi BẬT và trong khoảng thời gian quy định.</p>
                  </div>
                  <div className="flex gap-3 pt-6 mt-2 border-t border-white/10 shrink-0">
                      <button onClick={() => setEditingPromotion(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors">Hủy</button>
                      <button onClick={handleSavePromotion} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold shadow-lg transition-all">Lưu Chiến Dịch</button>
                  </div>
              </div>
          </div>
      )}
      {editingGiftcode && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl">
                  <h3 className="text-xl font-bold text-white mb-6">{editingGiftcode.id.startsWith('temp_') ? 'Tạo Giftcode' : 'Sửa Giftcode'}</h3>
                  <div className="space-y-4 mb-6"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Mã Code (Tự động in hoa)</label><input value={editingGiftcode.code} onChange={e => setEditingGiftcode({...editingGiftcode, code: e.target.value.toUpperCase()})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono font-bold" placeholder="Vd: CHAOMUNG"/></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Mã chiến dịch</label><input value={editingGiftcode.campaignKey || ''} onChange={e => setEditingGiftcode({...editingGiftcode, campaignKey: e.target.value.toUpperCase()})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono font-bold" placeholder="Vd: TET2026" /></div><p className="text-[11px] text-slate-500 -mt-2">Các giftcode cùng chiến dịch dùng chung mã này. 1 IP chỉ nhập được 1 lần trong cùng chiến dịch.</p><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Phần thưởng (Vcoin)</label><input type="number" value={editingGiftcode.reward} onChange={e => setEditingGiftcode({...editingGiftcode, reward: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" /></div><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Giới hạn tổng</label><input type="number" value={editingGiftcode.totalLimit} onChange={e => setEditingGiftcode({...editingGiftcode, totalLimit: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Max/Người</label><input type="number" value={editingGiftcode.maxPerUser} onChange={e => setEditingGiftcode({...editingGiftcode, maxPerUser: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div></div><label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors mt-2"><input type="checkbox" checked={editingGiftcode.isActive} onChange={e => setEditingGiftcode({...editingGiftcode, isActive: e.target.checked})} className="accent-green-500 w-4 h-4" /><span className="text-sm font-bold text-white">Kích hoạt ngay</span></label></div><div className="flex gap-3"><button onClick={() => setEditingGiftcode(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSaveGiftcode} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu Code</button></div>
              </div>
          </div>
      )}

      {editingStyle && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
                  <h3 className="text-xl font-bold text-white mb-6 sticky top-0 bg-[#12121a] z-10 py-2 border-b border-white/10 shrink-0">
                      {editingStyle.id.startsWith('temp_') ? 'Thêm Style Mới' : 'Sửa Style'}
                  </h3>
                  <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên Style</label>
                          <input 
                              value={editingStyle.name} 
                              onChange={e => setEditingStyle({...editingStyle, name: e.target.value})} 
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" 
                              placeholder="Ví dụ: 3D Audition"
                          />
                      </div>
                      
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Ảnh Mẫu (Reference)</label>
                          <div className="flex gap-4 items-start">
                              <div className="w-24 h-32 bg-black/50 rounded-lg border border-white/10 overflow-hidden shrink-0">
                                  {editingStyle.image_url ? (
                                      <img src={editingStyle.image_url} className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-600"><Icons.Image className="w-8 h-8" /></div>
                                  )}
                              </div>
                              <div className="flex-1">
                                  <input 
                                      type="file" 
                                      accept="image/*"
                                      onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                              const reader = new FileReader();
                                              reader.onloadend = () => {
                                                  setEditingStyle({...editingStyle, image_url: reader.result as string});
                                              };
                                              reader.readAsDataURL(file);
                                          }
                                      }}
                                      className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-audi-pink file:text-white hover:file:bg-pink-600 mb-2"
                                  />
                                  <p className="text-[10px] text-slate-500">Upload ảnh chất lượng cao để làm mẫu chuẩn cho AI.</p>
                              </div>
                          </div>
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Trigger Prompt (Optional)</label>
                          <textarea 
                              value={editingStyle.trigger_prompt || ''} 
                              onChange={e => setEditingStyle({...editingStyle, trigger_prompt: e.target.value})} 
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-xs h-24" 
                              placeholder="Các từ khóa bổ sung để kích hoạt style này..."
                          />
                          <button 
                              onClick={async () => {
                                  if (!editingStyle.image_url) {
                                      showToast('Vui lòng upload ảnh trước!', 'error');
                                      return;
                                  }
                                  showToast('Đang phân tích style bằng AI...', 'info');
                                  try {
                                      const analysis = await analyzeStyleImage(editingStyle.image_url);
                                      setEditingStyle(prev => prev ? ({...prev, trigger_prompt: analysis}) : null);
                                      showToast('Đã phân tích xong!', 'success');
                                  } catch (e) {
                                      showToast('Lỗi phân tích: ' + (e as any).message, 'error');
                                  }
                              }}
                              className="mt-2 text-[10px] font-bold text-audi-cyan hover:text-white flex items-center gap-1 bg-audi-cyan/10 px-2 py-1 rounded border border-audi-cyan/30 transition-colors"
                          >
                              <Icons.Sparkles className="w-3 h-3" /> AI Phân Tích Style
                          </button>
                      </div>

                      <div className="flex gap-4 pt-2">
                          <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors">
                              <input 
                                  type="checkbox" 
                                  checked={editingStyle.is_default} 
                                  onChange={e => setEditingStyle({...editingStyle, is_default: e.target.checked})} 
                                  className="accent-audi-yellow w-4 h-4" 
                              />
                              <span className="text-sm font-bold text-white">Đặt làm Mặc Định</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors">
                              <input 
                                  type="checkbox" 
                                  checked={editingStyle.is_active} 
                                  onChange={e => setEditingStyle({...editingStyle, is_active: e.target.checked})} 
                                  className="accent-green-500 w-4 h-4" 
                              />
                              <span className="text-sm font-bold text-white">Kích hoạt</span>
                          </label>
                      </div>
                  </div>
                  
                  <div className="flex gap-3 pt-6 mt-2 border-t border-white/10 shrink-0">
                      <button onClick={() => setEditingStyle(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors">Hủy</button>
                      <button 
                          onClick={async () => {
                              if (!editingStyle.name || !editingStyle.image_url) {
                                  showToast('Vui lòng nhập tên và tải ảnh mẫu!', 'error');
                                  return;
                              }
                              const res = await saveStylePreset(editingStyle);
                              if (res.success) {
                                  setEditingStyle(null);
                                  refreshData();
                                  showToast('Lưu Style thành công!');
                              } else {
                                  showToast('Lỗi: ' + res.error, 'error');
                              }
                          }} 
                          className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold shadow-lg transition-all"
                      >
                          Lưu Style
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Modal Xem Người Dùng Giftcode */}
      {viewingGiftcodeUsage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-[#1a1a24] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <Icons.Users className="w-6 h-6 text-green-500" />
                          Người dùng đã nhập code <span className="text-audi-yellow font-mono">{viewingGiftcodeUsage.code}</span>
                      </h3>
                      <button onClick={() => setViewingGiftcodeUsage(null)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"><Icons.X className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
                      {loadingGiftcodeUsers ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
                              <Icons.Loader className="w-8 h-8 animate-spin text-audi-cyan" />
                              <p>Đang tải danh sách...</p>
                          </div>
                      ) : giftcodeUsers.length === 0 ? (
                          <div className="text-center py-12 text-slate-500 italic">
                              Chưa có ai sử dụng mã này.
                          </div>
                      ) : (
                          <table className="w-full text-left text-sm text-slate-400">
                              <thead className="bg-black/40 text-xs font-bold text-slate-500 uppercase sticky top-0 backdrop-blur-md z-10">
                                  <tr>
                                      <th className="px-6 py-3">Người dùng</th>
                                      <th className="px-6 py-3">Email</th>
                                      <th className="px-6 py-3">IP</th>
                                      <th className="px-6 py-3 text-right">Thời gian</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {giftcodeUsers.map((u, idx) => (
                                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                                          <td className="px-6 py-3 flex items-center gap-3">
                                              <img src={u.userAvatar} className="w-8 h-8 rounded-full bg-white/10" />
                                              <span className="font-bold text-white">{u.userName}</span>
                                          </td>
                                          <td className="px-6 py-3">{u.userEmail}</td>
                                          <td className="px-6 py-3 font-mono text-xs">{u.ipAddress || 'Ẩn / cũ'}</td>
                                          <td className="px-6 py-3 text-right font-mono text-xs">{new Date(u.usedAt).toLocaleString()}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>

                  <div className="p-4 border-t border-white/10 bg-black/20 shrink-0 text-right">
                      <button onClick={() => setViewingGiftcodeUsage(null)} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold transition-colors">Đóng</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
