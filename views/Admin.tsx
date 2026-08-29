
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getSupabaseUser, supabase } from '../services/supabaseClient';
import { 
    getAdminOverviewStats,
    getAdminUsers,
    getAdminTransactions,
    getAdminCommerceCatalog,
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
    retryAdminQueueJob,
    getGiftcodeUsages,
    getMaintenanceMode,
    saveMaintenanceMode,
    getPaymentGatewayConfig,
    savePaymentGatewayConfig,
    PaymentGateway,
    getFeatureMaintenanceConfig,
    saveFeatureMaintenanceConfig,
    FeatureMaintenanceConfig,
    getGenerationProviderConfig,
    saveGenerationProviderConfig,
    GenerationProviderMode,
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
    saveModelPricingBatch,
    syncTSTPrices,
    ModelPricing,
    getTstServerAvailabilityConfig,
    saveTstServerAvailabilityConfig,
    getAdminQueueHealthReport,
    runAdminQueueReconcile,
    forceRescueFailedQueueJobs,
    runAdminR2Cleanup,
    AdminR2CleanupResult,
    adminGiftcodeAction,
    getGiftcodeAbuseCases,
    GiftcodeAbuseCase
} from '../services/economyService';
import {
    DEFAULT_ALLOWED_MODELS_BY_FEATURE,
    DEFAULT_PROVIDER_BY_FEATURE,
    GENERATION_PROVIDER_ROUTE_OPTIONS,
    getAllowedModelsForFeature,
    type GenerationProviderRouteKey,
} from '../shared/providerRouting';
import { checkR2Connection, getUserImagesFromStorage, cleanupExpiredImages, cleanupR2Directly } from '../services/storageService';
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
    isProviderServerEnabledForModel,
    type TstPricingRow,
    type TstServerAvailabilityConfig
} from '../services/tstCatalog';
import { Icons } from '../components/Icons';
import { APP_CONFIG } from '../constants';
import { UserProfile, CreditPackage, Giftcode, PromotionCampaign, Transaction, GeneratedImage, Language, StylePreset, HistoryItem, AdminQueueJob, AdminQueueSummary, AdminQueueJobDetail, AdminQueueInputMedia, AdminQueueMediaSection, AdminQueueHealthReport, AdminQueueHealthSnapshot } from '../types';
import './admin-command-center.css';
import { GiftcodeAbuseWorkspaceV2, TransactionsWorkspaceV2, UsersWorkspaceV2 } from './admin-v2/AdminOperations';
import QueueWorkspaceV2 from './admin-v2/QueueWorkspaceV2';
import AIUsageAnalyticsV2 from './admin-v2/AIUsageAnalyticsV2';
import {
    buildGommoCatalogPricingOptionId,
    fetchProviderCatalog,
    getAuditionProviderPricing,
    getGommoPricingInput,
    getGommoPriceComparison,
    GPTI2_SERVER_ID,
    GPTI2_SERVER_LABEL,
    type GommoProviderCatalog,
} from '../services/providerCatalog';
import { getGommoServerGroups } from '../shared/gommoServerRouting';
import { sanitizeProviderDisplayText } from '../shared/providerDisplay';

interface AdminProps {
  lang: Language;
  isAdmin: boolean;
}

type AdminView = 'overview' | 'transactions' | 'users' | 'giftcode_abuse' | 'queue' | 'packages' | 'marketing' | 'pricing' | 'system' | 'styles' | 'tours';

const ADMIN_NAV_SECTIONS: Array<{
    label: string;
    eyebrow: string;
    tabs: Array<{
        id: AdminView;
        label: string;
        description: string;
        icon: React.ComponentType<{ className?: string }>;
    }>;
}> = [
    {
        label: 'Vận hành',
        eyebrow: 'Operations',
        tabs: [
            { id: 'overview', icon: Icons.BarChart, label: 'Tổng quan', description: 'Chỉ số và doanh thu' },
            { id: 'transactions', icon: Icons.Gem, label: 'Giao dịch', description: 'Đối soát nạp Vcoin' },
            { id: 'users', icon: Icons.Users, label: 'Người dùng', description: 'Tài khoản và số dư' },
            { id: 'giftcode_abuse', icon: Icons.AlertTriangle, label: 'Vi phạm code', description: 'Phát hiện lạm dụng' },
            { id: 'queue', icon: Icons.Activity, label: 'Queue Jobs', description: 'Luồng render realtime' },
        ],
    },
    {
        label: 'Kinh doanh',
        eyebrow: 'Commerce',
        tabs: [
            { id: 'packages', icon: Icons.ShoppingBag, label: 'Gói nạp', description: 'Sản phẩm Vcoin' },
            { id: 'marketing', icon: Icons.Zap, label: 'Sự kiện & Code', description: 'Khuyến mãi và giftcode' },
            { id: 'pricing', icon: Icons.Gem, label: 'Bảng giá', description: 'Model, server và chi phí' },
        ],
    },
    {
        label: 'Trải nghiệm',
        eyebrow: 'Experience',
        tabs: [
            { id: 'styles', icon: Icons.Palette, label: 'Style mẫu', description: 'Preset hình ảnh' },
            { id: 'tours', icon: Icons.Info, label: 'Hướng dẫn', description: 'Tour onboarding' },
            { id: 'system', icon: Icons.Cpu, label: 'Hệ thống', description: 'Tích hợp và bảo trì' },
        ],
    },
];

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
SELECT u.email, u.vcoin_balance?.toLocaleString(), u.display_name
FROM public.users u
LEFT JOIN public.payment_transactions t ON u.id = t.user_id AND t.status = 'paid'
WHERE u.is_admin = false
GROUP BY u.email, u.vcoin_balance?.toLocaleString(), u.display_name
HAVING u.vcoin_balance?.toLocaleString() > 500 AND COUNT(t.id) = 0;
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
const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);

export const Admin: React.FC<AdminProps> = ({ lang, isAdmin = false }) => {
  const [activeView, setActiveView] = useState<AdminView>('overview');
  const [stats, setStats] = useState<any>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [giftcodes, setGiftcodes] = useState<Giftcode[]>([]);
  const [promotions, setPromotions] = useState<PromotionCampaign[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [modelPricing, setModelPricing] = useState<ModelPricing[]>([]);
  const [pricingRows, setPricingRows] = useState<TstPricingRow[]>([]);
  const [gommoCatalog, setGommoCatalog] = useState<GommoProviderCatalog | null>(null);
  const [gommoCatalogError, setGommoCatalogError] = useState('');
  const [generationProvider, setGenerationProvider] = useState<GenerationProviderMode>('tst');
  const [generationProviderByModel, setGenerationProviderByModel] = useState<Record<string, GenerationProviderMode>>({});
  const [generationProviderByFeature, setGenerationProviderByFeature] = useState<Record<string, GenerationProviderMode>>({});
  const [providerPriorityByFeature, setProviderPriorityByFeature] = useState<Record<string, GenerationProviderMode[]>>({});
  const [allowedModelsByFeature, setAllowedModelsByFeature] = useState<Record<string, string[]>>({});
  const [smartProviderFallbackEnabled, setSmartProviderFallbackEnabled] = useState(true);
  const [switchingGenerationProvider, setSwitchingGenerationProvider] = useState(false);
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, string>>({});
  const [pricingConfigFilter, setPricingConfigFilter] = useState<'all' | 'missing'>('all');
  const [pricingProviderFilter, setPricingProviderFilter] = useState<'all' | 'tst' | 'gpti2'>('all');
  const [savingAllPricing, setSavingAllPricing] = useState(false);
  const [serverAvailabilityConfig, setServerAvailabilityConfig] = useState<TstServerAvailabilityConfig>({ disabledByModel: {}, disabledByProviderModel: {}, autoDisabledCombos: {} });
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
  const [draggingTourStepId, setDraggingTourStepId] = useState<string | null>(null);
  const [collapsedTourStepIds, setCollapsedTourStepIds] = useState<string[]>([]);

  // API Key States
  const [apiKey, setApiKey] = useState('');
  const [apiKeyTier] = useState<'grok'>('grok');
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
  const [userActivityFilter, setUserActivityFilter] = useState<'all' | 'online' | 'locked' | 'warned' | 'inactive_60' | 'inactive_90'>('all');
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
  const [queueJobPendingRetry, setQueueJobPendingRetry] = useState<AdminQueueJob | null>(null);
  const [retryingQueueJobProvider, setRetryingQueueJobProvider] = useState<'tst' | 'gommo' | 'gpti2' | null>(null);
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
  const [giftcodeAbuseCases, setGiftcodeAbuseCases] = useState<GiftcodeAbuseCase[]>([]);
  const [loadingGiftcodeAbuse, setLoadingGiftcodeAbuse] = useState(false);
  const [giftcodeAbuseSearch, setGiftcodeAbuseSearch] = useState('');
  const [giftcodeAbuseFilter, setGiftcodeAbuseFilter] = useState<'all' | 'duplicates' | 'high_risk' | 'unhandled' | 'revoked' | 'locked'>('unhandled');
  const [selectedGiftcodeAbuseIds, setSelectedGiftcodeAbuseIds] = useState<string[]>([]);
  const [bulkGiftcodeActionLoading, setBulkGiftcodeActionLoading] = useState(false);
  const [giftcodeActionState, setGiftcodeActionState] = useState<Record<string, { action: 'revoke' | 'warn' | 'lock'; at: string; status: 'success' | 'error'; note?: string }>>({});

  // Error Recovery States
  const [showGiftcodeFix, setShowGiftcodeFix] = useState(false);
  const [showUserFix, setShowUserFix] = useState(false);
  const [showBalanceFix, setShowBalanceFix] = useState(false);
  const [r2CleanupStartDate, setR2CleanupStartDate] = useState(() => {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return toDateInputValue(date);
  });
  const [r2CleanupEndDate, setR2CleanupEndDate] = useState(() => toDateInputValue(new Date()));
  const [r2CleanupPrefix, setR2CleanupPrefix] = useState('');
  const [r2CleanupIncludeOrphans, setR2CleanupIncludeOrphans] = useState(false);
  const [r2CleanupIncludePublic, setR2CleanupIncludePublic] = useState(false);
  const [r2CleanupLoading, setR2CleanupLoading] = useState(false);
  const [r2CleanupPreview, setR2CleanupPreview] = useState<AdminR2CleanupResult | null>(null);

  // UX States
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);

  // Notification State
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>({ show: false, msg: '', onConfirm: () => {} });
  const loadedAdminViews = useRef(new Set<string>());

  // Helpers for Notifications
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, msg: sanitizeProviderDisplayText(msg), type }]);
      setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
  };

  const showConfirm = (msg: string, action: () => void) => {
      setConfirmDialog({
          show: true,
          msg: sanitizeProviderDisplayText(msg),
          onConfirm: () => {
              action();
              setConfirmDialog(prev => ({ ...prev, show: false }));
          }
      });
  };

  // Load only the active admin surface. Large ledgers and catalogs are fetched
  // when the administrator explicitly opens the relevant tab.
  useEffect(() => {
    if (!isAdmin) return;
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
              const [pricing, livePricingRows, serverConfig, providerCatalog, providerConfig] = await Promise.all([
                  getModelPricing(),
                  getPricingRows(true),
                  getTstServerAvailabilityConfig(),
                  fetchProviderCatalog(true, true).catch((error) => {
                      setGommoCatalogError(error instanceof Error ? error.message : String(error));
                      return null;
                  }),
                  getGenerationProviderConfig(),
              ]);
              setModelPricing((pricing || []).filter((row) => isAdminManagedPricingModel(row.model_id)));
              setPricingRows(filterAdminManagedPricingRows(livePricingRows));
              setServerAvailabilityConfig(serverConfig);
              setGommoCatalog(providerCatalog);
              setGenerationProvider(providerConfig.provider);
              setGenerationProviderByModel(providerConfig.providerByModel || {});
              setGenerationProviderByFeature(providerConfig.providerByFeature || {});
              setProviderPriorityByFeature(providerConfig.providerPriorityByFeature || {});
              setAllowedModelsByFeature(providerConfig.allowedModelsByFeature || {});
              setSmartProviderFallbackEnabled(providerConfig.smartFallbackEnabled !== false);
              if (providerCatalog) setGommoCatalogError('');
          } catch (error) {
              console.warn('Failed to auto-refresh pricing view', error);
              setPricingRows([]);
          }
      };

      refreshPricingView();
  }, [activeView, isAdmin]);

  const loadAdminViewData = async (view: typeof activeView, force = false) => {
      if (!isAdmin || (!force && loadedAdminViews.current.has(view))) return;

      if (view === 'overview') {
          const dashboard = await getAdminOverviewStats();
          setStats((current: any) => ({ ...(current || {}), dashboard }));
      } else if (view === 'users') {
          const usersList = await getAdminUsers({ limit: 200 });
          setStats((current: any) => ({ ...(current || {}), usersList }));
      } else if (view === 'transactions') {
          setTransactions(await getAdminTransactions({ days: 30, limit: 200 }) as Transaction[]);
      } else if (view === 'packages' || view === 'marketing') {
          const commerce = await getAdminCommerceCatalog();
          setPackages(commerce.packages as CreditPackage[]);
          setPromotions(commerce.promotions as PromotionCampaign[]);
          setGiftcodes(commerce.giftcodes as Giftcode[]);
          if (view === 'marketing') setGiftcodePromo(await getGiftcodePromoConfig());
      } else if (view === 'styles') {
          setStylePresets(await getStylePresets() || []);
      } else if (view === 'tours') {
          const toursConfig = await getAppToursConfig();
          setAppTours(toursConfig);
          setSelectedTourId((current) => current && toursConfig.tours.some((tour) => tour.id === current)
              ? current
              : toursConfig.tours[0]?.id || '');
      } else if (view === 'system') {
          const [keys, tutorial, guideImages, maintenance, featureConfig, gateway, announcement] = await Promise.all([
              getApiKeysList(),
              getTutorialVideo(),
              getGenerationGuideImages(),
              getMaintenanceMode(),
              getFeatureMaintenanceConfig(),
              getPaymentGatewayConfig(),
              getSystemAnnouncementConfig(),
          ]);
          setDbKeys(keys);
          setTutorialVideo(tutorial);
          setGenerationGuideImages(guideImages);
          setMaintenanceMode(maintenance);
          setFeatureMaintenance(featureConfig);
          setPaymentGateway(gateway.gateway);
          setSystemAnnouncement(announcement);
          await runSystemChecks(undefined);
      }

      loadedAdminViews.current.add(view);
  };

  const refreshData = async () => {
      loadedAdminViews.current.delete(activeView);
      await loadAdminViewData(activeView, true);
  };

  useEffect(() => {
      if (!isAdmin) return;
      void loadAdminViewData(activeView).catch((error) => {
          console.error(`[Admin] Failed to load ${activeView}:`, error);
          showToast('Không thể tải dữ liệu quản trị. Vui lòng thử lại.', 'error');
      });
  }, [activeView, isAdmin]);

  useEffect(() => {
      if (!isAdmin || activeView !== 'users' || !userSearchEmail.trim()) return;
      const timer = window.setTimeout(() => {
          void getAdminUsers({ search: userSearchEmail.trim(), limit: 100 })
              .then((usersList) => setStats((current: any) => ({ ...(current || {}), usersList })))
              .catch((error) => console.warn('[Admin] User search failed:', error));
      }, 350);
      return () => window.clearTimeout(timer);
  }, [activeView, isAdmin, userSearchEmail]);

  const loadQueueJobs = async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
          setLoadingQueueJobs(true);
      }

      try {
          const [result, healthResult] = await Promise.all([
              getAdminQueueJobs({
                  search: queueEmailFilter.trim() || undefined,
                  status: queueStatusFilter,
                  assetType: queueAssetFilter,
                  timeScope: queueTimeScope,
                  stage: queueStageFilter !== 'all' ? queueStageFilter : undefined,
                  stuckOnly: queueStuckOnly,
                  limit: 120,
              }),
              getAdminQueueHealthReport().catch((healthError) => {
                  console.warn('Failed to load queue health report', healthError);
                  return null;
              }),
          ]);
          setQueueJobs(result.jobs || []);
          setQueueSummary(result.summary || EMPTY_QUEUE_SUMMARY);
          if (healthResult) {
              setQueueHealthReport(healthResult);
          }
      } catch (error: any) {
          showToast(`Lỗi tải queue: ${error?.message || error}`, 'error');
      } finally {
          setLoadingQueueJobs(false);
      }
  };

  const gommoPricingRows = useMemo<TstPricingRow[]>(() => {
      // Gommo video/motion models are no longer part of the application. Keep
      // the legacy provider catalog for migration/comparison only, never for
      // the editable Admin pricing table.
      return [];
  }, [gommoCatalog]);

  const allPricingRows = useMemo(() => {
      const union = new Map<string, TstPricingRow>();
      for (const row of [...pricingRows, ...gommoPricingRows]) {
          const key = `${row.modelId}::${row.configKey}`;
          if (!union.has(key) || row.server !== 'gommo') union.set(key, row);
      }
      return Array.from(union.values());
  }, [gommoPricingRows, pricingRows]);

  const getDirectAuditionPricing = (row: TstPricingRow) =>
      modelPricing.find((item) => item.model_id === row.modelId && item.option_id === row.configKey);

  const getInheritedAuditionPricing = (row: TstPricingRow) => {
      if (row.server !== 'gommo') return null;
      const match = getAuditionProviderPricing(
          modelPricing,
          row.modelId,
          getGommoPricingInput(row.modelId, {
              resolution: row.resolution,
              duration: row.duration,
              providerMode: row.speed,
              audio: row.audio,
          }),
      );
      if (!match || match.optionId === row.configKey) return null;
      const source = modelPricing.find((item) => item.model_id === row.modelId && item.option_id === match.optionId);
      return source ? { source, vcoin: match.vcoin } : null;
  };

  const getEffectiveAuditionPricing = (row: TstPricingRow) => {
      const direct = getDirectAuditionPricing(row);
      if (direct) return { source: direct, vcoin: direct.audition_price_vcoin, inherited: false };
      const inherited = getInheritedAuditionPricing(row);
      return inherited ? { ...inherited, inherited: true } : null;
  };

  const featureModelOptions = useMemo(() => {
      const result = {} as Record<GenerationProviderRouteKey, Array<{ id: string; name: string }>>;
      for (const route of GENERATION_PROVIDER_ROUTE_OPTIONS) {
          const expectedType = route.key === 'video_generation'
              ? 'video'
              : route.key === 'motion_control'
                  ? 'motion-control'
                  : 'image';
          const models = new Map<string, string>();
          for (const row of allPricingRows) {
              if (row.type !== expectedType) continue;
              const id = row.modelId.trim().toLowerCase();
              if (id && !models.has(id)) models.set(id, row.modelName || row.modelId);
          }
          if (expectedType === 'image') {
              models.set('gpt-image-2', 'GPTi2 · GPT Image 2');
              models.set('nano-banana-2', 'GPTi2 · Nano Banana 2');
              models.set('nano-banana-pro', 'GPTi2 · Nano Banana Pro');
          }
          result[route.key] = Array.from(models, ([id, name]) => ({ id, name }))
              .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      }
      return result;
  }, [allPricingRows]);

  useEffect(() => {
      if (allPricingRows.length === 0) return;

      setPricingDrafts((prev) => {
          const next = { ...prev };
          for (const row of allPricingRows) {
              const key = `${row.modelId}::${row.configKey}`;
              const effective = getEffectiveAuditionPricing(row);
              next[key] = prev[key] !== undefined && prev[key] !== ''
                  ? prev[key]
                  : effective
                      ? String(effective.vcoin)
                      : row.defaultAuditionVcoin !== undefined
                          ? String(row.defaultAuditionVcoin)
                          : '';
          }
          return next;
      });
  }, [allPricingRows, modelPricing]);

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
      getDirectAuditionPricing(row);

  const getDraftAuditionPrice = (row: TstPricingRow) => {
      const draftKey = getPricingLookupKey(row.modelId, row.configKey);
      const effectivePricing = getEffectiveAuditionPricing(row);
      const fallbackValue = effectivePricing?.vcoin ?? row.defaultAuditionVcoin ?? row.vcoin;
      const rawDraft = pricingDrafts[draftKey];
      const parsedDraft = Number(rawDraft);
      return Number.isFinite(parsedDraft) && parsedDraft > 0 ? parsedDraft : fallbackValue;
  };

  const isPricingRowDirty = (row: TstPricingRow) => {
      const draftKey = getPricingLookupKey(row.modelId, row.configKey);
      const rawDraft = pricingDrafts[draftKey];
      if (rawDraft === undefined) return false;
      const effectivePricing = getEffectiveAuditionPricing(row);
      const parsedDraft = Number(rawDraft);

      // A positive draft for a configuration that does not exist in model_pricing
      // must always be persisted. Comparing it with the provider/default cost made
      // an equal value look "unchanged", leaving Save disabled while the row still
      // appeared under "Chưa có giá".
      if (!effectivePricing) {
          return rawDraft !== '' && Number.isFinite(parsedDraft) && parsedDraft > 0;
      }

      const baseline = effectivePricing.vcoin;

      if (!Number.isFinite(parsedDraft) || parsedDraft <= 0) {
          return rawDraft !== '' && rawDraft !== String(baseline);
      }

      return parsedDraft !== baseline;
  };

  const dirtyPricingRows = allPricingRows.filter(isPricingRowDirty);
  const dirtyPricingCount = dirtyPricingRows.length;
  const missingPricingCount = allPricingRows.filter((row) => !getEffectiveAuditionPricing(row)).length;
  const isGpti2PricingRow = (row: TstPricingRow) =>
      ['image-gpt-2', 'gpt-image-2', 'nano-banana-2', 'nano-banana-pro'].includes(row.modelId.trim().toLowerCase());
  const gpti2PricingCount = allPricingRows.filter(isGpti2PricingRow).length;
  const tstPricingCount = allPricingRows.filter((row) => !isGpti2PricingRow(row)).length;
  const providerFilteredPricingRows = pricingProviderFilter === 'all'
      ? allPricingRows
      : allPricingRows.filter((row) => pricingProviderFilter === 'gpti2' ? isGpti2PricingRow(row) : !isGpti2PricingRow(row));
  const providerMissingPricingCount = providerFilteredPricingRows.filter((row) => !getEffectiveAuditionPricing(row)).length;
  const filteredPricingRows = pricingConfigFilter === 'missing'
      ? providerFilteredPricingRows.filter((row) => !getEffectiveAuditionPricing(row))
      : providerFilteredPricingRows;

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
          try {
              await refreshData();
          } catch (refreshError) {
              console.warn('Pricing saved but refreshing admin data failed', refreshError);
          }
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

  const handleSwitchGenerationProvider = async (provider: GenerationProviderMode) => {
      if (provider === generationProvider || switchingGenerationProvider) return;
      if (provider === 'gommo' && !gommoCatalog?.configured) {
          showToast('API 3 (Gommo) chưa được cấu hình trên máy chủ nên chưa thể kích hoạt.', 'error');
          return;
      }
      setSwitchingGenerationProvider(true);
      const result = await saveGenerationProviderConfig({
          provider,
          providerByModel: generationProviderByModel,
          providerByFeature: generationProviderByFeature,
          providerPriorityByFeature,
          allowedModelsByFeature,
          smartFallbackEnabled: smartProviderFallbackEnabled,
      });
      setSwitchingGenerationProvider(false);
      if (!result.success) {
          showToast(`Không thể chuyển provider: ${result.error}`, 'error');
          return;
      }
      setGenerationProvider(provider);
      showToast(`Đã đổi nguồn mặc định sang ${provider === 'gpti2' ? 'API 1 · GPTi2' : provider === 'tst' ? 'API 2 · TST' : 'API 3 · Gommo'}; các route riêng theo model được giữ nguyên.`, 'success');
  };

  const handleToggleSmartProviderFallback = async () => {
      if (switchingGenerationProvider) return;
      const nextEnabled = !smartProviderFallbackEnabled;
      setSwitchingGenerationProvider(true);
      const result = await saveGenerationProviderConfig({
          provider: generationProvider,
          providerByModel: generationProviderByModel,
          providerByFeature: generationProviderByFeature,
          providerPriorityByFeature,
          allowedModelsByFeature,
          smartFallbackEnabled: nextEnabled,
      });
      setSwitchingGenerationProvider(false);
      if (!result.success) {
          showToast(`Không thể lưu cấu hình backup: ${result.error}`, 'error');
          return;
      }
      setSmartProviderFallbackEnabled(nextEnabled);
      showToast(
          nextEnabled
              ? 'Đã bật backup thông minh giữa các máy chủ và nguồn dự phòng cho job ảnh.'
              : 'Đã tắt backup thông minh; job sẽ chạy theo provider đã chọn.',
          'success',
      );
  };

  const handleSwitchFeatureGenerationProvider = async (
      featureKey: GenerationProviderRouteKey,
      provider: GenerationProviderMode | 'default',
  ) => {
      if (switchingGenerationProvider) return;
      if (provider === 'gommo' && !gommoCatalog?.configured) {
          showToast('API 3 (Gommo) chưa được cấu hình trên máy chủ.', 'error');
          return;
      }
      const nextProviderByFeature = { ...generationProviderByFeature };
      if (provider === 'default') delete nextProviderByFeature[featureKey];
      else nextProviderByFeature[featureKey] = provider;

      setSwitchingGenerationProvider(true);
      const result = await saveGenerationProviderConfig({
          provider: generationProvider,
          providerByModel: generationProviderByModel,
          providerByFeature: nextProviderByFeature,
          providerPriorityByFeature,
          allowedModelsByFeature,
          smartFallbackEnabled: smartProviderFallbackEnabled,
      });
      setSwitchingGenerationProvider(false);
      if (!result.success) {
          showToast(`Không thể lưu route chức năng: ${result.error}`, 'error');
          return;
      }
      setGenerationProviderByFeature(nextProviderByFeature);
      showToast('Đã cập nhật provider riêng cho chức năng.', 'success');
  };

  const handleMoveFeatureProvider = async (
      featureKey: GenerationProviderRouteKey,
      provider: GenerationProviderMode,
      direction: -1 | 1,
  ) => {
      if (switchingGenerationProvider) return;
      const isVideoRoute = featureKey === 'video_generation' || featureKey === 'motion_control';
      const allowedProviders: GenerationProviderMode[] = isVideoRoute ? ['tst'] : ['gpti2', 'tst', 'gommo'];
      const current = (providerPriorityByFeature[featureKey] || allowedProviders).filter((entry, index, list) => allowedProviders.includes(entry) && list.indexOf(entry) === index);
      for (const entry of allowedProviders) if (!current.includes(entry)) current.push(entry);
      const index = current.indexOf(provider);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
      [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
      const nextPriorities = { ...providerPriorityByFeature, [featureKey]: current };
      setSwitchingGenerationProvider(true);
      const result = await saveGenerationProviderConfig({
          provider: current[0],
          providerByModel: generationProviderByModel,
          providerByFeature: generationProviderByFeature,
          providerPriorityByFeature: nextPriorities,
          allowedModelsByFeature,
          smartFallbackEnabled: smartProviderFallbackEnabled,
      });
      setSwitchingGenerationProvider(false);
      if (!result.success) {
          showToast(`Không thể lưu thứ tự provider: ${result.error}`, 'error');
          return;
      }
      setProviderPriorityByFeature(nextPriorities);
      showToast('Đã cập nhật thứ tự ưu tiên cho chức năng.', 'success');
  };

  const handleChangeFeatureAllowedModels = async (
      featureKey: GenerationProviderRouteKey,
      nextValue: 'default' | 'all' | string[],
  ) => {
      if (switchingGenerationProvider) return;
      const nextAllowedModelsByFeature = { ...allowedModelsByFeature };
      if (nextValue === 'default') delete nextAllowedModelsByFeature[featureKey];
      else if (nextValue === 'all') nextAllowedModelsByFeature[featureKey] = ['*'];
      else if (nextValue.length > 0) {
          nextAllowedModelsByFeature[featureKey] = Array.from(new Set(
              nextValue.map((value) => value.trim().toLowerCase()).filter(Boolean),
          ));
      } else {
          showToast('Mỗi chức năng bị giới hạn phải có ít nhất một model.', 'error');
          return;
      }

      setSwitchingGenerationProvider(true);
      const result = await saveGenerationProviderConfig({
          provider: generationProvider,
          providerByModel: generationProviderByModel,
          providerByFeature: generationProviderByFeature,
          providerPriorityByFeature,
          allowedModelsByFeature: nextAllowedModelsByFeature,
          smartFallbackEnabled: smartProviderFallbackEnabled,
      });
      setSwitchingGenerationProvider(false);
      if (!result.success) {
          showToast(`Không thể lưu model theo chức năng: ${result.error}`, 'error');
          return;
      }
      setAllowedModelsByFeature(nextAllowedModelsByFeature);
      showToast('Đã cập nhật danh sách model cho chức năng.', 'success');
  };

  const handleSaveAllPricing = async () => {
      if (dirtyPricingRows.length === 0) {
          showToast('Không có thay đổi nào cần lưu.', 'info');
          return;
      }

      const rowsToSave = dirtyPricingRows.map((row) => {
          const draftKey = getPricingLookupKey(row.modelId, row.configKey);
          const existing = getSavedAuditionPrice(row);
          return {
              id: existing?.id || crypto.randomUUID(),
              model_id: row.modelId,
              option_id: row.configKey,
              tst_price_credits: row.credits,
              audition_price_vcoin: Number(pricingDrafts[draftKey]),
              updated_at: new Date().toISOString(),
          } satisfies ModelPricing;
      });
      const invalidRow = rowsToSave.find((row) => !Number.isFinite(row.audition_price_vcoin) || row.audition_price_vcoin <= 0);
      if (invalidRow) {
          showToast(`Giá của ${invalidRow.model_id} không hợp lệ.`, 'error');
          return;
      }

      setSavingAllPricing(true);
      try {
          const result = await saveModelPricingBatch(rowsToSave);
          if (!result.success) {
              showToast(`Không thể lưu bảng giá: ${result.error}`, 'error');
              return;
          }
          await refreshData();
          showToast(`Đã lưu ${result.saved || rowsToSave.length} cấu hình giá.`, 'success');
      } catch (error: any) {
          showToast(`Không thể lưu bảng giá: ${error?.message || error}`, 'error');
      } finally {
          setSavingAllPricing(false);
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
          disabledByProviderModel: serverAvailabilityConfig.disabledByProviderModel || {},
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

  const handleToggleProviderServer = async (
      provider: GenerationProviderMode,
      modelId: string,
      serverId: string,
  ) => {
      if (provider === 'tst') {
          await handleTogglePricingServer(modelId, serverId);
          return;
      }

      const normalizedModelId = modelId.trim().toLowerCase();
      const normalizedServerId = serverId.trim().toLowerCase();
      if (!normalizedModelId || !normalizedServerId) return;
      const providerConfig = serverAvailabilityConfig.disabledByProviderModel || {};
      const gommoDisabledByModel = { ...(providerConfig.gommo || {}) };
      const disabledServers = new Set(gommoDisabledByModel[normalizedModelId] || []);
      if (disabledServers.has(normalizedServerId)) disabledServers.delete(normalizedServerId);
      else disabledServers.add(normalizedServerId);
      if (disabledServers.size > 0) gommoDisabledByModel[normalizedModelId] = Array.from(disabledServers);
      else delete gommoDisabledByModel[normalizedModelId];

      const nextConfig: TstServerAvailabilityConfig = {
          ...serverAvailabilityConfig,
          disabledByProviderModel: {
              ...providerConfig,
              gommo: gommoDisabledByModel,
          },
          updatedAt: new Date().toISOString(),
      };
      const result = await saveTstServerAvailabilityConfig(nextConfig);
      if (!result.success) {
          showToast(`Lỗi lưu máy chủ API 2: ${result.error}`, 'error');
          return;
      }
      setServerAvailabilityConfig(nextConfig);
      showToast('Đã cập nhật máy chủ API 2; backend sẽ dùng cùng trạng thái này.', 'success');
  };

  const handleEnableAllPricingServers = async () => {
      const nextConfig: TstServerAvailabilityConfig = {
          disabledByModel: {},
          disabledByProviderModel: serverAvailabilityConfig.disabledByProviderModel || {},
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
          disabledByProviderModel: serverAvailabilityConfig.disabledByProviderModel || {},
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
          disabledByProviderModel: serverAvailabilityConfig.disabledByProviderModel || {},
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
      showToast('\u0110\u00e3 kh\u00f4i ph\u1ee5c c\u1ea5u h\u00ecnh m\u00e1y ch\u1ee7 theo d\u1eef li\u1ec7u live.', 'success');
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
          disabledByProviderModel: serverAvailabilityConfig.disabledByProviderModel || {},
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
      setHealth((current) => ({
          gemini: { ...current.gemini, status: 'checking' },
          supabase: { ...current.supabase, status: 'checking' },
          storage: { ...current.storage, status: 'checking' },
      }));

      const withHealthTimeout = <T,>(promise: Promise<T>, fallback: T, timeoutMs = 18000): Promise<T> =>
          Promise.race([
              promise,
              new Promise<T>((resolve) => {
                  window.setTimeout(() => resolve(fallback), timeoutMs);
              }),
          ]);

      const startGemini = Date.now();
      const keyToUse = specificKey !== undefined ? specificKey : (apiKey || undefined);
      const [geminiCheck, sbCheck, r2Ok] = await Promise.all([
          withHealthTimeout(
              checkConnection(keyToUse).catch((error) => {
                  console.warn('[Admin] Grok health check failed', error);
                  return { success: false, message: error?.message || 'Connection failed' };
              }),
              { success: false, message: 'Health check timed out' },
          ),
          withHealthTimeout(
              checkSupabaseConnection().catch((error) => {
                  console.warn('[Admin] Supabase health check failed', error);
                  return { db: false, storage: false, latency: 0 };
              }),
              { db: false, storage: false, latency: 0 },
          ),
          withHealthTimeout(
              checkR2Connection().catch((error) => {
                  console.warn('[Admin] R2 health check failed', error);
                  return false;
              }),
              false,
          ),
      ]);
      const geminiLatency = Date.now() - startGemini;
      
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
          gemini: { status: geminiCheck.success ? 'connected' : 'disconnected', latency: geminiLatency },
          supabase: { status: sbCheck.db ? 'connected' : 'disconnected', latency: sbCheck.latency },
          storage: { status: storageStatus, type: storageType }
      });
      
      if (keyToUse || geminiCheck.success) {
          setKeyStatus(geminiCheck.success ? 'valid' : 'invalid');
      }
  };

  useEffect(() => {
      if (!isAdmin) return;
      void runSystemChecks();
  }, [isAdmin]);

  // --- ACTIONS ---

  const handleSaveApiKey = async () => {
      if (!apiKey.trim()) return;
      
      setKeyStatus('checking');
      const check = await checkConnection(apiKey.trim());
      
      // Allow saving if valid OR if user confirms to bypass
      let shouldSave = check.success;
      if (!check.success) {
          setKeyStatus('invalid');
          if (window.confirm(`API Key này có vẻ không hoạt động:\n"${check.message}"\n\nBạn có chắc chắn muốn lưu nó vào Database không?`)) {
              shouldSave = true;
          }
      }

      // A key must pass a real xAI request before it is persisted.
      shouldSave = check.success;
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

  const getTopupGiftcodeLabel = (giftcode?: string | null) => {
      const clean = String(giftcode || '').trim().toUpperCase();
      return clean || null;
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
          description: 'Điểm danh hằng ngày',
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
          if (userActivityFilter === 'locked') return u.accountStatus === 'locked';
          if (userActivityFilter === 'warned') return Boolean(u.accountWarning);

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
  const selectedQueueFallbackHistory = Array.isArray(selectedQueueJobDetail?.queuePayloadPreview?.__providerFallbackHistory)
      ? selectedQueueJobDetail.queuePayloadPreview.__providerFallbackHistory.filter(
          (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      )
      : [];
  const selectedQueueProviderLabel = (provider: unknown) =>
      String(provider || '').toLowerCase() === 'gommo'
          ? 'API 3 · Gommo'
          : String(provider || '').toLowerCase() === 'tst'
              ? 'API 2 · TST'
              : String(provider || '').toLowerCase() === 'gpti2'
                  ? 'API 1 · GPTi2'
              : '-';
  const selectedQueueInitialProvider = selectedQueueFallbackHistory[0]?.fromProvider
      || selectedQueueJobDetail?.queuePayloadPreview?.__targetProvider
      || selectedQueueJobDetail?.job.provider;
  const selectedQueueProviderFlow = selectedQueueFallbackHistory.length > 0
      ? [
          selectedQueueProviderLabel(selectedQueueInitialProvider),
          ...selectedQueueFallbackHistory.map((entry) => selectedQueueProviderLabel(entry.toProvider)),
      ].filter((value, index, values) => value !== '-' && value !== values[index - 1]).join(' → ')
      : selectedQueueProviderLabel(selectedQueueJobDetail?.job.provider || selectedQueueInitialProvider);
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

  const loadGiftcodeAbuseCases = async () => {
      setLoadingGiftcodeAbuse(true);
      try {
          const rows = await getGiftcodeAbuseCases(1500);
          setGiftcodeAbuseCases(rows);
          setSelectedGiftcodeAbuseIds([]);
      } catch (error: any) {
          showToast(error?.message || 'Không thể tải danh sách vi phạm giftcode', 'error');
      } finally {
          setLoadingGiftcodeAbuse(false);
      }
  };

  useEffect(() => {
      if (!isAdmin || activeView !== 'giftcode_abuse') return;
      loadGiftcodeAbuseCases();
  }, [activeView, isAdmin]);

  const filteredGiftcodeAbuseCases = giftcodeAbuseCases.filter((item) => {
      const query = giftcodeAbuseSearch.trim().toLowerCase();
      const matchesQuery = !query || [
          item.userEmail,
          item.userName,
          item.giftCode,
          item.campaignKey,
          item.ipAddress || '',
          item.ipHash || '',
          item.browserKeyHash || '',
          item.emailFingerprint || '',
          item.abuseStatus,
          ...item.riskFlags,
      ].some((value) => String(value || '').toLowerCase().includes(query));

      if (!matchesQuery) return false;
      if (giftcodeAbuseFilter === 'duplicates') {
          return item.clusterCounts.email > 1 || item.clusterCounts.ip > 1 || item.clusterCounts.browser > 1 || item.clusterCounts.userCampaign > 1 || item.abuseStatus.includes('duplicate');
      }
      if (giftcodeAbuseFilter === 'high_risk') return item.riskScore >= 45 || item.severity >= 90;
      if (giftcodeAbuseFilter === 'unhandled') return item.rewardStatus !== 'revoked' && item.accountStatus !== 'locked' && !item.accountWarning;
      if (giftcodeAbuseFilter === 'revoked') return item.rewardStatus === 'revoked';
      if (giftcodeAbuseFilter === 'locked') return item.accountStatus === 'locked';
      return true;
  });

  const selectedGiftcodeAbuseCases = filteredGiftcodeAbuseCases.filter((item) => selectedGiftcodeAbuseIds.includes(item.usageId));
  const allVisibleGiftcodeAbuseSelected = filteredGiftcodeAbuseCases.length > 0 && selectedGiftcodeAbuseIds.length === filteredGiftcodeAbuseCases.length;
  const getGiftcodeActionMeta = (action: 'revoke' | 'warn' | 'lock') => {
      if (action === 'revoke') {
          return {
              label: 'Thu hồi Vcoin',
              shortLabel: 'Thu hồi',
              tone: 'red',
              reason: 'Thu hồi Vcoin do lạm dụng giftcode',
              effect: 'Trừ lại đúng lượng Vcoin đã nhận từ lượt giftcode này, đánh dấu lượt thưởng là revoked và abuse_status là revoked_abuse. Không khóa tài khoản.',
              success: 'Đã thu hồi Vcoin',
          };
      }
      if (action === 'warn') {
          return {
              label: 'Gửi cảnh báo',
              shortLabel: 'Cảnh báo',
              tone: 'yellow',
              reason: 'Cảnh báo: không tạo nhiều tài khoản để nhập giftcode',
              effect: 'Ghi cảnh báo vào tài khoản. Người dùng vẫn dùng app bình thường nhưng sẽ thấy banner cảnh báo khi đăng nhập.',
              success: 'Đã gửi cảnh báo',
          };
      }
      return {
          label: 'Khóa tài khoản',
          shortLabel: 'Khóa',
          tone: 'pink',
          reason: 'Khóa tài khoản do lạm dụng giftcode',
          effect: 'Đổi account_status sang locked. Người dùng bị chặn bởi API và thấy màn hình tài khoản bị khóa trên desktop/mobile.',
          success: 'Đã khóa tài khoản',
      };
  };
  const getGiftcodeCaseStatus = (item: GiftcodeAbuseCase) => {
      const local = giftcodeActionState[item.usageId];
      if (local?.status === 'success') {
          return {
              label: `Vừa ${getGiftcodeActionMeta(local.action).shortLabel.toLowerCase()}`,
              className: 'bg-cyan-500/15 text-cyan-300',
              detail: new Date(local.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          };
      }
      if (local?.status === 'error') {
          return { label: 'Lỗi xử lý', className: 'bg-red-500/15 text-red-300', detail: local.note || '' };
      }
      if (item.accountStatus === 'locked') {
          return { label: 'Tài khoản đã khóa', className: 'bg-audi-pink/15 text-audi-pink', detail: item.lockReason || '' };
      }
      if (item.rewardStatus === 'revoked') {
          return { label: 'Đã thu hồi thưởng', className: 'bg-red-500/15 text-red-300', detail: item.abuseStatus };
      }
      if (item.accountWarning) {
          return { label: 'Đã cảnh báo', className: 'bg-yellow-500/15 text-yellow-300', detail: item.accountWarning };
      }
      return { label: 'Chưa xử lý', className: 'bg-white/10 text-slate-300', detail: 'Có thể thu hồi/cảnh báo/khóa' };
  };
  const toggleGiftcodeAbuseSelection = (usageId: string) => {
      setSelectedGiftcodeAbuseIds((current) => current.includes(usageId) ? current.filter((id) => id !== usageId) : [...current, usageId]);
  };
  const toggleAllGiftcodeAbuseSelection = () => {
      setSelectedGiftcodeAbuseIds(allVisibleGiftcodeAbuseSelected ? [] : filteredGiftcodeAbuseCases.map((item) => item.usageId));
  };

  const executeGiftcodeAction = async (action: 'revoke' | 'warn' | 'lock', item: GiftcodeAbuseCase | any, reasonOverride?: string) => {
      const meta = getGiftcodeActionMeta(action);
      try {
          await adminGiftcodeAction(action, {
              userId: item.userId,
              usageId: item.usageId,
              reason: reasonOverride || meta.reason,
          });
          setGiftcodeActionState((current) => ({
              ...current,
              [item.usageId]: { action, at: new Date().toISOString(), status: 'success' },
          }));
          return true;
      } catch (error: any) {
          setGiftcodeActionState((current) => ({
              ...current,
              [item.usageId]: { action, at: new Date().toISOString(), status: 'error', note: error?.message || 'Không thể xử lý' },
          }));
          throw error;
      }
  };

  const runBulkGiftcodeActionNow = async (action: 'revoke' | 'warn' | 'lock') => {
      const targets = selectedGiftcodeAbuseCases;
      if (targets.length === 0) {
          showToast('Chưa chọn tài khoản/lượt vi phạm nào', 'error');
          return;
      }

      const meta = getGiftcodeActionMeta(action);
      const reason = action === 'revoke'
          ? 'Thu hồi Vcoin hàng loạt do lạm dụng giftcode'
          : action === 'warn'
              ? 'Cảnh báo hàng loạt: không tạo nhiều tài khoản để nhập giftcode'
              : 'Khóa hàng loạt do lạm dụng giftcode';

      setBulkGiftcodeActionLoading(true);
      let successCount = 0;
      let failCount = 0;
      try {
          for (const item of targets) {
              try {
                  await executeGiftcodeAction(action, item, reason);
                  successCount += 1;
              } catch {
                  failCount += 1;
              }
          }
          showToast(`Đã xử lý ${successCount} mục${failCount ? `, lỗi ${failCount}` : ''}`, failCount ? 'info' : 'success');
          await refreshData();
          await loadGiftcodeAbuseCases();
      } finally {
          setBulkGiftcodeActionLoading(false);
      }
  };

  const runBulkGiftcodeAction = (action: 'revoke' | 'warn' | 'lock') => {
      const meta = getGiftcodeActionMeta(action);
      const count = selectedGiftcodeAbuseCases.length;
      if (count === 0) {
          showToast('Chưa chọn tài khoản/lượt vi phạm nào', 'error');
          return;
      }
      showConfirm(
          `${meta.label} ${count} mục đã chọn?\n\nTác dụng: ${meta.effect}`,
          async () => runBulkGiftcodeActionNow(action)
      );
  };

  const confirmGiftcodeUserAction = (action: 'revoke' | 'warn' | 'lock', usage: any) => {
      const meta = getGiftcodeActionMeta(action);
      const target = usage.userEmail || usage.userName || usage.userId || 'người dùng này';
      showConfirm(
          `${meta.label} cho ${target}?\n\nTác dụng: ${meta.effect}`,
          async () => handleGiftcodeUserAction(action, usage)
      );
  };

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

  const handleGiftcodeUserAction = async (
      action: 'revoke' | 'warn' | 'lock',
      usage: any
  ) => {
      if (usage.isTopupUsage) {
          showToast('Lượt giftcode nạp chỉ dùng để đối soát. Hãy xử lý qua giao dịch nạp nếu cần.', 'info');
          return;
      }
      const meta = getGiftcodeActionMeta(action);
      try {
           await executeGiftcodeAction(action, usage, meta.reason);
           showToast(`${meta.success}: ${usage.userEmail || usage.userName || usage.userId}`, 'success');
           await refreshData();
           if (viewingGiftcodeUsage) {
               await handleViewGiftcodeUsage(viewingGiftcodeUsage);
          }
          if (activeView === 'giftcode_abuse') {
              await loadGiftcodeAbuseCases();
          }
      } catch (error: any) {
          showToast(error?.message || 'Không thể xử lý thao tác', 'error');
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
      showConfirm('Kéo lại kết quả đã tạo xong từ nhà cung cấp cho mọi job bị timeout trong 7 ngày gần đây? Hành động này chỉ cập nhật job đã có kết quả, không gửi lại job mới.', async () => {
          setRescuingFailedQueueJobs(true);
          try {
              const payload = await forceRescueFailedQueueJobs({
                  assetType: 'all',
                  lookbackHours: 168,
                  limit: 50,
              });
              showToast(
                  `Cứu job xong. Kiểm tra=${payload.checked}, kéo lại=${payload.rescued}, đưa về processing=${payload.revived}, ứng viên=${payload.totalCandidates}.`,
                  payload.rescued > 0 || payload.revived > 0 ? 'success' : 'info',
              );
              await loadQueueJobs({ silent: false });
          } catch (error: any) {
              showToast(`Lỗi cứu job: ${error?.message || error}`, 'error');
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

  const handleRetryQueueJob = async (provider: 'tst' | 'gommo' | 'gpti2') => {
      if (!queueJobPendingRetry || retryingQueueJobProvider) return;
      setRetryingQueueJobProvider(provider);
      try {
          const result = await retryAdminQueueJob(queueJobPendingRetry.id, provider);
          setQueueJobPendingRetry(null);
          showToast(
              result.reused
                  ? `Job chạy lại #${result.retryJobId.slice(0, 12)} đang tồn tại, không trừ phí lần hai.`
                  : `Đã tạo job #${result.retryJobId.slice(0, 12)} bằng ${provider === 'tst' ? 'API 1' : 'API 2'} (${result.costVcoin} Vcoin).`,
          );
          await loadQueueJobs({ silent: false });
          await handleOpenQueueJobDetail(result.retryJobId);
      } catch (error: any) {
          showToast(`Không thể chạy lại job: ${error?.message || error}`, 'error');
      } finally {
          setRetryingQueueJobProvider(null);
      }
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

  const buildRandomTopupGiftcode = (discountPercent: number) => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const suffix = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      return `AUAI-${Math.max(1, Math.min(100, Math.floor(discountPercent || 0)))}-${suffix}`;
  };

  const handleSaveGiftcode = async () => {
      if (editingGiftcode) {
          const giftcodeToSave = {
              ...editingGiftcode,
              code: editingGiftcode.code?.trim()
                  ? editingGiftcode.code
                  : editingGiftcode.codeType === 'topup_discount'
                      ? buildRandomTopupGiftcode(editingGiftcode.discountPercent || 0)
                      : editingGiftcode.code,
          };
          const result = await saveGiftcode(giftcodeToSave);
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

  const reorderAppTourSteps = (tourId: string, draggedStepId: string, targetStepId: string) => {
      if (draggedStepId === targetStepId) return;
      updateAppTour(tourId, (tour) => {
          const orderedSteps = [...tour.steps].sort((a, b) => (a.order || 0) - (b.order || 0));
          const fromIndex = orderedSteps.findIndex((step) => step.id === draggedStepId);
          const toIndex = orderedSteps.findIndex((step) => step.id === targetStepId);
          if (fromIndex < 0 || toIndex < 0) return tour;

          const [draggedStep] = orderedSteps.splice(fromIndex, 1);
          orderedSteps.splice(toIndex, 0, draggedStep);

          return {
              ...tour,
              steps: orderedSteps.map((step, index) => ({ ...step, order: index + 1 })),
          };
      });
  };

  const toggleCollapsedTourStep = (stepId: string) => {
      setCollapsedTourStepIds((current) => (
          current.includes(stepId)
              ? current.filter((id) => id !== stepId)
              : [...current, stepId]
      ));
  };

  const setAllTourStepsCollapsed = (steps: AppTourStep[], collapsed: boolean) => {
      setCollapsedTourStepIds(collapsed ? steps.map((step) => step.id) : []);
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
          const savedConfig = await getAppToursConfig();
          setAppTours(savedConfig);
          setSelectedTourId((current) => current && savedConfig.tours.some((tour) => tour.id === current)
              ? current
              : savedConfig.tours[0]?.id || '');
          window.dispatchEvent(new Event('auditionai:app-tours-updated'));
          showToast('Đã lưu cấu hình hướng dẫn vào database!', 'success');
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

  const handlePreviewR2Cleanup = async () => {
      showToast('Tính năng cleanup R2 theo DB đang tạm khóa để bảo vệ Supabase. Hãy dùng R2 lifecycle/prefix cleanup.', 'error');
  };

  const handleExecuteR2Cleanup = async () => {
      showToast('Tính năng cleanup R2 theo DB đang tạm khóa để bảo vệ Supabase. Hãy dùng R2 lifecycle/prefix cleanup.', 'error');
  };

  // --- BULK ACTIONS ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedTxIds(transactions.filter((transaction) => transaction.status === 'pending').map((transaction) => transaction.id));
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
              <h1 className="text-4xl font-game font-bold text-slate-900 dark:text-white mb-2">ACCESS DENIED</h1>
              <p className="text-slate-700 dark:text-slate-300 font-semibold font-mono">Khu vực hạn chế. Cần quyền Admin cấp 5.</p>
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
  const orderedTourSteps = selectedTour?.steps.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) || [];
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
    <div className="admin-command-center min-h-screen pb-24 animate-fade-in text-slate-800 dark:text-slate-100 font-sans">
      {/* --- TOASTS CONTAINER --- */}
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4 md:px-0">
          {toasts.map(t => (
              <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl neu-raised-md backdrop-blur-md ${
                  t.type === 'success' ? 'text-emerald-500' : 
                  t.type === 'error' ? 'text-red-500' : 'text-cyan-500'
              }`}>
                  {t.type === 'success' && <Icons.Check className="w-5 h-5 shrink-0" />}
                  {t.type === 'error' && <Icons.X className="w-5 h-5 shrink-0" />}
                  {t.type === 'info' && <Icons.Info className="w-5 h-5 shrink-0" />}
                  <span className="text-xs font-bold break-words">{t.msg}</span>
              </div>
          ))}
      </div>

      {/* --- CONFIRM / ALERT DIALOG --- */}
      {confirmDialog.show && (
          <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 pt-24 animate-fade-in overflow-y-auto bg-black/60 backdrop-blur-sm">
              <div className="neu-card p-6 rounded-3xl max-w-lg w-full m-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="w-12 h-12 neu-inset-sm rounded-full flex items-center justify-center mb-4 text-amber-500 mx-auto">
                      <Icons.Bell className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-white text-center mb-2 font-accent">{confirmDialog.title || 'Thông báo'}</h3>
                  <p className="text-slate-700 dark:text-slate-400 font-semibold text-center text-xs mb-6 leading-relaxed whitespace-pre-line">{confirmDialog.msg}</p>
                  
                  <div className="flex gap-3">
                      {!confirmDialog.isAlertOnly && (
                          <button onClick={() => setConfirmDialog(prev => ({...prev, show: false}))} className="flex-1 py-3 rounded-2xl neu-button text-slate-700 dark:text-slate-400 font-semibold font-bold text-xs">
                              Hủy
                          </button>
                      )}
                      <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({...prev, show: false})) }} className="flex-1 py-3 rounded-2xl neu-button-primary font-bold text-xs shadow-lg">
                          {confirmDialog.isAlertOnly ? 'Đã hiểu' : 'Đồng ý'}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      <section className="admin-command-hero" aria-labelledby="admin-command-title">
          <div className="admin-command-hero__glow admin-command-hero__glow--pink" />
          <div className="admin-command-hero__glow admin-command-hero__glow--cyan" />

          <div className="admin-command-hero__copy">
              <div className="admin-command-kicker">
                  <span className="admin-command-kicker__pulse" />
                  AUDITION AI · SECURE OPERATIONS
              </div>
              <div className="admin-command-title-row">
                  <div className="admin-command-mark">
                      <Icons.Shield className="h-7 w-7" />
                  </div>
                  <div>
                      <h1 id="admin-command-title">ADMIN CONTROL CENTER</h1>
                      <p>Điều hành người dùng, tài chính, hạ tầng AI và luồng render trong một không gian thống nhất.</p>
                  </div>
              </div>
          </div>

          <div className="admin-command-health" aria-label="Tình trạng dịch vụ">
              {[
                  { label: 'Grok AI', value: health.gemini, icon: Icons.Sparkles },
                  { label: 'Supabase', value: health.supabase, icon: Icons.Database },
                  {
                      label: health.storage.type === 'R2'
                          ? 'R2 Storage'
                          : health.storage.type === 'Supabase'
                              ? 'Supabase Storage'
                              : 'Cloud Storage',
                      value: health.storage,
                      icon: Icons.Cloud,
                  },
              ].map((service) => {
                  const connected = service.value.status === 'connected';
                  const checking = service.value.status === 'checking';
                  return (
                      <div key={service.label} className={`admin-health-chip ${connected ? 'is-online' : checking ? 'is-checking' : 'is-offline'}`}>
                          <service.icon className="h-4 w-4" />
                          <span>
                              <b>{service.label}</b>
                              <small>{connected ? 'Ổn định' : checking ? 'Đang kiểm tra' : 'Mất kết nối'}</small>
                          </span>
                          <i aria-hidden="true" />
                      </div>
                  );
              })}
              <button
                  type="button"
                  className="admin-refresh-button"
                  onClick={() => void Promise.all([refreshData(), runSystemChecks()])}
                  aria-label="Làm mới dữ liệu và kiểm tra kết nối quản trị"
              >
                  <Icons.RefreshCw className="h-4 w-4" />
                  Đồng bộ
              </button>
          </div>
      </section>

      <nav className="admin-command-nav" aria-label="Điều hướng trang quản trị">
          {ADMIN_NAV_SECTIONS.map((section) => (
              <div key={section.label} className="admin-command-nav__section">
                  <div className="admin-command-nav__heading">
                      <span>{section.eyebrow}</span>
                      <b>{section.label}</b>
                  </div>
                  <div className="admin-command-nav__items">
                      {section.tabs.map((tab) => {
                          const selected = activeView === tab.id;
                          return (
                              <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setActiveView(tab.id)}
                                  className={selected ? 'is-active' : ''}
                                  aria-current={selected ? 'page' : undefined}
                              >
                                  <span className="admin-command-nav__icon">
                                      <tab.icon className="h-5 w-5" />
                                  </span>
                                  <span className="admin-command-nav__label">
                                      <b>{tab.label}</b>
                                      <small>{tab.description}</small>
                                  </span>
                                  <Icons.ChevronRight className="admin-command-nav__arrow h-4 w-4" />
                              </button>
                          );
                      })}
                  </div>
              </div>
          ))}
      </nav>

      {false && <div className="admin-legacy-console w-full neu-card p-5 rounded-3xl mb-6 shadow-2xl space-y-4" aria-hidden="true">
          {/* Top Admin Header & Live System Health */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center gap-3">
                  <div className="w-12 h-12 neu-inset-sm rounded-2xl flex items-center justify-center text-[#FF007F] shadow-inner">
                      <Icons.Shield className="w-6 h-6 text-[#FF007F]" />
                  </div>
                  <div>
                      <div className="flex items-center gap-2">
                          <h1 className="font-accent text-base md:text-xl font-black text-slate-800 dark:text-white uppercase tracking-wider">
                              TRANG QUẢN TRỊ AUDITION 3D
                          </h1>
                          <span className="neu-inset-sm px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold text-[#00F2FE]">
                              v42.0 PRO
                          </span>
                      </div>
                      <p className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold dark:text-slate-700 dark:text-slate-300 font-semibold font-mono tracking-widest mt-0.5">
                          SYSTEM MONITOR • MANAGEMENT CONSOLE
                      </p>
                  </div>
              </div>

              {/* Quick Health Indicators Badges */}
              <div className="flex items-center gap-3 neu-inset-sm px-4 py-2 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-400 font-semibold dark:text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider">Hệ thống:</span>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                      <div className="flex items-center gap-1.5" title="Grok AI Engine">
                          <span className={`w-2.5 h-2.5 rounded-full ${health.gemini.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]' : 'bg-red-500'}`} />
                          <span className="text-slate-700 dark:text-slate-300">Grok</span>
                      </div>
                      <span className="text-slate-700 dark:text-slate-300 font-semibold dark:text-slate-600">•</span>
                      <div className="flex items-center gap-1.5" title="Supabase Database">
                          <span className={`w-2.5 h-2.5 rounded-full ${health.supabase.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]' : 'bg-red-500'}`} />
                          <span className="text-slate-700 dark:text-slate-300">Database</span>
                      </div>
                      <span className="text-slate-700 dark:text-slate-300 font-semibold dark:text-slate-600">•</span>
                      <div className="flex items-center gap-1.5" title={health.storage.type === 'R2' ? 'Cloudflare R2 Storage' : 'Supabase Storage'}>
                          <span className={`w-2.5 h-2.5 rounded-full ${health.storage.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]' : 'bg-red-500'}`} />
                          <span className="text-slate-700 dark:text-slate-300">
                              {health.storage.type === 'R2' ? 'R2 Storage' : health.storage.type === 'Supabase' ? 'Supabase Storage' : 'Cloud Storage'}
                          </span>
                      </div>
                  </div>
              </div>
          </div>

          {/* Navigation Tabs (Categorized 2-Group Admin Console Navigation) */}
          <div className="w-full neu-card p-4 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl space-y-4">
              
              {/* Category 1: VẬN HÀNH HỆ THỐNG */}
              <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#FF007F] mb-2 px-1 font-accent flex items-center gap-1.5">
                      <Icons.Activity className="w-3.5 h-3.5" />
                      <span>VẬN HÀNH & ĐỒNG BỘ</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {[
                          { id: 'overview', icon: Icons.Home, label: 'Tổng Quan' },
                          { id: 'transactions', icon: Icons.Gem, label: 'Giao Dịch' },
                          { id: 'users', icon: Icons.User, label: 'Người Dùng' },
                          { id: 'giftcode_abuse', icon: Icons.AlertTriangle, label: 'Vi Phạm Code' },
                          { id: 'queue', icon: Icons.Clock, label: 'Queue Jobs' },
                      ].map(tab => {
                          const isActive = activeView === tab.id;
                          return (
                              <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setActiveView(tab.id as any)}
                                  className={`px-3 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all w-full text-center ${
                                      isActive 
                                      ? 'neu-inset-sm text-[#FF007F] ring-2 ring-[#FF007F] bg-[#FF007F]/10 shadow-md font-accent scale-[1.02]' 
                                      : 'neu-button text-slate-700 dark:text-slate-300 hover:text-[#FF007F] hover:scale-[1.01]'
                                  }`}
                              >
                                  <tab.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#FF007F]' : 'text-slate-700 dark:text-slate-400 font-semibold'}`} />
                                  <span className="truncate">{tab.label}</span>
                              </button>
                          );
                      })}
                  </div>
              </div>

              {/* Category 2: CẤU HÌNH & KINH DOANH */}
              <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-2 px-1 font-accent flex items-center gap-1.5">
                      <Icons.Settings className="w-3.5 h-3.5" />
                      <span>CẤU HÌNH & KINH DOANH</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                      {[
                          { id: 'packages', icon: Icons.ShoppingBag, label: 'Gói Nạp' },
                          { id: 'marketing', icon: Icons.Zap, label: 'Sự Kiện & Code' },
                          { id: 'pricing', icon: Icons.Gem, label: 'Bảng Giá' },
                          { id: 'styles', icon: Icons.Palette, label: 'Style Mẫu' },
                          { id: 'tours', icon: Icons.Info, label: 'Hướng Dẫn' },
                          { id: 'system', icon: Icons.Cpu, label: 'Hệ Thống' },
                      ].map(tab => {
                          const isActive = activeView === tab.id;
                          return (
                              <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setActiveView(tab.id as any)}
                                  className={`px-3 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all w-full text-center ${
                                      isActive 
                                      ? 'neu-inset-sm text-purple-600 dark:text-purple-400 ring-2 ring-purple-500 bg-purple-500/10 shadow-md font-accent scale-[1.02]' 
                                      : 'neu-button text-slate-700 dark:text-slate-300 hover:text-purple-500 hover:scale-[1.01]'
                                  }`}
                              >
                                  <tab.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-purple-600 dark:text-purple-400' : 'text-slate-700 dark:text-slate-400 font-semibold'}`} />
                                  <span className="truncate">{tab.label}</span>
                              </button>
                          );
                      })}
                  </div>
              </div>

          </div>
      </div>}

      {/* ADMIN WORKSPACE VIEWS */}
      <div className="w-full space-y-6">

          {activeView === 'transactions' && (
              <TransactionsWorkspaceV2
                  transactions={transactions}
                  selectedIds={selectedTxIds}
                  processingId={processingTxId}
                  onToggleAll={handleSelectAll}
                  onToggle={handleSelectTx}
                  onBulkApprove={handleBulkApprove}
                  onBulkReject={handleBulkReject}
                  onApprove={handleApproveTransaction}
                  onReject={handleRejectTransaction}
                  onDelete={handleDeleteTransaction}
                  onRefresh={refreshData}
                  giftcodeLabel={getTopupGiftcodeLabel}
              />
          )}

          {activeView === 'users' && (
              <UsersWorkspaceV2
                  users={visibleUsers}
                  total={filteredUsers.length}
                  search={userSearchEmail}
                  activityFilter={userActivityFilter}
                  sortMode={userSortMode}
                  hasMore={filteredUsers.length > userListLimit}
                  onSearch={setUserSearchEmail}
                  onFilter={setUserActivityFilter}
                  onSort={setUserSortMode}
                  onMore={() => setUserListLimit((current) => current + 30)}
                  onView={handleViewUser}
                  onEdit={openEditUser}
                  isOnline={isUserOnline}
                  timeAgo={getTimeAgo}
              />
          )}

          {activeView === 'giftcode_abuse' && (
              <GiftcodeAbuseWorkspaceV2
                  cases={filteredGiftcodeAbuseCases}
                  allCases={giftcodeAbuseCases}
                  loading={loadingGiftcodeAbuse}
                  search={giftcodeAbuseSearch}
                  filter={giftcodeAbuseFilter}
                  selectedIds={selectedGiftcodeAbuseIds}
                  allSelected={allVisibleGiftcodeAbuseSelected}
                  bulkLoading={bulkGiftcodeActionLoading}
                  onSearch={setGiftcodeAbuseSearch}
                  onFilter={setGiftcodeAbuseFilter}
                  onRefresh={loadGiftcodeAbuseCases}
                  onToggle={toggleGiftcodeAbuseSelection}
                  onToggleAll={toggleAllGiftcodeAbuseSelection}
                  onBulk={runBulkGiftcodeAction}
                  onAction={confirmGiftcodeUserAction}
              />
          )}

          {activeView === 'queue' && (
              <QueueWorkspaceV2
                  jobs={filteredQueueJobs}
                  summary={queueSummary}
                  healthReport={queueHealthReport}
                  loading={loadingQueueJobs}
                  reconciling={reconcilingQueue}
                  rescuing={rescuingFailedQueueJobs}
                  emailFilter={queueEmailFilter}
                  statusFilter={queueStatusFilter}
                  assetFilter={queueAssetFilter}
                  timeScope={queueTimeScope}
                  stageFilter={queueStageFilter}
                  stuckOnly={queueStuckOnly}
                  summaryFilter={queueSummaryFilter}
                  stageOptions={queueStageOptions}
                  onEmailFilter={setQueueEmailFilter}
                  onStatusFilter={setQueueStatusFilter}
                  onAssetFilter={setQueueAssetFilter}
                  onTimeScope={setQueueTimeScope}
                  onStageFilter={setQueueStageFilter}
                  onStuckOnly={setQueueStuckOnly}
                  onSummaryFilter={handleQueueSummaryFilter}
                  onRefresh={() => loadQueueJobs({ silent: false })}
                  onRescue={handleRescueFailedJobs}
                  onReconcile={handleQueueReconcile}
                  onOpen={handleOpenQueueJobDetail}
                  onRetry={setQueueJobPendingRetry}
                  stageLabel={getQueueStageLabel}
                  statusLabel={getQueueStatusLabel}
                  platformLabel={getQueuePlatformLabel}
                  timeAgo={getTimeAgo}
              />
          )}
          
          {/* 1. OVERVIEW VIEW */}
          {activeView === 'overview' && (
              <div className="space-y-6 animate-fade-in">
                  {/* Grid 6 Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                      {[
                          { title: 'Truy Cập Hôm Nay', value: stats?.dashboard?.visitsToday, icon: Icons.Activity, color: 'text-[#00F2FE]', badge: 'LIVE' },
                          { title: 'Truy Cập 30 Ngày', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.visitsTotal || 0), icon: Icons.Cloud, color: 'text-[#00F2FE]', badge: '30 DAYS' },
                          { title: 'User Mới Hôm Nay', value: stats?.dashboard?.newUsersToday, icon: Icons.User, color: 'text-amber-500', badge: 'TODAY' },
                          { title: 'Tổng User Hệ Thống', value: stats?.dashboard?.usersTotal, icon: Icons.User, color: 'text-emerald-500', badge: 'TOTAL' },
                          { title: 'Ảnh Render Hôm Nay', value: stats?.dashboard?.imagesToday, icon: Icons.Image, color: 'text-[#FF007F]', badge: 'RENDER' },
                          { title: 'Ảnh Render 30 Ngày', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.imagesTotal || 0), icon: Icons.Sparkles, color: 'text-[#FF007F]', badge: 'TOTAL' },
                      ].map((item, i) => (
                          <div key={i} className="neu-card p-5 rounded-3xl space-y-3 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                              <div className="flex justify-between items-center">
                                  <div className="w-10 h-10 neu-inset-sm rounded-2xl flex items-center justify-center text-slate-700 dark:text-slate-400 font-semibold dark:text-slate-700 dark:text-slate-300 font-semibold group-hover:text-[#FF007F] transition-colors">
                                      <item.icon className="w-5 h-5" />
                                  </div>
                                  <span className="neu-inset-sm px-2 py-0.5 rounded-full text-[9px] font-mono font-bold text-slate-700 dark:text-slate-400 font-semibold dark:text-slate-700 dark:text-slate-300 font-semibold">
                                      {item.badge}
                                  </span>
                              </div>
                              <div>
                                  <p className="text-[10px] font-extrabold text-slate-700 dark:text-slate-400 font-semibold dark:text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider truncate mb-1">{item.title}</p>
                                  <h3 className={`text-2xl md:text-3xl font-black font-accent ${item.color}`}>
                                      {item.value ?? 0}
                                  </h3>
                              </div>
                          </div>
                      ))}
                  </div>

                  {/* AI Usage Statistics Table */}
                  <AIUsageAnalyticsV2 rows={stats?.dashboard?.aiUsage || []} />
                  <div className="hidden neu-card p-6 rounded-3xl space-y-4 shadow-2xl">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                          <h3 className="font-extrabold text-slate-800 dark:text-white text-base uppercase tracking-wider font-accent flex items-center gap-2">
                              <Icons.BarChart className="w-5 h-5 text-amber-500" />
                              THỐNG KÊ SỬ DỤNG VÀ DOANH THU FEATURES AI
                          </h3>
                      </div>

                      <div className="hidden md:block overflow-x-auto neu-inset-sm rounded-2xl p-2">
                          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                              <thead className="neu-raised-sm text-[10px] font-black text-slate-700 dark:text-slate-400 font-semibold dark:text-slate-700 dark:text-slate-300 font-semibold uppercase font-accent">
                                  <tr>
                                      <th className="px-6 py-4 rounded-l-xl">Tính Năng AI</th>
                                      <th className="px-6 py-4 text-[#00F2FE]">Số Lượt Sử Dụng</th>
                                      <th className="px-6 py-4 text-[#FF007F]">Vcoin Tiêu Thụ</th>
                                      <th className="px-6 py-4 text-right text-emerald-500 rounded-r-xl">Doanh Thu (Ước Tính)</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                  {stats?.dashboard?.aiUsage && stats.dashboard.aiUsage.length > 0 ? (
                                      stats.dashboard.aiUsage.map((row: any, i: number) => (
                                          <tr key={i} className="hover:bg-slate-200/50 dark:hover:neu-inset-sm transition-colors">
                                              <td className="px-6 py-4 font-extrabold text-slate-800 dark:text-white capitalize font-accent flex items-center gap-2">
                                                  <Icons.Sparkles className="w-4 h-4 text-[#FF007F]" />
                                                  {row.feature}
                                              </td>
                                              <td className="px-6 py-4 text-[#00F2FE] font-mono font-bold">{new Intl.NumberFormat('de-DE').format(row.count)}</td>
                                              <td className="px-6 py-4 text-[#FF007F] font-extrabold font-accent">{new Intl.NumberFormat('de-DE').format(row.vcoins)} VCOIN</td>
                                              <td className="px-6 py-4 text-right text-emerald-500 font-extrabold font-mono text-sm">
                                                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.revenue)}
                                              </td>
                                          </tr>
                                      ))
                                  ) : (
                                      <tr>
                                          <td colSpan={4} className="px-6 py-8 text-center text-slate-700 dark:text-slate-400 font-semibold italic">Chưa có dữ liệu thống kê.</td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>

                      <div className="md:hidden space-y-3">
                          {stats?.dashboard?.aiUsage && stats.dashboard.aiUsage.length > 0 ? (
                              stats.dashboard.aiUsage.map((row: any, i: number) => (
                                  <div key={i} className="neu-inset-sm rounded-2xl p-4 flex justify-between items-center">
                                      <div>
                                          <div className="font-bold text-slate-800 dark:text-white capitalize text-xs font-accent">{row.feature}</div>
                                          <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold dark:text-slate-700 dark:text-slate-300 font-semibold mt-0.5">{new Intl.NumberFormat('de-DE').format(row.count)} lượt sử dụng</div>
                                      </div>
                                      <div className="text-right">
                                          <div className="text-[#FF007F] font-black text-xs font-accent">{new Intl.NumberFormat('de-DE').format(row.vcoins)} VC</div>
                                          <div className="text-emerald-400 text-[10px] font-bold font-mono">
                                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.revenue)}
                                          </div>
                                      </div>
                                  </div>
                              ))
                          ) : (
                              <div className="text-center text-slate-700 dark:text-slate-400 font-semibold italic text-xs py-4">Chưa có dữ liệu thống kê.</div>
                          )}
                      </div>
                  </div>
              </div>
          )}

          {false && activeView === 'transactions' && (
              <div className="space-y-6 animate-fade-in">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 neu-card p-6 rounded-3xl shadow-xl border border-slate-300 dark:border-slate-800">
                      <div>
                          <h2 className="text-xl font-black text-slate-950 dark:text-white font-accent uppercase tracking-wider flex items-center gap-2">
                              <Icons.Gem className="w-5 h-5 text-[#FF007F]" />
                              QUẢN LÝ GIAO DỊCH NẠP VCOIN
                          </h2>
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-bold mt-1">Danh sách đối soát giao dịch ngân hàng & phê duyệt nạp Vcoin tự động</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                          {selectedTxIds.length > 0 && (
                              <div className="flex items-center gap-2 neu-inset-sm px-3 py-1.5 rounded-xl border border-[#FF007F]/40 animate-fade-in">
                                  <span className="text-xs font-black text-[#FF007F]">{selectedTxIds.length} đã chọn</span>
                                  <button onClick={handleBulkApprove} className="neu-button p-1.5 text-emerald-600 dark:text-emerald-400 hover:scale-105" title="Duyệt tất cả"><Icons.Check className="w-4 h-4" /></button>
                                  <button onClick={handleBulkReject} className="neu-button p-1.5 text-red-500 hover:scale-105" title="Hủy tất cả"><Icons.X className="w-4 h-4" /></button>
                              </div>
                          )}
                          <button onClick={refreshData} className="neu-button px-4 py-2.5 rounded-xl text-xs font-black text-slate-950 dark:text-white flex items-center gap-2 hover:border-[#FF007F] transition-all">
                              <Icons.Clock className="w-4 h-4 text-[#FF007F]" /> Làm mới dữ liệu
                          </button>
                      </div>
                  </div>

                  {/* Desktop Transactions Table */}
                  <div className="hidden md:block neu-card p-5 rounded-3xl shadow-2xl border border-slate-300 dark:border-slate-800 space-y-4">
                      <div className="neu-inset-sm rounded-2xl overflow-hidden p-1">
                          <table className="w-full text-left text-xs text-slate-800 dark:text-slate-200">
                              <thead className="neu-raised-sm text-[11px] font-black text-slate-950 dark:text-white uppercase font-accent border-b border-slate-300 dark:border-slate-700">
                                  <tr>
                                      <th className="px-5 py-4 w-10">
                                          <input 
                                              type="checkbox" 
                                              className="rounded border-slate-400 checked:bg-[#FF007F]"
                                              checked={transactions.length > 0 && selectedTxIds.length === transactions.length}
                                              onChange={handleSelectAll}
                                          />
                                      </th>
                                      <th className="px-5 py-4">Thời Gian</th>
                                      <th className="px-5 py-4">Mã Đơn</th>
                                      <th className="px-5 py-4">Người Dùng</th>
                                      <th className="px-5 py-4">Gói Nạp</th>
                                      <th className="px-5 py-4 text-right">Số Tiền</th>
                                      <th className="px-5 py-4">Trạng Thái</th>
                                      <th className="px-5 py-4 text-right">Hành Động</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {transactions.length === 0 ? (
                                  <tr><td colSpan={8} className="text-center py-8">Chưa có giao dịch nào.</td></tr>
                              ) : transactions.map(tx => (
                                  <tr key={tx.id} className={`hover:neu-inset-sm transition-colors ${processingTxId === tx.id ? 'opacity-50 pointer-events-none' : ''} ${selectedTxIds.includes(tx.id) ? 'neu-inset-sm' : ''}`}>
                                      <td className="px-6 py-4">
                                          <input 
                                              type="checkbox" 
                                              className="rounded border-white/20 neu-inset-sm checked:bg-audi-pink"
                                              checked={selectedTxIds.includes(tx.id)}
                                              onChange={() => handleSelectTx(tx.id)}
                                          />
                                      </td>
                                      <td className="px-6 py-4 text-xs font-mono">{new Date(tx.createdAt).toLocaleString()}</td>
                                      <td className="px-6 py-4">
                                          <div className="font-mono font-bold text-slate-900 dark:text-white">{tx.order_code || tx.code}</div>
                                          {getTopupGiftcodeLabel(tx.topupGiftcode) && (
                                              <div className="mt-2 inline-flex max-w-[180px] items-center gap-1 rounded-lg border border-audi-cyan/20 bg-audi-cyan/10 px-2 py-1 text-[10px] font-bold text-audi-cyan">
                                                  <Icons.Gift className="h-3 w-3 shrink-0" />
                                                  <span className="truncate font-mono">{getTopupGiftcodeLabel(tx.topupGiftcode)}</span>
                                              </div>
                                          )}
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <img src={tx.userAvatar || 'https://picsum.photos/100/100'} className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                                              <div className="flex flex-col">
                                                  <span className="font-bold text-slate-900 dark:text-white text-xs">{tx.userName || 'Unknown'}</span>
                                                  <span className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold">{tx.userEmail || 'No Email'}</span>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-audi-pink font-bold">+{tx.vcoin_received} Vcoin</td>
                                      <td className="px-6 py-4 text-right">
                                          <div className="font-bold text-slate-900 dark:text-white">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || tx.price || 0)}</div>
                                          {Number(tx.discountAmount || 0) > 0 && (
                                              <div className="mt-1 text-[10px] font-bold text-emerald-300">
                                                  Giảm {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(tx.discountAmount || 0))}
                                              </div>
                                          )}
                                      </td>
                                      <td className="px-6 py-4">
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                              tx.status === 'paid' ? 'neu-inset-sm px-3 py-1 rounded-xl text-emerald-600 dark:text-emerald-400 font-black font-accent border border-emerald-500/30' : 
                                              tx.status === 'pending' ? 'neu-inset-sm px-3 py-1 rounded-xl text-amber-600 dark:text-amber-400 font-black font-accent border border-amber-500/30' : 'neu-inset-sm px-2.5 py-1 rounded-lg text-red-600 dark:text-red-400 font-black font-accent'
                                          }`}>
                                              {tx.status}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                          <div className="flex justify-end gap-2">
                                              {tx.status === 'pending' && (
                                                  <>
                                                      <button onClick={() => handleApproveTransaction(tx.id)} className="neu-button p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400 hover:scale-105" title="Duyệt"><Icons.Check className="w-4 h-4" /></button>
                                                      <button onClick={() => handleRejectTransaction(tx.id)} className="neu-button p-2.5 rounded-xl text-red-500 hover:scale-105" title="Hủy"><Icons.X className="w-4 h-4" /></button>
                                                  </>
                                              )}
                                              <button onClick={() => handleDeleteTransaction(tx.id)} className="neu-button p-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:scale-105" title="Xóa"><Icons.Trash className="w-4 h-4" /></button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                      </div>
                  </div>
                  {/* Mobile cards also same */}
                  <div className="md:hidden space-y-4">
                      {transactions.map(tx => (
                          <div key={tx.id} className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4 relative overflow-hidden shadow-md">
                              <div className={`absolute top-0 left-0 w-1 h-full ${
                                  tx.status === 'paid' ? 'bg-green-500' : 
                                  tx.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                              }`}></div>
                              <div className="pl-3">
                                  <div className="flex justify-between items-start mb-3">
                                      <div className="flex items-center gap-3">
                                          <img src={tx.userAvatar || 'https://picsum.photos/100/100'} className="w-10 h-10 rounded-full border border-white/10 object-cover bg-black" />
                                          <div>
                                              <div className="font-bold text-slate-900 dark:text-white text-sm">{tx.userName || 'Unknown'}</div>
                                              <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold font-mono">{tx.order_code || tx.code}</div>
                                              {getTopupGiftcodeLabel(tx.topupGiftcode) && (
                                                  <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-audi-cyan/20 bg-audi-cyan/10 px-2 py-0.5 text-[10px] font-bold text-audi-cyan">
                                                      <Icons.Gift className="h-3 w-3" />
                                                      <span className="font-mono">{getTopupGiftcodeLabel(tx.topupGiftcode)}</span>
                                                  </div>
                                              )}
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
                                  <div className="grid grid-cols-2 gap-4 mb-3 neu-inset-sm p-3 rounded-lg">
                                      <div>
                                          <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold uppercase font-bold">Số tiền</div>
                                          <div className="text-slate-900 dark:text-white font-bold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || tx.price || 0)}</div>
                                          {Number(tx.discountAmount || 0) > 0 && (
                                              <div className="text-[10px] font-bold text-emerald-300">Giảm {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(tx.discountAmount || 0))}</div>
                                          )}
                                      </div>
                                      <div>
                                          <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold uppercase font-bold">Gói nạp</div>
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
                                      <button onClick={() => handleDeleteTransaction(tx.id)} className="px-3 py-2 bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-lg font-bold text-xs border border-white/10 active:scale-95"><Icons.Trash className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {false && activeView === 'users' && (
              <div className="space-y-6 animate-fade-in">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 neu-card p-6 rounded-3xl shadow-xl border border-slate-300 dark:border-slate-800">
                      <div>
                          <h2 className="text-xl font-black text-slate-950 dark:text-white font-accent uppercase tracking-wider flex items-center gap-2">
                              <Icons.User className="w-5 h-5 text-[#FF007F]" />
                              QUẢN LÝ NGƯỜI DÙNG & TÀI KHOẢN
                          </h2>
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-bold mt-1">Quản lý số dư Vcoin, trạng thái tài khoản, khóa / mở khóa & phân quyền Admin</p>
                      </div>
                      <div className="w-full md:w-auto flex flex-col md:flex-row gap-3">
                          <div className="flex items-center gap-2 neu-input px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 w-full md:w-64">
                              <Icons.Search className="w-4 h-4 text-slate-700 dark:text-slate-400 font-semibold shrink-0" />
                              <input type="text" placeholder="Tìm email hoặc username..." value={userSearchEmail} onChange={(e) => setUserSearchEmail(e.target.value)} className="bg-transparent border-none outline-none text-xs font-bold text-slate-900 dark:text-white w-full placeholder-slate-500" />
                          </div>
                          <select
                              value={userActivityFilter}
                              onChange={(e) => setUserActivityFilter(e.target.value as typeof userActivityFilter)}
                              className="neu-input font-bold text-slate-900 dark:text-white text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 outline-none min-w-[200px]"
                          >
                              <option value="all" className="bg-[#DFE4ED] dark:bg-[#12121a]">Tất cả người dùng</option>
                              <option value="online" className="bg-[#DFE4ED] dark:bg-[#12121a]">Đang online</option>
                              <option value="locked" className="bg-[#DFE4ED] dark:bg-[#12121a]">Tài khoản bị khóa</option>
                              <option value="warned" className="bg-[#DFE4ED] dark:bg-[#12121a]">Đã cảnh báo</option>
                              <option value="inactive_60" className="bg-[#DFE4ED] dark:bg-[#12121a]">Không online 60 ngày</option>
                              <option value="inactive_90" className="bg-[#DFE4ED] dark:bg-[#12121a]">Không online 90 ngày</option>
                          </select>
                          <select
                              value={userSortMode}
                              onChange={(e) => setUserSortMode(e.target.value as typeof userSortMode)}
                              className="neu-input font-bold text-slate-900 dark:text-white text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 outline-none min-w-[180px]"
                          >
                              <option value="last_active_desc" className="bg-[#DFE4ED] dark:bg-[#12121a]">Mới hoạt động</option>
                              <option value="vcoin_desc" className="bg-[#DFE4ED] dark:bg-[#12121a]">Nhiều Vcoin nhất</option>
                              <option value="usage_desc" className="bg-[#DFE4ED] dark:bg-[#12121a]">Hoạt động nhiều nhất</option>
                              <option value="name_asc" className="bg-[#DFE4ED] dark:bg-[#12121a]">Tên A-Z</option>
                          </select>
                      </div>
                  </div>
                  
                  {/* Desktop Users Table */}
                  <div className="hidden md:block neu-card p-5 rounded-3xl shadow-2xl border border-slate-300 dark:border-slate-800 space-y-4">
                      <div className="neu-inset-sm rounded-2xl overflow-hidden p-1">
                          <table className="w-full text-left text-xs text-slate-800 dark:text-slate-200">
                              <thead className="neu-raised-sm text-[11px] font-black text-slate-950 dark:text-white uppercase font-accent border-b border-slate-300 dark:border-slate-700">
                                  <tr>
                                      <th className="px-5 py-4">Tài Khoản</th>
                                      <th className="px-5 py-4">Trạng Thái</th>
                                      <th className="px-5 py-4">Số Dư Vcoin</th>
                                  <th className="px-6 py-4">Hoạt động (Gen)</th>
                                  <th className="px-6 py-4">Vai trò</th>
                                  <th className="px-6 py-4 text-right">Hành động</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {visibleUsers
                                   .map((u: UserProfile) => {
                                       const online = isUserOnline(u.lastActive);
                                      const locked = u.accountStatus === 'locked';
                                       return (
                                          <tr key={u.id} className={`transition-colors ${locked ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:neu-inset-sm'}`}>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-3">
                                                      <div className="relative">
                                                          <img src={u.avatar} className="w-8 h-8 rounded-full border border-white/10 object-cover" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
                                                          {online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-[#12121a] rounded-full animate-pulse"></div>}
                                                      </div>
                                                      <div>
                                                          <div className="font-bold text-slate-900 dark:text-white">{u.username}</div>
                                                          <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold">{u.email}</div>
                                                          <div className="mt-1 flex flex-wrap gap-1">
                                                              {locked && <span className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">LOCKED</span>}
                                                              {u.accountWarning && <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-[10px] font-bold text-yellow-300">WARNED</span>}
                                                          </div>
                                                          {locked && u.lockReason && <div className="mt-1 max-w-[260px] truncate text-[10px] text-red-300" title={u.lockReason}>Lý do khóa: {u.lockReason}</div>}
                                                      </div>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-2">
                                                      <div className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-slate-600'}`}></div>
                                                      <span className={`text-xs font-bold ${online ? 'text-green-500' : 'text-slate-700 dark:text-slate-400 font-semibold'}`}>
                                                          {online ? 'Online' : getTimeAgo(u.lastActive)}
                                                      </span>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4 text-audi-yellow font-bold font-mono">{u.vcoin_balance?.toLocaleString()}</td>
                                              <td className="px-6 py-4">
                                                  <span className="text-slate-900 dark:text-white font-bold">{u.usageCount || 0}</span>
                                                  <span className="text-xs text-slate-700 dark:text-slate-400 font-semibold ml-1">lượt</span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'neu-inset-sm px-2.5 py-1 rounded-lg text-red-600 dark:text-red-400 font-black font-accent' : 'neu-inset-sm px-2.5 py-1 rounded-lg text-sky-600 dark:text-sky-400 font-black font-accent'}`}>
                                                      {u.role}
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                  <button onClick={() => handleViewUser(u)} className="neu-button px-3.5 py-1.5 rounded-xl text-xs font-black text-[#FF007F] hover:scale-105">Chi tiết</button>
                                                  <button onClick={() => openEditUser(u)} className="neu-button px-3.5 py-1.5 rounded-xl text-xs font-black text-sky-500 dark:text-sky-400 hover:scale-105">Sửa</button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                          </tbody>
                      </table>
                      </div>
                  </div>
                  
                  {/* Mobile View */}
                  <div className="md:hidden space-y-4">
                      {visibleUsers
                           .map((u: UserProfile) => {
                               const online = isUserOnline(u.lastActive);
                              const locked = u.accountStatus === 'locked';
                               return (
                                  <div key={u.id} className={`rounded-xl p-4 relative overflow-hidden border ${locked ? 'bg-red-500/5 border-red-500/20' : 'neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl'}`}>
                                      <div className="flex justify-between items-start mb-3">
                                          <div className="flex items-center gap-3">
                                              <div className="relative">
                                                  <img src={u.avatar} className="w-10 h-10 rounded-full border border-white/10 object-cover" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
                                                  {online && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#12121a] rounded-full animate-pulse"></div>}
                                              </div>
                                               <div>
                                                   <div className="font-bold text-slate-900 dark:text-white text-sm">{u.username}</div>
                                                   <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold">{u.email}</div>
                                                  <div className="mt-1 flex flex-wrap gap-1">
                                                      {locked && <span className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">LOCKED</span>}
                                                      {u.accountWarning && <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-[10px] font-bold text-yellow-300">WARNED</span>}
                                                  </div>
                                               </div>
                                           </div>
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'neu-inset-sm px-2.5 py-1 rounded-lg text-red-600 dark:text-red-400 font-black font-accent' : 'neu-inset-sm px-2.5 py-1 rounded-lg text-sky-600 dark:text-sky-400 font-black font-accent'}`}>
                                              {u.role}
                                          </span>
                                       </div>
                                      {locked && u.lockReason && (
                                          <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-200">
                                              Lý do khóa: {u.lockReason}
                                          </div>
                                      )}

                                       <div className="grid grid-cols-3 gap-2 mb-3 neu-inset-sm p-2 rounded-lg">
                                          <div className="text-center">
                                              <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold uppercase font-bold">Trạng thái</div>
                                              <div className={`text-xs font-bold ${online ? 'text-green-500' : 'text-slate-700 dark:text-slate-300 font-semibold'}`}>
                                                  {online ? 'Online' : getTimeAgo(u.lastActive)}
                                              </div>
                                          </div>
                                          <div className="text-center border-l border-white/10">
                                              <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold uppercase font-bold">Số dư</div>
                                              <div className="text-xs font-bold text-audi-yellow">{u.vcoin_balance?.toLocaleString()} VC</div>
                                          </div>
                                          <div className="text-center border-l border-white/10">
                                              <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold uppercase font-bold">Hoạt động</div>
                                              <div className="text-xs font-bold text-slate-900 dark:text-white">{u.usageCount || 0} gen</div>
                                          </div>
                                      </div>

                                      <div className="flex gap-2 border-t border-white/5 pt-3">
                                          <button onClick={() => handleViewUser(u)} className="flex-1 neu-button py-2 rounded-xl text-xs font-black text-[#FF007F]">Chi tiết</button>
                                          <button onClick={() => openEditUser(u)} className="flex-1 neu-button py-2 rounded-xl text-xs font-black text-sky-500 dark:text-sky-400">Sửa</button>
                                      </div>
                                  </div>
                              );
                          })}
                  </div>

                  {filteredUsers.length > userListLimit && (
                      <div className="flex justify-center pt-2">
                          <button
                              onClick={() => setUserListLimit(prev => prev + 30)}
                              className="px-5 py-2.5 rounded-xl neu-inset-sm hover:bg-white/10 border border-white/10 text-sm font-bold text-slate-900 dark:text-white transition-colors"
                          >
                              Xem thêm 30 người dùng
                          </button>
                      </div>
                  )}
              </div>
          )}

          {false && activeView === 'giftcode_abuse' && (
              <div className="space-y-6 animate-fade-in">
                  <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 neu-card p-6 rounded-3xl shadow-xl border border-slate-300 dark:border-slate-800">
                      <div>
                          <h2 className="text-xl font-black text-slate-950 dark:text-white font-accent uppercase tracking-wider flex items-center gap-2">
                              <Icons.AlertTriangle className="w-5 h-5 text-amber-500" />
                              CẢNH BÁO VI PHẠM & LẠM DỤNG GIFTCODE
                          </h2>
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-bold mt-1">Tự động phát hiện các cụm IP/Thiết bị tạo tài khoản ảo để trục lợi Giftcode và tự động cảnh báo/khóa tài khoản</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                          <button onClick={loadGiftcodeAbuseCases} disabled={loadingGiftcodeAbuse} className="neu-button px-4 py-2.5 rounded-xl text-xs font-black text-slate-950 dark:text-white disabled:opacity-60 flex items-center gap-2 hover:border-[#FF007F] transition-all">
                              <Icons.RefreshCw className={`w-4 h-4 text-[#FF007F] ${loadingGiftcodeAbuse ? 'animate-spin' : ''}`} /> Làm mới danh sách
                          </button>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                          { label: 'Tổng Trường Hợp', value: giftcodeAbuseCases.length, tone: 'text-slate-950 dark:text-white' },
                          { label: 'Chưa Xử Lý', value: giftcodeAbuseCases.filter((i) => i.rewardStatus !== 'revoked' && i.accountStatus !== 'locked' && !i.accountWarning).length, tone: 'text-amber-500' },
                          { label: 'Đã Thu Hồi Vcoin', value: giftcodeAbuseCases.filter((i) => i.rewardStatus === 'revoked').length, tone: 'text-red-500' },
                          { label: 'Tài Khoản Đã Khóa', value: giftcodeAbuseCases.filter((i) => i.accountStatus === 'locked').length, tone: 'text-[#FF007F]' },
                      ].map((item) => (
                          <div key={item.label} className="neu-card p-4.5 rounded-2xl space-y-1">
                              <div className="text-[10px] uppercase font-black text-slate-700 dark:text-slate-300 tracking-wider font-accent">{item.label}</div>
                              <div className={`text-2xl font-black font-mono ${item.tone}`}>{item.value}</div>
                          </div>
                      ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                      {(['revoke', 'warn', 'lock'] as const).map((action) => {
                          const meta = getGiftcodeActionMeta(action);
                          const toneClass = action === 'revoke'
                              ? 'border-red-500/20 bg-red-500/5 text-red-200'
                              : action === 'warn'
                                  ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-100'
                                  : 'border-audi-pink/20 bg-audi-pink/5 text-pink-100';
                          return (
                              <div key={action} className={`neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl ${toneClass}`}>
                                  <div className="flex items-center justify-between gap-3">
                                      <div className="font-black text-slate-900 dark:text-white">{meta.label}</div>
                                      <span className="rounded-full neu-inset-sm px-2 py-1 text-[10px] font-bold uppercase">{action}</span>
                                  </div>
                                  <p className="mt-2 text-xs leading-relaxed opacity-90">{meta.effect}</p>
                              </div>
                          );
                      })}
                  </div>

                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl space-y-4">
                      <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
                          <div className="flex flex-col md:flex-row gap-3 flex-1">
                              <div className="flex items-center gap-2 neu-inset-sm rounded-xl border border-white/10 px-3 py-2 w-full md:max-w-md">
                                  <Icons.Search className="w-4 h-4 text-slate-700 dark:text-slate-400 font-semibold" />
                                  <input value={giftcodeAbuseSearch} onChange={(e) => setGiftcodeAbuseSearch(e.target.value)} placeholder="Tìm email, IP, code, campaign, browser key..." className="bg-transparent border-none outline-none text-sm text-white w-full placeholder-slate-500" />
                              </div>
                              <select value={giftcodeAbuseFilter} onChange={(e) => setGiftcodeAbuseFilter(e.target.value as typeof giftcodeAbuseFilter)} className="neu-inset-sm border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none min-w-[190px]">
                                  <option value="unhandled" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Chưa xử lý</option>
                                  <option value="all" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Tất cả case</option>
                                  <option value="duplicates" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Trùng cụm</option>
                                  <option value="high_risk" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Risk cao</option>
                                  <option value="revoked" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Đã thu hồi</option>
                                  <option value="locked" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Đã khóa</option>
                              </select>
                          </div>
                          <div className="flex flex-wrap gap-2">
                              <button onClick={toggleAllGiftcodeAbuseSelection} className="px-3 py-2 rounded-xl neu-inset-sm hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-900 dark:text-white">
                                  {allVisibleGiftcodeAbuseSelected ? 'Bỏ chọn' : 'Chọn tất cả'} ({filteredGiftcodeAbuseCases.length})
                              </button>
                              <button onClick={() => runBulkGiftcodeAction('revoke')} disabled={bulkGiftcodeActionLoading || selectedGiftcodeAbuseCases.length === 0} className="px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/20 text-xs font-bold disabled:opacity-50">Thu hồi chọn</button>
                              <button onClick={() => runBulkGiftcodeAction('warn')} disabled={bulkGiftcodeActionLoading || selectedGiftcodeAbuseCases.length === 0} className="px-3 py-2 rounded-xl bg-yellow-500/15 hover:bg-yellow-500 text-yellow-300 hover:text-black border border-yellow-500/20 text-xs font-bold disabled:opacity-50">Cảnh báo chọn</button>
                              <button onClick={() => runBulkGiftcodeAction('lock')} disabled={bulkGiftcodeActionLoading || selectedGiftcodeAbuseCases.length === 0} className="px-3 py-2 rounded-xl bg-audi-pink/15 hover:bg-audi-pink text-audi-pink hover:text-white border border-audi-pink/20 text-xs font-bold disabled:opacity-50">Khóa chọn</button>
                          </div>
                      </div>

                      <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold">
                          Đã chọn <span className="text-slate-900 dark:text-white font-bold">{selectedGiftcodeAbuseCases.length}</span> mục. Severity = risk score + điểm trùng cụm email/IP/browser/user.
                      </div>
                  </div>

                  <div className="hidden xl:block neu-card p-5 rounded-3xl shadow-2xl border border-slate-300 dark:border-slate-800 space-y-4">
                      <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 font-semibold">
                          <thead className="neu-inset-sm text-[10px] font-bold text-slate-700 dark:text-slate-400 font-semibold uppercase">
                              <tr>
                                  <th className="px-4 py-3 w-10"></th>
                                  <th className="px-4 py-3">User</th>
                                  <th className="px-4 py-3">Giftcode</th>
                                  <th className="px-4 py-3">Bằng chứng</th>
                                  <th className="px-4 py-3">IP / Browser / Email</th>
                                  <th className="px-4 py-3">Trạng thái</th>
                                  <th className="px-4 py-3 text-right">Xử lý</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {loadingGiftcodeAbuse ? (
                                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-700 dark:text-slate-400 font-semibold"><Icons.Loader className="w-6 h-6 animate-spin mx-auto mb-2 text-audi-cyan" />Đang tải dữ liệu vi phạm...</td></tr>
                              ) : filteredGiftcodeAbuseCases.length === 0 ? (
                                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-700 dark:text-slate-400 font-semibold">Không có case phù hợp bộ lọc.</td></tr>
                              ) : filteredGiftcodeAbuseCases.map((item) => {
                                  const caseStatus = getGiftcodeCaseStatus(item);
                                  const justActed = Boolean(giftcodeActionState[item.usageId]?.status === 'success');
                                  return (
                                  <tr key={item.usageId} className={`transition-colors align-top ${justActed ? 'bg-cyan-500/5 ring-1 ring-inset ring-cyan-500/20' : 'hover:neu-inset-sm'}`}>
                                      <td className="px-4 py-4">
                                          <input type="checkbox" checked={selectedGiftcodeAbuseIds.includes(item.usageId)} onChange={() => toggleGiftcodeAbuseSelection(item.usageId)} className="accent-audi-pink w-4 h-4" />
                                      </td>
                                      <td className="px-4 py-4 min-w-[220px]">
                                          <div className="flex items-center gap-3">
                                              <img src={item.userAvatar} className="w-9 h-9 rounded-full bg-white/10 object-cover" />
                                              <div>
                                                  <div className="font-bold text-slate-900 dark:text-white">{item.userName}</div>
                                                  <div className="text-slate-700 dark:text-slate-300 font-semibold">{item.userEmail}</div>
                                                  <div className="mt-1 flex gap-2 text-[10px]">
                                                      <span className="text-audi-yellow">{item.userBalance} VC</span>
                                                      <span className={item.accountStatus === 'locked' ? 'text-red-300' : 'text-emerald-300'}>{item.accountStatus}</span>
                                                  </div>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-4 py-4 min-w-[150px]">
                                          <div className="font-mono font-bold text-slate-900 dark:text-white">{item.giftCode}</div>
                                          <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold">Campaign: {item.campaignKey}</div>
                                          <div className="text-[10px] text-audi-yellow">+{item.reward} VC</div>
                                          <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold mt-1">{formatVietnamDateTimeDisplay(item.usedAt)}</div>
                                      </td>
                                      <td className="px-4 py-4 min-w-[260px]">
                                          <div className="flex flex-wrap gap-1 mb-2">
                                              <span className={`px-2 py-1 rounded font-bold ${item.severity >= 120 ? 'bg-red-500/20 text-red-300' : item.severity >= 70 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-white/10 text-slate-300'}`}>Severity {item.severity}</span>
                                              <span className="px-2 py-1 rounded bg-audi-yellow/10 text-audi-yellow font-bold">Risk {item.riskScore}</span>
                                          </div>
                                          <div className="space-y-1">
                                              {item.evidence.slice(0, 5).map((evidence) => <div key={evidence} className="text-[11px] text-slate-300">• {evidence}</div>)}
                                              {item.evidence.length > 5 && <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold">+{item.evidence.length - 5} bằng chứng khác</div>}
                                          </div>
                                      </td>
                                      <td className="px-4 py-4 min-w-[260px] font-mono text-[10px]">
                                          <div className="space-y-1">
                                              <div><span className="text-slate-700 dark:text-slate-400 font-semibold">IP:</span> <span className="text-white">{item.ipAddress || 'Ẩn/cũ'}</span> {item.clusterCounts.ip > 1 && <span className="text-red-300">({item.clusterCounts.ip})</span>}</div>
                                              <div className="truncate max-w-[280px]" title={item.ipHash || ''}><span className="text-slate-700 dark:text-slate-400 font-semibold">IP hash:</span> {item.ipHash || '-'}</div>
                                              <div className="truncate max-w-[280px]" title={item.browserKeyHash || ''}><span className="text-slate-700 dark:text-slate-400 font-semibold">Browser:</span> {item.browserKeyHash || '-'} {item.clusterCounts.browser > 1 && <span className="text-red-300">({item.clusterCounts.browser})</span>}</div>
                                              <div className="truncate max-w-[280px]" title={item.emailFingerprint || ''}><span className="text-slate-700 dark:text-slate-400 font-semibold">Email cluster:</span> {item.emailFingerprint || '-'} {item.clusterCounts.email > 1 && <span className="text-red-300">({item.clusterCounts.email})</span>}</div>
                                          </div>
                                      </td>
                                      <td className="px-4 py-4 min-w-[130px]">
                                          <span className={`block w-fit rounded px-2 py-1 text-[10px] font-bold uppercase ${caseStatus.className}`}>{caseStatus.label}</span>
                                          {caseStatus.detail && <div className="mt-1 max-w-[170px] truncate text-[10px] text-slate-700 dark:text-slate-400 font-semibold" title={caseStatus.detail}>{caseStatus.detail}</div>}
                                          <span className={`mt-2 block w-fit rounded px-2 py-1 text-[10px] font-bold uppercase ${item.rewardStatus === 'revoked' ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{item.rewardStatus}</span>
                                          <span className={`mt-1 block w-fit rounded px-2 py-1 text-[10px] font-bold uppercase ${item.abuseStatus === 'ok' ? 'bg-white/10 text-slate-300' : 'bg-yellow-500/15 text-yellow-300'}`}>{item.abuseStatus}</span>
                                      </td>
                                      <td className="px-4 py-4 text-right">
                                          <div className="flex justify-end gap-1">
                                              <button title={getGiftcodeActionMeta('revoke').effect} onClick={() => confirmGiftcodeUserAction('revoke', item)} disabled={item.rewardStatus === 'revoked'} className="neu-button px-3 py-1.5 rounded-xl text-xs font-black text-red-500 hover:scale-105 disabled:opacity-40">Thu hồi</button>
                                              <button title={getGiftcodeActionMeta('warn').effect} onClick={() => confirmGiftcodeUserAction('warn', item)} disabled={Boolean(item.accountWarning)} className="neu-button px-3 py-1.5 rounded-xl text-xs font-black text-amber-500 hover:scale-105 disabled:opacity-40">Cảnh báo</button>
                                              <button title={getGiftcodeActionMeta('lock').effect} onClick={() => confirmGiftcodeUserAction('lock', item)} disabled={item.accountStatus === 'locked'} className="neu-button px-3 py-1.5 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 hover:scale-105 disabled:opacity-40">Khóa</button>
                                          </div>
                                      </td>
                                  </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>

                  <div className="xl:hidden space-y-3">
                      {loadingGiftcodeAbuse ? (
                          <div className="rounded-2xl border neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-8 text-center text-slate-700 dark:text-slate-400 font-semibold"><Icons.Loader className="w-6 h-6 animate-spin mx-auto mb-2 text-audi-cyan" />Đang tải dữ liệu vi phạm...</div>
                      ) : filteredGiftcodeAbuseCases.map((item) => {
                          const caseStatus = getGiftcodeCaseStatus(item);
                          const justActed = Boolean(giftcodeActionState[item.usageId]?.status === 'success');
                          return (
                          <div key={item.usageId} className={`rounded-2xl border p-4 space-y-3 ${justActed ? 'border-cyan-500/30 bg-cyan-500/5' : 'neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl'}`}>
                              <div className="flex items-start justify-between gap-3">
                                  <label className="flex items-start gap-3">
                                      <input type="checkbox" checked={selectedGiftcodeAbuseIds.includes(item.usageId)} onChange={() => toggleGiftcodeAbuseSelection(item.usageId)} className="mt-1 accent-audi-pink w-4 h-4" />
                                      <div>
                                          <div className="font-bold text-slate-900 dark:text-white">{item.userName}</div>
                                          <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{item.userEmail}</div>
                                      </div>
                                  </label>
                                  <div className="flex flex-col items-end gap-1">
                                      <span className="rounded bg-audi-yellow/10 px-2 py-1 text-[10px] font-bold text-audi-yellow">Risk {item.riskScore}</span>
                                      <span className={`rounded px-2 py-1 text-[10px] font-bold ${caseStatus.className}`}>{caseStatus.label}</span>
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="rounded-lg neu-inset-sm p-2"><div className="text-slate-700 dark:text-slate-400 font-semibold">Code</div><div className="font-mono font-bold text-slate-900 dark:text-white">{item.giftCode}</div></div>
                                  <div className="rounded-lg neu-inset-sm p-2"><div className="text-slate-700 dark:text-slate-400 font-semibold">IP</div><div className="font-mono font-bold text-slate-900 dark:text-white truncate">{item.ipAddress || 'Ẩn/cũ'}</div></div>
                                  <div className="rounded-lg neu-inset-sm p-2 col-span-2"><div className="text-slate-700 dark:text-slate-400 font-semibold">Email cluster</div><div className="font-mono font-bold text-slate-900 dark:text-white truncate">{item.emailFingerprint || '-'}</div></div>
                                  <div className="rounded-lg neu-inset-sm p-2 col-span-2"><div className="text-slate-700 dark:text-slate-400 font-semibold">Browser key</div><div className="font-mono font-bold text-slate-900 dark:text-white truncate">{item.browserKeyHash || '-'}</div></div>
                              </div>
                              <div className="space-y-1">
                                  {item.evidence.slice(0, 4).map((evidence) => <div key={evidence} className="text-xs text-slate-300">• {evidence}</div>)}
                              </div>
                              <div className="flex gap-2 border-t border-white/5 pt-3">
                                  <button onClick={() => confirmGiftcodeUserAction('revoke', item)} disabled={item.rewardStatus === 'revoked'} className="flex-1 rounded bg-red-500/15 px-2 py-2 text-xs font-bold text-red-300 disabled:opacity-40">Thu hồi</button>
                                  <button onClick={() => confirmGiftcodeUserAction('warn', item)} disabled={Boolean(item.accountWarning)} className="flex-1 rounded bg-yellow-500/15 px-2 py-2 text-xs font-bold text-yellow-300 disabled:opacity-40">Cảnh báo</button>
                                  <button onClick={() => confirmGiftcodeUserAction('lock', item)} disabled={item.accountStatus === 'locked'} className="flex-1 rounded bg-white/10 px-2 py-2 text-xs font-bold text-slate-200 disabled:opacity-40">Khóa</button>
                              </div>
                          </div>
                          );
                      })}
                  </div>
              </div>
          )}

          {activeView === 'queue' && Boolean(false) && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                      <div>
                          <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Queue Jobs</h2>
                          <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold mt-1">Theo dõi job đang kẹt, poll quá hạn và queued quá lâu.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                          <button onClick={() => loadQueueJobs({ silent: false })} disabled={loadingQueueJobs} className="px-4 py-2 rounded-xl neu-inset-sm hover:bg-white/10 border border-white/10 text-sm font-bold text-slate-900 dark:text-white disabled:opacity-60">
                              {loadingQueueJobs ? 'Đang tải...' : 'Làm mới'}
                          </button>
                          <button onClick={handleRescueFailedJobs} disabled={rescuingFailedQueueJobs} className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-slate-900 dark:text-white text-sm font-bold disabled:opacity-60">
                              {rescuingFailedQueueJobs ? 'Đang cứu job...' : 'Cứu job timeout'}
                          </button>
                          <button onClick={handleQueueReconcile} disabled={reconcilingQueue} className="px-4 py-2 rounded-xl bg-audi-pink hover:bg-pink-600 text-slate-900 dark:text-white text-sm font-bold disabled:opacity-60">
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
                          { key: 'stalled_pre_dispatch', value: queueSummary.stalledPreDispatch, label: 'Kẹt trước khi gửi', color: 'text-pink-400' },
                      ].map((item) => (
                          <button
                              key={item.label}
                              type="button"
                              onClick={() => handleQueueSummaryFilter(item.key as typeof queueSummaryFilter)}
                              className={`text-left neu-card p-4.5 rounded-2xl transition-all hover:scale-[1.02] ${
                                  queueSummaryFilter === item.key || (item.key === 'all' && queueSummaryFilter === 'all')
                                      ? 'border-audi-pink/60 shadow-[0_0_0_1px_rgba(255,0,153,0.25)]'
                                      : 'border-white/10'
                              }`}
                          >
                              <div className="text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">{item.label}</div>
                              <div className={`text-2xl font-black mt-2 ${item.color}`}>{item.value}</div>
                          </button>
                      ))}
                  </div>

                  {queueHealthReport && (
                      <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl space-y-4">
                          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                              <div>
                                  <div className="text-base font-black text-slate-950 dark:text-white uppercase font-accent">BÁO CÁO SỨC KHỎE HÀNG CHỜ (QUEUE HEALTH)</div>
                                  <div className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                                      Live DB: {
                                          isQueueHealthSnapshot(queueHealthReport.liveDbReport)
                                              ? `${queueHealthReport.liveDbReport.scanned || 0} job, ${queueHealthReport.liveDbReport.watchdogDue || 0} cần watchdog`
                                              : `chưa có RPC hoặc lỗi: ${'error' in (queueHealthReport.liveDbReport || {}) ? (queueHealthReport.liveDbReport as any).error : 'N/A'}`
                                      }
                                  </div>
                                  <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-700 dark:text-slate-300 font-semibold">
                                      Watchdog gần nhất: {queueHealthReport.lastWatchdogReportUpdatedAt ? getTimeAgo(queueHealthReport.lastWatchdogReportUpdatedAt) : 'chưa ghi snapshot'}
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                  {(() => {
                                      const live = isQueueHealthSnapshot(queueHealthReport.liveDbReport) ? queueHealthReport.liveDbReport : null;
                                      const counts = live?.counts || {};
                                      return [
                                          ['Queued stale', counts.queued_stale || 0, 'text-amber-500'],
                                          ['Safe requeue', counts.pre_dispatch_safe_requeue_due || 0, 'text-pink-500'],
                                          ['Provider risk', counts.pre_dispatch_provider_risk || 0, 'text-red-500'],
                                          ['Poll quá hạn', counts.poll_overdue || 0, 'text-red-400'],
                                      ].map(([label, value, color]) => (
                                          <div key={String(label)} className="neu-card p-3 rounded-2xl space-y-1">
                                              <div className="text-[10px] uppercase font-black text-slate-700 dark:text-slate-300 tracking-wider font-accent">{label}</div>
                                              <div className={`text-lg font-black font-mono ${color}`}>{value}</div>
                                          </div>
                                      ));
                                  })()}
                              </div>
                          </div>
                      </div>
                  )}

                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_170px_repeat(3,minmax(0,1fr))_170px] gap-3">
                          <div className="flex h-12 items-center gap-2 neu-input px-3.5 rounded-xl border border-slate-300 dark:border-slate-700">
                              <Icons.Search className="w-4 h-4 text-slate-700 dark:text-slate-400 font-semibold shrink-0" />
                              <input type="text" placeholder="Email hoặc job id..." value={queueEmailFilter} onChange={(e) => setQueueEmailFilter(e.target.value)} className="bg-transparent border-none outline-none text-xs font-bold text-slate-900 dark:text-white w-full placeholder-slate-500" />
                          </div>
                          <div className="flex h-12 items-center gap-1 neu-inset-sm rounded-xl border border-white/10 p-1">
                              <button
                                  type="button"
                                  onClick={() => setQueueTimeScope('today')}
                                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${queueTimeScope === 'today' ? 'bg-audi-cyan text-slate-950' : 'text-white hover:neu-inset-sm'}`}
                              >
                                  Hôm nay
                              </button>
                              <button
                                  type="button"
                                  onClick={() => setQueueTimeScope('all')}
                                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${queueTimeScope === 'all' ? 'bg-audi-pink text-white' : 'text-white hover:neu-inset-sm'}`}
                              >
                                  Tất cả
                              </button>
                          </div>
                          <select value={queueStatusFilter} onChange={(e) => setQueueStatusFilter(e.target.value as typeof queueStatusFilter)} className="h-12 neu-input font-bold text-slate-900 dark:text-white text-xs px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 outline-none">
                              <option value="all" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Trạng thái</option>
                              <option value="queued" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Đang chờ</option>
                              <option value="processing" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Đang xử lý</option>
                              <option value="rescuing" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Đang cứu kết quả</option>
                              <option value="completed" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Hoàn thành</option>
                              <option value="failed" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Thất bại</option>
                          </select>
                          <select value={queueAssetFilter} onChange={(e) => setQueueAssetFilter(e.target.value as typeof queueAssetFilter)} className="h-12 neu-input font-bold text-slate-900 dark:text-white text-xs px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 outline-none">
                              <option value="all" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Ảnh + Video</option>
                              <option value="image" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Chỉ ảnh</option>
                              <option value="video" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Chỉ video</option>
                          </select>
                          <select value={queueStageFilter} onChange={(e) => setQueueStageFilter(e.target.value)} className="h-12 neu-input font-bold text-slate-900 dark:text-white text-xs px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 outline-none">
                              <option value="all" className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">Stage</option>
                              {queueStageOptions.map((stage) => (
                                  <option key={stage} value={stage} className="bg-[#DFE4ED] dark:bg-[#13161F] text-slate-900 dark:text-white font-bold">{getQueueStageLabel(stage)}</option>
                              ))}
                          </select>
                          <label className="flex h-12 items-center justify-between gap-3 neu-input font-bold text-slate-900 dark:text-white text-xs px-3.5 rounded-xl border border-slate-300 dark:border-slate-700">
                              <span>Đang kẹt</span>
                              <input type="checkbox" className="accent-audi-pink" checked={queueStuckOnly} onChange={(e) => setQueueStuckOnly(e.target.checked)} />
                          </label>
                      </div>

                      <div className="hidden xl:block overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-300">
                              <thead className="text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold border-b border-white/10">
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
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                  {filteredQueueJobs.length === 0 ? (
                                      <tr>
                                          <td colSpan={8} className="px-3 py-8 text-center text-slate-700 dark:text-slate-400 font-semibold">Không có job nào khớp bộ lọc.</td>
                                      </tr>
                                  ) : filteredQueueJobs.map((job) => {
                                      const lastLogMessage = job.lastLogMessage || (job.queueLogs && job.queueLogs.length > 0 ? job.queueLogs[job.queueLogs.length - 1]?.message : '') || job.error || '-';
                                      return (
                                          <tr key={job.id} className="align-top hover:neu-inset-sm">
                                              <td className="px-3 py-3">
                                                  <div className="font-bold text-slate-900 dark:text-white">{job.userName || 'Unknown'}</div>
                                                  <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold">{job.userEmail || job.userId}</div>
                                              </td>
                                              <td className="px-3 py-3">
                                                  <div className="text-white font-mono text-xs">{job.id.slice(0, 12)}</div>
                                                  <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold mt-1">{job.assetType === 'video' ? 'Video' : 'Ảnh'}</div>
                                                  <div className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold mt-1">thiết bị: {getQueuePlatformLabel(job.clientPlatform)}</div>
                                              </td>
                                              <td className="px-3 py-3">
                                                  <div className={`inline-flex px-2 py-1 rounded text-[11px] font-bold uppercase ${getQueueStatusClass(job.displayStatus || job.status)}`}>
                                                      {getQueueStatusLabel(job.displayStatus || job.status)}
                                                  </div>
                                                  {job.isStuck && <div className="text-[11px] text-orange-400 font-bold mt-2">{job.health?.label || 'STUCK'}</div>}
                                              </td>
                                              <td className="px-3 py-3 text-xs text-slate-300">{getQueueStageLabel(job.queueStage)}</td>
                                              <td className="px-3 py-3">
                                                  <div className="text-sm font-bold text-slate-900 dark:text-white">{job.progress || 0}%</div>
                                                  <div className="w-24 h-2 rounded-full bg-white/10 mt-2 overflow-hidden">
                                                      <div className={`h-full ${(job.displayStatus || job.status) === 'queued' ? 'bg-yellow-400' : (job.displayStatus || job.status) === 'rescuing' ? 'bg-violet-400' : 'bg-audi-cyan'}`} style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }} />
                                                  </div>
                                              </td>
                                              <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300 font-semibold">
                                                  <div>{getTimeAgo(job.updatedAt)}</div>
                                                  {job.nextPollAt && <div className="mt-1">poll: {getTimeAgo(job.nextPollAt)}</div>}
                                              </td>
                                              <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300 font-semibold max-w-[360px]">
                                                  {job.health && (
                                                      <div className={`mb-2 rounded-lg border p-2 ${getQueueHealthClass(job.health.severity)}`}>
                                                          <div className="font-bold">{job.health.label}</div>
                                                          <div className="mt-1 text-[11px] leading-relaxed opacity-90">{job.health.detail}</div>
                                                          <div className="mt-1 text-[11px] font-bold opacity-95">Hành động: {job.health.action}</div>
                                                          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                                                              <span className="rounded neu-inset-sm px-1.5 py-0.5">lease: {job.health.leaseState || '-'}</span>
                                                              {typeof job.health.recoveries === 'number' && <span className="rounded neu-inset-sm px-1.5 py-0.5">recoveries: {job.health.recoveries}</span>}
                                                              {job.health.providerRisk && <span className="rounded neu-inset-sm px-1.5 py-0.5">provider-risk</span>}
                                                              {job.health.safeToRequeue && <span className="rounded neu-inset-sm px-1.5 py-0.5">safe-requeue</span>}
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
                                                  <button onClick={() => handleOpenQueueJobDetail(job.id)} className="neu-button px-3.5 py-1.5 rounded-xl text-xs font-black text-[#FF007F] hover:scale-105">
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
                              <div className="text-center text-slate-700 dark:text-slate-400 font-semibold py-6">Không có job nào khớp bộ lọc.</div>
                          ) : filteredQueueJobs.map((job) => {
                              const lastLogMessage = job.lastLogMessage || (job.queueLogs && job.queueLogs.length > 0 ? job.queueLogs[job.queueLogs.length - 1]?.message : '') || job.error || 'Chưa có log mới';
                              return (
                                  <div key={job.id} className="border border-white/10 rounded-xl p-4 neu-inset-sm">
                                      <div className="flex items-start justify-between gap-3">
                                          <div>
                                              <div className="font-bold text-slate-900 dark:text-white text-sm">{job.userName || 'Unknown'}</div>
                                              <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold">{job.userEmail || job.userId}</div>
                                          </div>
                                          <div className="text-right">
                                              <div className={`inline-flex px-2 py-1 rounded text-[11px] font-bold uppercase ${getQueueStatusClass(job.displayStatus || job.status)}`}>{getQueueStatusLabel(job.displayStatus || job.status)}</div>
                                              {job.isStuck && <div className="text-[11px] text-orange-400 font-bold mt-1">{job.health?.label || 'STUCK'}</div>}
                                          </div>
                                      </div>
                                          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                                          <div><span className="text-slate-700 dark:text-slate-400 font-semibold">Job</span><div className="text-white font-mono mt-1">{job.id.slice(0, 12)}</div></div>
                                          <div><span className="text-slate-700 dark:text-slate-400 font-semibold">Stage</span><div className="text-white mt-1">{getQueueStageLabel(job.queueStage)}</div></div>
                                          <div><span className="text-slate-700 dark:text-slate-400 font-semibold">Loại</span><div className="text-white mt-1">{job.assetType === 'video' ? 'Video' : 'Ảnh'}</div></div>
                                          <div><span className="text-slate-700 dark:text-slate-400 font-semibold">Thiết bị</span><div className="text-white mt-1">{getQueuePlatformLabel(job.clientPlatform)}</div></div>
                                          <div><span className="text-slate-700 dark:text-slate-400 font-semibold">Cập nhật</span><div className="text-white mt-1">{getTimeAgo(job.updatedAt)}</div></div>
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
                                                  <span className="rounded neu-inset-sm px-1.5 py-0.5">lease: {job.health.leaseState || '-'}</span>
                                                  {typeof job.health.recoveries === 'number' && <span className="rounded neu-inset-sm px-1.5 py-0.5">recoveries: {job.health.recoveries}</span>}
                                                  {job.health.providerRisk && <span className="rounded neu-inset-sm px-1.5 py-0.5">provider-risk</span>}
                                                  {job.health.safeToRequeue && <span className="rounded neu-inset-sm px-1.5 py-0.5">safe-requeue</span>}
                                              </div>
                                          </div>
                                      )}
                                      <div className="mt-3 text-xs text-slate-300">{lastLogMessage}</div>
                                      {job.jobId && <div className="mt-1 text-[11px] text-audi-cyan">Provider ID: {job.jobId}</div>}
                                      <button onClick={() => handleOpenQueueJobDetail(job.id)} className="mt-3 w-full py-2 rounded-lg neu-inset-sm hover:bg-white/10 border border-white/10 text-slate-900 dark:text-white text-xs font-bold">
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
              <div className="space-y-6 animate-fade-in">
                  <div className="flex justify-between items-center neu-card p-6 rounded-3xl shadow-xl border border-slate-300 dark:border-slate-800">
                      <div>
                          <h2 className="text-xl font-black text-slate-950 dark:text-white font-accent uppercase tracking-wider flex items-center gap-2">
                              <Icons.ShoppingBag className="w-5 h-5 text-[#FF007F]" />
                              QUẢN LÝ GÓI NẠP VCOIN
                          </h2>
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-bold mt-1">Cấu hình giá bán, số Vcoin nhận được và nhãn khuyến mãi cho từng gói nạp</p>
                      </div>
                      <button onClick={() => setEditingPackage({id: `temp_${Date.now()}`, name: 'Gói Mới', vcoin: 100, price: 50000, currency: 'VND', bonusText: '', bonusPercent: 0, isPopular: false, isActive: true, displayOrder: packages.length, colorTheme: 'border-slate-600', transferContent: 'NAP 50K'})} className="neu-button-primary px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg hover:scale-105 transition-all">
                          <Icons.Plus className="w-4 h-4 text-white" /> Thêm Gói Nạp Mới
                      </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                      {packages.map((pkg, idx) => (
                          <div key={pkg.id} className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 flex items-center justify-between group hover:scale-[1.01] transition-all shadow-xl">
                              <div className="flex items-center gap-4">
                                  <div className="flex flex-col gap-1 pr-4 border-r border-slate-300 dark:border-slate-800">
                                      <button onClick={() => handleMovePackage(idx, -1)} disabled={idx === 0} className="p-1.5 neu-button rounded-xl text-slate-600 dark:text-slate-700 dark:text-slate-300 font-semibold disabled:opacity-30"><Icons.ArrowUp className="w-3.5 h-3.5" /></button>
                                      <button onClick={() => handleMovePackage(idx, 1)} disabled={idx === packages.length - 1} className="p-1.5 neu-button rounded-xl text-slate-600 dark:text-slate-700 dark:text-slate-300 font-semibold disabled:opacity-30"><Icons.ArrowUp className="w-3.5 h-3.5 rotate-180" /></button>
                                  </div>
                                  <div className="w-12 h-12 neu-inset-sm rounded-2xl flex items-center justify-center text-amber-500 shrink-0">
                                      <Icons.Gem className="w-6 h-6 text-amber-500" />
                                  </div>
                                  <div>
                                      <h4 className="font-black text-slate-950 dark:text-white flex items-center gap-2 text-base font-accent">
                                          {pkg.name} 
                                          {!pkg.isActive && <span className="text-[9px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full">ẨN</span>} 
                                          {pkg.isPopular && <span className="text-[9px] font-black bg-[#FF007F] text-white px-2 py-0.5 rounded-full">HOT</span>}
                                      </h4>
                                      <div className="flex gap-4 text-xs font-bold mt-1">
                                          <span className="text-emerald-600 dark:text-emerald-400 font-mono">{(pkg.price || 0).toLocaleString()}đ</span>
                                          <span className="text-amber-600 dark:text-amber-400 font-accent">{pkg.vcoin || 0} VCOIN</span>
                                          {pkg.bonusPercent > 0 && <span className="text-[#FF007F] font-black">+{pkg.bonusPercent}% Thưởng</span>}
                                      </div>
                                  </div>
                              </div>
                              <div className="flex gap-2">
                                  <button onClick={() => setEditingPackage({ id: pkg.id || '', name: pkg.name || '', price: pkg.price || 0, vcoin: pkg.vcoin || 0, bonusPercent: pkg.bonusPercent || 0, bonusText: pkg.bonusText || '', transferContent: pkg.transferContent || '', isPopular: !!pkg.isPopular, isActive: pkg.isActive !== false, colorTheme: pkg.colorTheme || 'border-slate-600', displayOrder: pkg.displayOrder || 0, currency: pkg.currency || 'VND' })} className="neu-button p-2.5 rounded-xl text-blue-600 dark:text-blue-400 hover:scale-105"><Icons.Settings className="w-4.5 h-4.5" /></button>
                                  <button onClick={() => handleDeletePackage(pkg.id)} className="neu-button p-2.5 rounded-xl text-red-500 hover:scale-105"><Icons.Trash className="w-4.5 h-4.5" /></button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {activeView === 'marketing' && (
              <div className="space-y-8 animate-fade-in">
                  {/* Promotion Section */}
                  <div className="space-y-5">
                      <div className="flex justify-between items-center neu-card p-6 rounded-3xl shadow-xl border border-slate-300 dark:border-slate-800">
                          <div>
                              <h2 className="text-xl font-black text-slate-950 dark:text-white font-accent uppercase tracking-wider flex items-center gap-2">
                                  <Icons.Zap className="w-5 h-5 text-amber-500" />
                                  CHIẾN DỊCH KHUYẾN MÃI VCOIN
                              </h2>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-bold mt-1">Cấu hình thời gian chạy sự kiện thưởng % Vcoin nạp cho toàn hệ thống</p>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={refreshData} className="neu-button p-3 rounded-2xl text-slate-700 dark:text-slate-300 hover:border-[#FF007F]" title="Làm mới danh sách"><Icons.Clock className="w-4.5 h-4.5 text-[#FF007F]" /></button>
                              <button onClick={() => setEditingPromotion({id: `temp_${Date.now()}`, name: '', marqueeText: '', bonusPercent: 10, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 86400000).toISOString(), isActive: true})} className="neu-button-primary px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg hover:scale-105 transition-all">
                                  <Icons.Plus className="w-4 h-4 text-white" /> Tạo Chiến Dịch Mới
                              </button>
                          </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                          {promotions.map(p => {
                              const now = new Date().getTime(); const start = new Date(p.startTime).getTime(); const end = new Date(p.endTime).getTime();
                              let statusBadge = <span className="text-slate-700 dark:text-slate-400 font-semibold text-xs font-black neu-inset-sm px-3 py-1 rounded-xl">ĐÃ DỪNG</span>;
                              if (p.isActive) { if (now < start) statusBadge = <span className="text-amber-500 text-xs font-black neu-inset-sm px-3 py-1 rounded-xl flex items-center gap-1"><Icons.Clock className="w-3 h-3" /> HẸN GIỜ</span>; else if (now > end) statusBadge = <span className="text-slate-700 dark:text-slate-400 font-semibold text-xs font-black neu-inset-sm px-3 py-1 rounded-xl">HẾT HẠN</span>; else statusBadge = <span className="text-emerald-500 text-xs font-black neu-inset-sm px-3 py-1 rounded-xl flex items-center gap-1 animate-pulse"><Icons.Zap className="w-3 h-3" /> ĐANG CHẠY</span>; } else { statusBadge = <span className="text-red-500 text-xs font-black neu-inset-sm px-3 py-1 rounded-xl">TẮT</span>; }
                              return (
                                  <div key={p.id} className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
                                      <div className="flex-1">
                                          <div className="flex justify-between items-start">
                                              <div>
                                                  <div className="font-black text-slate-950 dark:text-slate-900 dark:text-white text-lg font-accent">{p.name}</div>
                                                  <div className="text-[#FF007F] font-black text-sm">+{p.bonusPercent}% Vcoin Bonus Thưởng</div>
                                              </div>
                                              <div className="md:hidden">{statusBadge}</div>
                                          </div>
                                          <div className="text-xs font-mono mt-2 space-y-1 neu-inset-sm p-3 rounded-2xl border border-slate-300 dark:border-slate-800">
                                              <div className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-2"><Icons.Calendar className="w-3.5 h-3.5"/> Bắt đầu: {formatVietnamDateTimeDisplay(p.startTime)}</div>
                                              <div className="text-red-500 font-bold flex items-center gap-2"><Icons.Calendar className="w-3.5 h-3.5"/> Kết thúc: {formatVietnamDateTimeDisplay(p.endTime)}</div>
                                          </div>
                                      </div>
                                      <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-slate-300 dark:border-slate-800 pt-3 md:pt-0">
                                          <div className="hidden md:block">{statusBadge}</div>
                                          <div className="flex gap-2">
                                              <button onClick={() => setEditingPromotion(p)} className="neu-button p-2.5 rounded-xl text-blue-600 dark:text-blue-400 hover:scale-105"><Icons.Settings className="w-4.5 h-4.5" /></button>
                                              <button onClick={() => handleDeletePromotion(p.id)} className="neu-button p-2.5 rounded-xl text-red-500 hover:scale-105"><Icons.Trash className="w-4.5 h-4.5" /></button>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>

                  {/* Giftcode Section */}
                  <div className="space-y-6 pt-6 border-t border-slate-300 dark:border-slate-800">
                      <div className="flex justify-between items-center neu-card p-6 rounded-3xl shadow-xl border border-slate-300 dark:border-slate-800">
                          <div>
                              <h2 className="text-xl font-black text-slate-950 dark:text-white font-accent uppercase tracking-wider flex items-center gap-2">
                                  <Icons.Gift className="w-5 h-5 text-[#FF007F]" />
                                  QUẢN LÝ THƯỞNG GIFTCODE
                              </h2>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-bold mt-1">Tạo mã quà tặng Vcoin hoặc mã giảm giá nạp dành riêng cho các sự kiện</p>
                          </div>
                          <button onClick={() => setEditingGiftcode({id: `temp_${Date.now()}`, code: '', codeType: 'reward', campaignKey: '', reward: 10, discountPercent: 0, audience: 'all', assignedUserId: null, autoGeneratePerUser: false, totalLimit: 100, usedCount: 0, maxPerUser: 1, isActive: true})} className="neu-button-primary px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg hover:scale-105 transition-all">
                              <Icons.Plus className="w-4 h-4 text-white" /> Tạo Giftcode Mới
                          </button>
                      </div>
                      <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl mb-6 space-y-4">
                          <h3 className="font-black text-slate-950 dark:text-white mb-2 flex items-center gap-2 font-accent text-sm uppercase">
                              <Icons.Bell className="w-5 h-5 text-amber-500" /> CẤU HÌNH THÔNG BÁO SỰ KIỆN GIFTCODE
                          </h3>
                          <div className="space-y-4">
                              <input type="text" value={giftcodePromo.text} onChange={(e) => setGiftcodePromo({...giftcodePromo, text: e.target.value})} placeholder="Ví dụ: Nhập CODE 'HELLO2026' để nhận 20 Vcoin miễn phí" className="w-full neu-input rounded-2xl p-4 text-xs font-bold text-slate-900 dark:text-white focus:outline-none" />
                              <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2.5 cursor-pointer neu-inset-sm px-4 py-2.5 rounded-2xl">
                                      <input type="checkbox" checked={giftcodePromo.isActive} onChange={(e) => setGiftcodePromo({...giftcodePromo, isActive: e.target.checked})} className="accent-[#FF007F] w-4 h-4" />
                                      <span className="text-xs font-black text-slate-950 dark:text-white">Hiển thị thông báo này trên màn hình chính</span>
                                  </label>
                                  <button onClick={handleSaveGiftcodePromo} className="neu-button px-5 py-2.5 rounded-xl text-xs font-black text-[#FF007F] hover:scale-105 transition-all">Lưu Cấu Hình</button>
                              </div>
                          </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {giftcodes.map(code => (
                              <div key={code.id} className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4 shadow-sm relative overflow-hidden">
                                  <div className="flex justify-between items-start mb-3"><div><div className="font-mono font-bold text-slate-900 dark:text-white text-lg tracking-wider">{code.code}</div><div className="text-[10px] text-slate-700 dark:text-slate-300 font-semibold font-bold uppercase mt-1">Chiến dịch: {code.campaignKey || code.code}</div><div className="mt-1 flex flex-wrap gap-2"><span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${code.codeType === 'topup_discount' ? 'bg-audi-cyan/15 text-audi-cyan' : 'bg-audi-yellow/15 text-audi-yellow'}`}>{code.codeType === 'topup_discount' ? 'Giảm giá nạp' : 'Thưởng Vcoin'}</span><span className="text-audi-yellow font-bold text-sm">{code.codeType === 'topup_discount' ? `-${code.discountPercent || 0}%` : `+${code.reward} Vcoin`}</span></div></div>{code.isActive ? <span className="text-green-500 text-[10px] font-bold border border-green-500/20 px-2 py-1 rounded bg-green-500/10">ACTIVE</span> : <span className="text-red-500 text-[10px] font-bold border border-red-500/20 px-2 py-1 rounded bg-red-500/10">INACTIVE</span>}</div>
                                  <div className="mb-3"><div className="flex justify-between text-[10px] text-slate-700 dark:text-slate-400 font-semibold mb-1 font-bold uppercase"><span>Sử dụng</span><span>{code.usedCount}/{code.totalLimit}</span></div><div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, (code.usedCount / code.totalLimit) * 100)}%` }}></div></div></div>
                                  <div className="flex justify-between items-center border-t border-white/5 pt-3">
                                      <span className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold">Max: {code.maxPerUser}/người</span>
                                      <div className="flex gap-2">
                                          <button onClick={() => handleViewGiftcodeUsage(code)} className="p-1.5 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white transition-colors" title="Xem người dùng"><Icons.Users className="w-4 h-4" /></button>
                                          <button onClick={() => setEditingGiftcode(code)} className="p-1.5 neu-inset-sm px-2.5 py-1 rounded-lg text-sky-600 dark:text-sky-400 font-black font-accent rounded hover:bg-blue-500 hover:text-white transition-colors"><Icons.Settings className="w-4 h-4" /></button>
                                          <button onClick={() => handleDeleteGiftcode(code.id)} className="p-1.5 neu-inset-sm px-2.5 py-1 rounded-lg text-red-600 dark:text-red-400 font-black font-accent rounded hover:bg-red-500 hover:text-white transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}

           {/* ================= VIEW: PRICING ================= */}
           {activeView === 'pricing' && (
               <div className="space-y-6 animate-fade-in">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 neu-card p-6 rounded-3xl shadow-xl border border-slate-300 dark:border-slate-800">
                       <div>
                           <h2 className="text-xl font-black text-slate-950 dark:text-white font-accent uppercase tracking-wider flex items-center gap-2">
                               <Icons.Gem className="w-5 h-5 text-amber-500" />
                               BẢNG GIÁ DỊCH VỤ AI & ĐỒNG BỘ NGUỒN CUNG
                           </h2>
                           <p className="text-xs text-slate-700 dark:text-slate-300 font-bold mt-1">
                               Tùy chỉnh giá Vcoin tiêu thụ của từng mô hình AI render (Single/Couple Character, Video Motion, Tách nền...)
                           </p>
                       </div>
                       <div className="flex gap-2">
                           <button
                               onClick={async () => {
                                   try {
                                       clearTstCatalogCache();
                                       const [, providerCatalog] = await Promise.all([
                                           syncTSTPrices(),
                                           fetchProviderCatalog(true, true),
                                       ]);
                                       setGommoCatalog(providerCatalog);
                                       setGommoCatalogError('');
                                       await refreshData();
                                       showToast('Đã làm mới giá của hai nguồn theo thời gian thực.', 'success');
                                    } catch (error) {
                                       showToast('Lỗi khi làm mới bảng giá provider.', 'error');
                                   }
                               }}
                               className="neu-button px-4 py-2.5 rounded-xl text-xs font-black text-[#FF007F] flex items-center gap-2 hover:scale-105 transition-all"
                           >
                               <Icons.RefreshCw className="w-4 h-4 text-[#FF007F]" />
                               <span>Làm mới 2 provider</span>
                           </button>
                       </div>
                   </div>

                   <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
                       <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                           <div>
                           <div className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Provider, model và server theo từng chức năng</div>
                           <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-semibold">
                               Chọn API nào sẽ hiển thị model và server realtime của API đó. Trạng thái server được đồng bộ giữa giao diện và backend.
                           </p>
                           </div>
                           <div className="flex flex-wrap gap-2">
                               <button onClick={handleEnableAllPricingServers} className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold text-emerald-300">Bật toàn bộ máy chủ</button>
                               <button onClick={handleFastOnlyPricingServers} className="rounded-xl border border-audi-cyan/30 bg-audi-cyan/10 px-3 py-2 text-[10px] font-bold text-audi-cyan">Chỉ dùng FAST</button>
                               <button onClick={handleRestorePricingServersFromLive} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-bold text-slate-300">Khôi phục dữ liệu live</button>
                           </div>
                       </div>
                       <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                           {GENERATION_PROVIDER_ROUTE_OPTIONS.map((route) => {
                                const isVideoRoute = route.key === 'video_generation' || route.key === 'motion_control';
                                const providerOptions: GenerationProviderMode[] = isVideoRoute ? ['tst'] : ['gpti2', 'tst', 'gommo'];
                                const configuredPriority = providerPriorityByFeature[route.key] || [];
                                const defaultProvider = isVideoRoute
                                    ? 'tst'
                                    : (generationProviderByFeature[route.key] || DEFAULT_PROVIDER_BY_FEATURE[route.key] || generationProvider);
                                const featurePriority = [
                                    ...configuredPriority.filter((provider) => providerOptions.includes(provider)),
                                    ...(configuredPriority.length === 0 && providerOptions.includes(defaultProvider) ? [defaultProvider] : []),
                                    ...providerOptions.filter((provider) => !configuredPriority.includes(provider) && provider !== defaultProvider),
                                ];
                                const effectiveProvider = featurePriority[0];
                               const explicitModels = allowedModelsByFeature[route.key];
                               const effectiveAllowedModels = getAllowedModelsForFeature(
                                   { allowedModelsByFeature },
                                   route.key,
                               );
                               const modelOptions = featureModelOptions[route.key] || [];
                               const usesDefaultModels = !explicitModels;
                               const allowsAllModels = explicitModels?.includes('*') || (!explicitModels && !DEFAULT_ALLOWED_MODELS_BY_FEATURE[route.key]);
                               const providerModelOptions = modelOptions.filter((model) => effectiveProvider === 'gpti2'
                                   ? ['gpt-image-2', 'nano-banana-2', 'nano-banana-pro'].includes(model.id)
                                   : effectiveProvider === 'tst'
                                   ? pricingRows.some((row) => row.modelId.trim().toLowerCase() === model.id)
                                   : gommoCatalog?.models.some((entry) =>
                                       entry.auditionModelId.trim().toLowerCase() === model.id
                                       && entry.fallbackSupported
                                       && !['maintenance', 'off', 'disabled', 'inactive', 'unavailable'].includes(entry.status.toLowerCase()),
                                   ));
                               const visibleModelOptions = effectiveAllowedModels
                                   ? providerModelOptions.filter((model) => effectiveAllowedModels.includes(model.id))
                                   : providerModelOptions;
                               return (
                                   <div key={route.key} className="rounded-2xl border border-white/10 neu-inset-sm p-4">
                                       <div className="flex items-start justify-between gap-3">
                                           <div>
                                               <div className="text-sm font-bold text-slate-900 dark:text-white">{route.label}</div>
                                               <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">{route.description}</div>
                                           </div>
                                           <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${effectiveProvider === 'gommo' ? 'bg-violet-500/15 text-violet-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                                               {effectiveProvider === 'gpti2' ? 'API 1 · GPTi2' : effectiveProvider === 'tst' ? 'API 2 · TST' : 'API 3 · Gommo'}
                                           </span>
                                       </div>
                                        <div className="mt-3 rounded-xl border border-white/10 p-2">
                                            <div className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-500">Thứ tự ưu tiên (1 chạy trước)</div>
                                            <div className="space-y-1.5">
                                                {featurePriority.map((provider, index) => {
                                                    const disabled = switchingGenerationProvider || (provider === 'gommo' && !gommoCatalog?.configured);
                                                    const label = provider === 'gpti2' ? 'API 1 · GPTi2' : provider === 'tst' ? 'API 2 · TST' : 'API 3 · Gommo';
                                                    return (
                                                        <div key={`${route.key}_${provider}`} className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 ${index === 0 ? 'border-[#FF007F]/40 bg-[#FF007F]/10' : 'border-white/5'}`}>
                                                            <span className="text-[10px] font-black text-slate-800 dark:text-slate-200">{index + 1}. {label}</span>
                                                            <span className="flex gap-1">
                                                                <button type="button" title="Đưa lên" disabled={disabled || index === 0} onClick={() => handleMoveFeatureProvider(route.key, provider, -1)} className="rounded border border-white/10 px-2 py-1 text-[10px] disabled:opacity-30">↑</button>
                                                                <button type="button" title="Đưa xuống" disabled={disabled || index === featurePriority.length - 1} onClick={() => handleMoveFeatureProvider(route.key, provider, 1)} className="rounded border border-white/10 px-2 py-1 text-[10px] disabled:opacity-30">↓</button>
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                       <div className="mt-4 border-t border-white/10 pt-3">
                                           <div className="flex items-center justify-between gap-2">
                                               <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Model được phép</span>
                                               <span className="text-[9px] font-bold text-slate-500">
                                                   {effectiveAllowedModels ? `${effectiveAllowedModels.length} model` : 'Không giới hạn'}
                                               </span>
                                           </div>
                                           <div className="mt-2 flex flex-wrap gap-1.5">
                                               <button
                                                   type="button"
                                                   disabled={switchingGenerationProvider}
                                                   onClick={() => handleChangeFeatureAllowedModels(route.key, 'default')}
                                                   className={`rounded-lg border px-2 py-1.5 text-[9px] font-black uppercase transition-all disabled:opacity-40 ${usesDefaultModels ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300' : 'border-white/10 text-slate-500'}`}
                                               >
                                                   Mặc định
                                               </button>
                                               <button
                                                   type="button"
                                                   disabled={switchingGenerationProvider}
                                                   onClick={() => handleChangeFeatureAllowedModels(route.key, 'all')}
                                                   className={`rounded-lg border px-2 py-1.5 text-[9px] font-black uppercase transition-all disabled:opacity-40 ${allowsAllModels && !usesDefaultModels ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-slate-500'}`}
                                               >
                                                   Tất cả
                                               </button>
                                           </div>
                                           <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
                                               {providerModelOptions.map((model) => {
                                                   const checked = effectiveAllowedModels?.includes(model.id) ?? true;
                                                   return (
                                                       <label key={`${route.key}_${model.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 px-2 py-1.5 hover:border-white/15">
                                                           <input
                                                               type="checkbox"
                                                               checked={checked}
                                                               disabled={switchingGenerationProvider}
                                                               onChange={() => {
                                                                   const current = effectiveAllowedModels || providerModelOptions.map((entry) => entry.id);
                                                                   const next = checked
                                                                       ? current.filter((id) => id !== model.id)
                                                                       : [...current, model.id];
                                                                   handleChangeFeatureAllowedModels(route.key, next);
                                                               }}
                                                               className="h-3.5 w-3.5 accent-[#FF007F]"
                                                           />
                                                           <span className="min-w-0">
                                                               <span className="block truncate text-[10px] font-bold text-slate-700 dark:text-slate-200">{model.name}</span>
                                                               <span className="block truncate font-mono text-[8px] text-slate-500">{model.id}</span>
                                                           </span>
                                                       </label>
                                                   );
                                               })}
                                               {providerModelOptions.length === 0 && (
                                                   <div className="text-[10px] text-amber-500">Chưa có model live phù hợp với chức năng này.</div>
                                               )}
                                           </div>
                                       </div>
                                       <div className="mt-4 border-t border-white/10 pt-3">
                                           <div className="flex items-center justify-between gap-2">
                                               <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Server {effectiveProvider.toUpperCase()} realtime</span>
                                               <span className="text-[9px] font-bold text-slate-500">Dùng chung toàn hệ thống</span>
                                           </div>
                                           <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1">
                                               {visibleModelOptions.map((model) => {
                                                   const tstGroup = pricingServerGroups.find((group) => group.modelId.trim().toLowerCase() === model.id);
                                                   const gommoModel = gommoCatalog?.models.find((entry) => entry.auditionModelId.trim().toLowerCase() === model.id);
                                                   const serverOptions = effectiveProvider === 'gpti2'
                                                       ? [{ id: GPTI2_SERVER_ID, label: GPTI2_SERVER_LABEL, subtitle: 'Server mặc định của API GPTi2', modeTypes: [] as string[] }]
                                                       : effectiveProvider === 'tst'
                                                       ? (tstGroup?.servers || []).map((serverId) => ({
                                                           id: serverId,
                                                           label: tstServerToUi(serverId),
                                                           subtitle: '',
                                                           modeTypes: [] as string[],
                                                       }))
                                                       : gommoModel
                                                           ? getGommoServerGroups(gommoModel)
                                                           : [];
                                                   return (
                                                       <div key={`${route.key}_${effectiveProvider}_${model.id}_servers`} className="rounded-xl border border-white/5 p-2">
                                                           <div className="flex items-center justify-between gap-2">
                                                               <span className="truncate text-[10px] font-bold text-slate-200">{model.name}</span>
                                                               {effectiveProvider === 'gommo' && gommoModel && (
                                                                   <span className="text-[8px] font-black uppercase text-violet-300">{gommoModel.status || 'ON'}</span>
                                                               )}
                                                           </div>
                                                           <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                               {serverOptions.map((serverOption) => {
                                                                   const enabled = effectiveProvider === 'gpti2' ? true : isProviderServerEnabledForModel(serverAvailabilityConfig, effectiveProvider, model.id, serverOption.id);
                                                                   return (
                                                                       <button
                                                                           key={`${route.key}_${effectiveProvider}_${model.id}_${serverOption.id}`}
                                                                           type="button"
                                                                           title={serverOption.subtitle || serverOption.modeTypes.join(', ')}
                                                                           onClick={() => { if (effectiveProvider !== 'gpti2') handleToggleProviderServer(effectiveProvider, model.id, serverOption.id); }}
                                                                           className={`rounded-lg border px-2 py-1.5 text-[9px] font-black uppercase ${enabled ? 'border-audi-cyan/35 bg-audi-cyan/10 text-audi-cyan' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}
                                                                       >
                                                                           {serverOption.label} · {enabled ? 'Bật' : 'Khóa'}
                                                                       </button>
                                                                   );
                                                               })}
                                                               {serverOptions.length === 0 && (
                                                                   <span className="text-[9px] text-amber-500">API chưa trả server khả dụng cho model này.</span>
                                                               )}
                                                           </div>
                                                       </div>
                                                   );
                                               })}
                                               {visibleModelOptions.length === 0 && (
                                                   <div className="text-[10px] text-amber-500">Chưa có model được phép để hiển thị server.</div>
                                               )}
                                           </div>
                                       </div>
                                   </div>
                               );
                           })}
                       </div>
                   </div>

                   <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
                       <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                           <div>
                               <div className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Backup thông minh cho job tạo ảnh</div>
                               <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-semibold">
                                   Khi nguồn chính xác nhận job thất bại, hệ thống thử máy chủ khác đang bật của cùng model (ưu tiên FAST), rồi mới chuyển sang nguồn dự phòng. Không chuyển nguồn khi chỉ timeout hoặc mất kết nối mơ hồ để tránh tạo ảnh trùng; Vcoin chỉ trừ một lần.
                               </p>
                           </div>
                           <button
                               type="button"
                               disabled={switchingGenerationProvider}
                               onClick={handleToggleSmartProviderFallback}
                               className={`min-w-[190px] rounded-xl border px-4 py-3 text-xs font-black uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                                   smartProviderFallbackEnabled
                                       ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                                       : 'border-white/10 text-slate-400 hover:border-white/20'
                               }`}
                           >
                               {smartProviderFallbackEnabled ? 'Đang bật backup' : 'Đang tắt backup'}
                           </button>
                       </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4">
                          <div className="text-xs uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Cấu hình live</div>
                          <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{allPricingRows.length}</div>
                          <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-1">Bao gồm image, video, motion control, Grok và 3 tool Nano Banana 2.</div>
                      </div>
                      <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4">
                          <div className="text-xs uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Models</div>
                          <div className="mt-2 text-3xl font-bold text-audi-cyan">{new Set(allPricingRows.map(row => row.modelId)).size}</div>
                          <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-1">Nguồn live lấy trực tiếp từ catalog của API 1.</div>
                      </div>
                       <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4">
                           <div className="text-xs uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Quy đổi gốc</div>
                          <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                              1 Credit = 40đ. 1 Vcoin = 1000đ. Bạn có thể chỉnh giá AUDITION AI cao hơn hoặc thấp hơn tùy chiến lược lợi nhuận.
                           </div>
                       </div>
                       <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4">
                           <div className="text-xs uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">API 2 dự phòng</div>
                           <div className={`mt-2 text-2xl font-bold ${gommoCatalog?.configured ? 'text-emerald-400' : 'text-amber-400'}`}>
                               {gommoCatalog?.configured ? `${gommoCatalog.models.length} model` : 'Chưa cấu hình'}
                           </div>
                           <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-1">
                               {gommoCatalogError || (gommoCatalog?.vndPerCredit
                                   ? `Quy đổi ${gommoCatalog.vndPerCredit}đ / Credit.`
                                   : 'Giá realtime giữ nguyên đơn vị Credit; chưa giả định tỷ giá.')}
                           </div>
                       </div>
                  </div>

                  <div className="rounded-2xl border border-audi-yellow/25 bg-audi-yellow/10 p-4 text-sm text-audi-yellow">
                      <div className="font-black uppercase tracking-wider">Kling tính phí theo giây</div>
                      <div className="mt-1 text-xs leading-relaxed text-yellow-100/80">
                          Các model Kling Video và Kling/Motion Control dùng đơn vị <b>Vcoin/s</b>. Trong bảng bên dưới, ô AUDITION AI của các dòng này là giá mỗi giây, không phải giá trọn gói. Tổng phí người dùng trả = giá mỗi giây × số giây video.
                      </div>
                  </div>

                  <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4 md:p-5">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                              <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white">Lưu giá AUDITION AI</h3>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-1">
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

                  <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4 md:p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                              <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white">Combo Auto-Hide Đang Hoạt Động</h3>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-1">
                                  Tự động khóa tạm đúng combo model + tốc độ + server nếu có hơn 5 job timeout trong 5 giờ.
                              </p>
                          </div>
                          <span className="px-3 py-2 rounded-xl border border-white/10 neu-inset-sm text-xs font-bold text-slate-200">
                              {activeAutoDisabledCombos.length} combo
                          </span>
                      </div>

                      {activeAutoDisabledCombos.length === 0 ? (
                          <div className="rounded-2xl border border-white/10 neu-inset-sm p-4 text-sm text-slate-700 dark:text-slate-300 font-semibold">
                              Hiện chưa có combo nào đang bị auto-hide.
                          </div>
                      ) : (
                          <div className="space-y-3">
                              {activeAutoDisabledCombos.map((entry) => {
                                  const reopenKey = `${entry.modelId}::${entry.serverId}::${entry.speed}`;
                                  return (
                                      <div key={reopenKey} className="rounded-2xl border border-white/10 neu-inset-sm p-4">
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
                                                          <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">{item.label}</div>
                                                          <div className="mt-2 break-words text-sm font-bold text-slate-900 dark:text-white">{item.value}</div>
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

                  <div className="neu-card p-5 rounded-3xl shadow-2xl border border-slate-300 dark:border-slate-800 space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                              <h3 className="text-sm font-black text-slate-900 dark:text-white">Cấu hình giá Vcoin</h3>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                  Giá AUDITION AI dùng chung cho hai nguồn. Cấu hình tương thích của API 2 sẽ tự kế thừa giá hệ thống API 1; chỉ còn {missingPricingCount} cấu hình chưa có giá.
                              </p>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <div role="group" aria-label="Lọc theo nguồn API" className="grid grid-cols-3 gap-1 rounded-2xl neu-inset-sm p-1.5">
                                  <button type="button" aria-pressed={pricingProviderFilter === 'all'} onClick={() => setPricingProviderFilter('all')} className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${pricingProviderFilter === 'all' ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-600 dark:text-slate-300'}`}>
                                      Tất cả nguồn ({allPricingRows.length})
                                  </button>
                                  <button type="button" aria-pressed={pricingProviderFilter === 'tst'} onClick={() => setPricingProviderFilter('tst')} className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${pricingProviderFilter === 'tst' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-sky-600 dark:text-sky-300'}`}>
                                      TST ({tstPricingCount})
                                  </button>
                                  <button type="button" aria-pressed={pricingProviderFilter === 'gpti2'} onClick={() => setPricingProviderFilter('gpti2')} className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${pricingProviderFilter === 'gpti2' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20' : 'text-violet-600 dark:text-violet-300'}`}>
                                      GPTi2 ({gpti2PricingCount})
                                  </button>
                              </div>
                              <div role="group" aria-label="Lọc theo trạng thái giá" className="grid grid-cols-2 gap-1 rounded-2xl neu-inset-sm p-1.5">
                                  <button type="button" aria-pressed={pricingConfigFilter === 'all'} onClick={() => setPricingConfigFilter('all')} className={`rounded-xl px-4 py-2 text-xs font-black transition-all ${pricingConfigFilter === 'all' ? 'bg-[#FF007F] text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                                      Tất cả ({providerFilteredPricingRows.length})
                                  </button>
                                  <button type="button" aria-pressed={pricingConfigFilter === 'missing'} onClick={() => setPricingConfigFilter('missing')} className={`rounded-xl px-4 py-2 text-xs font-black transition-all ${pricingConfigFilter === 'missing' ? 'bg-amber-500 text-black' : 'text-amber-600 dark:text-amber-300'}`}>
                                      Chưa có giá ({providerMissingPricingCount})
                                  </button>
                              </div>
                          </div>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-300">
                              <thead className="text-xs text-slate-700 dark:text-slate-300 font-semibold uppercase neu-inset-sm border-b border-white/10">
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
                                       <th className="px-4 py-3 font-bold text-right">TST VNĐ (45đ/Credit)</th>
                                       <th className="px-4 py-3 font-bold text-right">AUDITION AI</th>
                                      <th className="px-4 py-3 font-bold text-right">Lãi Gộp</th>
                                      <th className="px-4 py-3 font-bold">Config Key</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                  {filteredPricingRows.length === 0 ? (
                                      <tr>
                                           <td colSpan={15} className="px-4 py-8 text-center text-slate-700 dark:text-slate-400 font-semibold">
                                              Không có cấu hình giá phù hợp với bộ lọc đang chọn.
                                          </td>
                                      </tr>
                                  ) : (
                                      filteredPricingRows.map((row) => {
                                          const typeLabel = row.type === 'image'
                                              ? 'Ảnh'
                                              : row.type === 'video'
                                                  ? 'Video'
                                                  : row.type === 'motion-control'
                                                      ? 'Motion'
                                                      : 'Edit';
                                          const draftKey = getPricingLookupKey(row.modelId, row.configKey);
                                          const effectivePricing = getEffectiveAuditionPricing(row);
                                          const rowIsDirty = isPricingRowDirty(row);
                                           const auditionPrice = getDraftAuditionPrice(row);
                                           const grossProfit = Number.isFinite(auditionPrice) ? auditionPrice - row.vcoin : 0;
                                           const providerCostKnown = row.server !== 'gommo' || row.vcoin > 0;
                                           const gommo = getGommoPriceComparison(row, gommoCatalog);

                                          return (
                                              <tr key={`${row.modelId}_${row.configKey}`} className="hover:neu-inset-sm transition-colors">
                                                  <td className="px-4 py-3">
                                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full neu-inset-sm border border-white/10 text-[10px] font-bold uppercase tracking-wider">
                                                          {typeLabel}
                                                      </span>
                                                  </td>
                                                  <td className="px-4 py-3">
                                                      <div className="font-bold text-slate-900 dark:text-white">{row.modelName}</div>
                                                      <div className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold font-mono mt-1">{row.modelId}</div>
                                                  </td>
                                                  <td className="px-4 py-3 text-white">
                                                      <div className="flex items-center gap-2">
                                                          <span>{row.server === 'gommo' ? row.providerServerLabel || 'AI Gateway' : tstServerToUi(row.server) || '-'}</span>
                                                          {!isProviderServerEnabledForModel(
                                                              serverAvailabilityConfig,
                                                              row.server === 'gommo' ? 'gommo' : 'tst',
                                                              row.modelId,
                                                              row.server === 'gommo' ? row.providerServerId : row.server,
                                                          ) && (
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
                                                  <td className="px-4 py-3 text-white">{row.server === 'gommo' ? row.providerModeLabel || row.speed || '-' : tstSpeedToUi(row.speed) || '-'}</td>
                                                  <td className="px-4 py-3 text-center text-white">{row.audio ? 'Có' : '-'}</td>
                                                   <td className="px-4 py-3 text-right font-mono text-audi-cyan">{row.type === 'edit' ? '-' : row.credits}</td>
                                                   <td className="px-4 py-3 text-right font-mono text-slate-200">
                                                      {row.type === 'edit' || row.server === 'gommo'
                                                          ? '-'
                                                          : row.billingUnit === 'second'
                                                              ? `${row.credits * 45} đ/s`
                                                           : `${row.credits * 45} đ`}
                                                   </td>
                                                   <td className="px-4 py-3">
                                                      <div className="flex items-center justify-end gap-2">
                                                          <input
                                                              type="number"
                                                              min="1"
                                                              value={pricingDrafts[draftKey] ?? effectivePricing?.vcoin ?? row.defaultAuditionVcoin ?? ''}
                                                              onChange={(e) =>
                                                                  setPricingDrafts((prev) => ({
                                                                      ...prev,
                                                                      [draftKey]: e.target.value
                                                                  }))
                                                              }
                                                              className={`w-24 neu-inset-sm border rounded-lg px-3 py-2 text-right text-white font-mono focus:outline-none focus:ring-2 ${
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
                                                      {effectivePricing?.inherited && !rowIsDirty && (
                                                          <div className="mt-1 text-right text-[10px] font-semibold text-cyan-600 dark:text-cyan-300">
                                                              Kế thừa giá hệ thống từ {effectivePricing.source.option_id}
                                                          </div>
                                                      )}
                                                      {row.billingUnit === 'second' && (
                                                          <div className="mt-1 text-right text-[10px] text-slate-700 dark:text-slate-400 font-semibold">
                                                              Ví dụ: 5s = {(Number(pricingDrafts[draftKey] ?? effectivePricing?.vcoin ?? row.defaultAuditionVcoin ?? row.vcoin) || 0) * 5} VC
                                                          </div>
                                                      )}
                                                  </td>
                                                  <td className={`px-4 py-3 text-right font-mono font-bold ${!providerCostKnown ? 'text-slate-500' : grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                      {providerCostKnown ? `${grossProfit >= 0 ? '+' : ''}${grossProfit} ${row.billingUnit === 'second' ? 'VC/s' : 'VC'}` : '-'}
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
                      <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Quản Lý Style Mẫu</h2>
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
                          <div key={style.id} className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-4 relative overflow-hidden group hover:border-white/30 transition-all">
                              <div className="aspect-[3/4] w-full neu-inset-sm rounded-xl mb-4 overflow-hidden relative">
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
                                      <h3 className="font-bold text-slate-900 dark:text-white text-lg">{style.name}</h3>
                                      <p className="text-xs text-slate-700 dark:text-slate-400 font-semibold font-mono truncate max-w-[200px]">{style.trigger_prompt || 'No prompt'}</p>
                                  </div>
                                  <div className="flex gap-2">
                                      <button onClick={() => setEditingStyle(style)} className="p-2 neu-inset-sm px-2.5 py-1 rounded-lg text-sky-600 dark:text-sky-400 font-black font-accent rounded hover:bg-blue-500 hover:text-white transition-colors"><Icons.Settings className="w-4 h-4" /></button>
                                      <button onClick={() => showConfirm('Xóa style này?', async () => { await deleteStylePreset(style.id); refreshData(); showToast('Đã xóa style'); })} className="p-2 neu-inset-sm px-2.5 py-1 rounded-lg text-red-600 dark:text-red-400 font-black font-accent rounded hover:bg-red-500 hover:text-white transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                      
                      {stylePresets.length === 0 && (
                          <div className="col-span-full py-12 text-center text-slate-700 dark:text-slate-400 font-semibold italic border border-dashed border-white/10 rounded-2xl">
                              Chưa có style mẫu nào. Hãy thêm mới!
                          </div>
                      )}
                  </div>
              </div>
           )}

           {/* ================= VIEW: TOURS ================= */}
           {activeView === 'tours' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-5 shadow-xl">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                              <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                  <Icons.Info className="w-5 h-5 text-audi-cyan" />
                                  Hướng Dẫn Ứng Dụng
                              </h2>
                              <p className="mt-1 text-xs text-slate-700 dark:text-slate-300 font-semibold">Tạo tour riêng cho máy tính và điện thoại, theo từng màn hình hoặc từng công cụ.</p>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={handleAddTour} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-900 dark:text-white text-xs font-bold">Thêm tour</button>
                              <button onClick={handleSaveAppTours} className="px-5 py-2 rounded-xl bg-audi-cyan hover:bg-cyan-300 text-black text-xs font-black">Lưu cấu hình</button>
                          </div>
                      </div>
                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                          <label className="rounded-2xl border border-white/10 neu-inset-sm p-4">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Trạng thái</span>
                              <select value={appTours.isActive ? 'on' : 'off'} onChange={(e) => setAppTours((c) => ({ ...c, isActive: e.target.value === 'on' }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#090914] px-3 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none">
                                  <option value="on">Bật toàn bộ</option>
                                  <option value="off">Tắt toàn bộ</option>
                              </select>
                          </label>
                          <label className="rounded-2xl border border-white/10 neu-inset-sm p-4">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Tần suất</span>
                              <select value={appTours.showFrequency} onChange={(e) => setAppTours((c) => ({ ...c, showFrequency: e.target.value as AppToursConfig['showFrequency'] }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#090914] px-3 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none">
                                  <option value="daily">Mỗi ngày một lần</option>
                                  <option value="once">Chỉ một lần</option>
                                  <option value="always">Luôn hiển thị</option>
                              </select>
                          </label>
                          <div className="rounded-2xl border border-white/10 neu-inset-sm p-4">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Tổng tour</span>
                              <div className="mt-2 text-3xl font-game font-bold text-slate-900 dark:text-white">{appTours.tours.length}</div>
                          </div>
                      </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
                      <div className="space-y-3">
                          {appTours.tours.map((tour) => (
                              <button key={tour.id} onClick={() => setSelectedTourId(tour.id)} className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedTour?.id === tour.id ? 'border-audi-cyan bg-audi-cyan/10' : 'neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl hover:border-white/20'}`}>
                                  <div className="flex items-center justify-between gap-3">
                                      <span className="text-sm font-black text-slate-900 dark:text-white">{tour.title}</span>
                                      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${tour.surface === 'mobile' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-cyan-500/15 text-cyan-300'}`}>{tour.surface}</span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-700 dark:text-slate-400 font-semibold">
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
                              <div className="rounded-2xl border neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-5">
                                  <div className="grid gap-4 md:grid-cols-2">
                                      <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Tên tour</span><input value={selectedTour.title} onChange={(e) => updateAppTour(selectedTour.id, (t) => ({ ...t, title: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                      <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Màn hình</span><input value={selectedTour.screen} onChange={(e) => updateAppTour(selectedTour.id, (t) => ({ ...t, screen: e.target.value.trim() || 'global' }))} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                      <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Giao diện</span><select value={selectedTour.surface} onChange={(e) => updateAppTour(selectedTour.id, (t) => ({ ...t, surface: e.target.value as AppTourDefinition['surface'] }))} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan"><option value="desktop">Máy tính</option><option value="mobile">Điện thoại</option></select></label>
                                      <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Feature ID</span><input value={selectedTour.featureId || ''} placeholder="Ví dụ: ai_image_tool, video_ai_gen" onChange={(e) => updateAppTour(selectedTour.id, (t) => ({ ...t, featureId: e.target.value.trim() || undefined }))} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                  </div>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                      <button onClick={() => updateAppTour(selectedTour.id, (t) => ({ ...t, isActive: !t.isActive }))} className={`px-4 py-2 rounded-xl text-xs font-bold ${selectedTour.isActive ? 'bg-green-500/15 text-green-300' : 'bg-white/10 text-slate-300'}`}>{selectedTour.isActive ? 'Tour đang bật' : 'Tour đang tắt'}</button>
                                      <button onClick={() => handleDuplicateTour(selectedTour)} className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-slate-900 dark:text-white hover:bg-white/15">Nhân bản</button>
                                      <button onClick={() => handleAddTourStep(selectedTour.id)} className="px-4 py-2 rounded-xl bg-audi-purple text-xs font-bold text-slate-900 dark:text-white hover:bg-purple-600">Thêm bước</button>
                                      <button onClick={() => setAllTourStepsCollapsed(orderedTourSteps, true)} className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-slate-900 dark:text-white hover:bg-white/15">Thu gọn tất cả</button>
                                      <button onClick={() => setAllTourStepsCollapsed(orderedTourSteps, false)} className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-slate-900 dark:text-white hover:bg-white/15">Mở tất cả</button>
                                      <button onClick={() => handleDeleteTour(selectedTour.id)} className="ml-auto px-4 py-2 rounded-xl bg-red-500/15 text-xs font-bold text-red-300 hover:bg-red-500/25">Xóa tour</button>
                                  </div>
                              </div>

                              <div className="space-y-3">
                              {orderedTourSteps.map((step, index) => {
                                  const isStepCollapsed = collapsedTourStepIds.includes(step.id);
                                  return (
                                  <div
                                      key={step.id}
                                      onDragOver={(event) => {
                                          event.preventDefault();
                                          event.dataTransfer.dropEffect = 'move';
                                      }}
                                      onDrop={(event) => {
                                          event.preventDefault();
                                          const draggedStepId = event.dataTransfer.getData('text/plain') || draggingTourStepId;
                                          if (draggedStepId) reorderAppTourSteps(selectedTour.id, draggedStepId, step.id);
                                          setDraggingTourStepId(null);
                                      }}
                                      onDragEnd={() => setDraggingTourStepId(null)}
                                      className={`rounded-2xl border bg-[#12121a] p-5 transition-all ${draggingTourStepId === step.id ? 'border-audi-cyan opacity-60 scale-[0.99]' : 'border-white/10 hover:border-white/20'}`}
                                  >
                                      <div className="mb-4 flex items-center justify-between">
                                          <div className="flex min-w-0 items-center gap-2">
                                              <button
                                                  type="button"
                                                  draggable
                                                  onDragStart={(event) => {
                                                      setDraggingTourStepId(step.id);
                                                      event.dataTransfer.effectAllowed = 'move';
                                                      event.dataTransfer.setData('text/plain', step.id);
                                                  }}
                                                  onDragEnd={() => setDraggingTourStepId(null)}
                                                  className="grid h-8 w-8 cursor-grab place-items-center rounded-xl border border-white/10 neu-inset-sm text-slate-700 dark:text-slate-300 font-semibold active:cursor-grabbing"
                                                  title="Kéo để sắp xếp bước"
                                              >
                                                  <Icons.Menu className="h-4 w-4" />
                                              </button>
                                              <span className="grid h-8 w-8 place-items-center rounded-full bg-audi-cyan text-sm font-black text-black">{index + 1}</span>
                                              <span className="truncate text-sm font-black text-slate-900 dark:text-white">{step.title}</span>
                                          </div>
                                          <div className="flex shrink-0 items-center gap-2">
                                              <button onClick={() => toggleCollapsedTourStep(step.id)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/15">{isStepCollapsed ? 'Mở' : 'Thu gọn'}</button>
                                              <button onClick={() => handleDeleteTourStep(selectedTour.id, step.id)} className="text-xs font-bold text-red-300 hover:text-red-200">Xóa bước</button>
                                          </div>
                                      </div>
                                      {!isStepCollapsed && (
                                      <>
                                      <div className="grid gap-4 md:grid-cols-2">
                                          <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Vùng khoanh</span><select value={step.targetId} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, targetId: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan">{getTourTargetOptions(selectedTour).map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
                                          <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Vị trí hộp</span><select value={step.placement || 'auto'} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, placement: e.target.value as AppTourStep['placement'] }))} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan"><option value="auto">Tự động</option><option value="top">Trên</option><option value="right">Phải</option><option value="bottom">Dưới</option><option value="left">Trái</option></select></label>
                                          <div className="md:col-span-2 rounded-2xl border border-audi-cyan/20 bg-audi-cyan/5 p-4">
                                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                  <div>
                                                      <div className="text-sm font-black text-slate-900 dark:text-white">{getTourTargetMeta(step.targetId)?.label || 'Chưa chọn vùng khoanh'}</div>
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
                                          <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Tiêu đề</span><input value={step.title} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, title: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                          <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Thứ tự</span><input type="number" value={step.order || index + 1} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, order: Number(e.target.value) || index + 1 }))} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-audi-cyan" /></label>
                                          <label className="md:col-span-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold">Nội dung hướng dẫn</span><textarea value={step.description} onChange={(e) => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, description: e.target.value }))} rows={3} className="mt-2 w-full rounded-xl border border-white/10 neu-inset-sm px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-audi-cyan" /></label>
                                      </div>
                                      <button onClick={() => updateAppTourStep(selectedTour.id, step.id, (s) => ({ ...s, isActive: s.isActive === false }))} className={`mt-4 rounded-xl px-4 py-2 text-xs font-bold ${step.isActive === false ? 'bg-white/10 text-slate-300' : 'bg-green-500/15 text-green-300'}`}>{step.isActive === false ? 'Bước đang tắt' : 'Bước đang bật'}</button>
                                      </>
                                      )}
                                  </div>
                              );
                              })}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
           )}

           {/* ================= VIEW: SYSTEM ================= */}
           {activeView === 'system' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Hệ Thống</h2>
                      <button onClick={() => runSystemChecks(undefined)} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Icons.Rocket className="w-4 h-4" /> <span className="hidden md:inline">Quét Ngay</span>
                      </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Health Cards */}
                      <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Grok AI Engine</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-700 dark:text-slate-300 font-semibold">Kết nối</span>
                              <StatusBadge status={health.gemini.status} latency={health.gemini.latency} />
                          </div>
                      </div>

                      <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Database</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-700 dark:text-slate-300 font-semibold">Trạng thái</span>
                              <StatusBadge status={health.supabase.status} latency={health.supabase.latency} />
                          </div>
                      </div>

                      <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Cloud Storage</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-700 dark:text-slate-300 font-semibold">Loại: {health.storage.type}</span>
                              <StatusBadge status={health.storage.status} />
                          </div>
                      </div>
                  </div>

                  {/* Tutorial Video Configuration */}
                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
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
                                  className="w-5 h-5 rounded border-white/20 neu-inset-sm text-audi-pink focus:ring-audi-pink focus:ring-offset-gray-900"
                              />
                              <label htmlFor="tutorialVideoToggle" className="text-slate-900 dark:text-white font-medium">Hiển thị video hướng dẫn</label>
                          </div>
                          <div>
                              <label className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1 block">Link Video YouTube (URL)</label>
                              <input 
                                  type="text"
                                  value={tutorialVideo.url} 
                                  onChange={e => setTutorialVideo({...tutorialVideo, url: e.target.value})} 
                                  className="w-full neu-inset-sm border border-white/10 rounded-lg p-3 text-white"
                                  placeholder="Ví dụ: https://www.youtube.com/watch?v=ba2WR8txe_c"
                              />
                              <p className="text-xs text-slate-700 dark:text-slate-400 font-semibold mt-2">
                                  Hỗ trợ các định dạng link: youtube.com/watch?v=..., youtu.be/..., youtube.com/embed/...
                              </p>
                          </div>
                      </div>
                  </div>

                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
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
                              <label className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1 block">Link VD Ảnh Nhân Vật</label>
                              <input
                                  type="text"
                                  value={generationGuideImages.characterUrl}
                                  onChange={(e) => setGenerationGuideImages({ ...generationGuideImages, characterUrl: e.target.value })}
                                  className="w-full neu-inset-sm border border-white/10 rounded-lg p-3 text-white"
                                  placeholder="https://..."
                              />
                              <p className="text-xs text-slate-700 dark:text-slate-400 font-semibold mt-2">
                                  Ảnh mẫu dùng cho nút "VD Ảnh NV" ở desktop và mobile.
                              </p>
                          </div>
                          <div>
                              <label className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1 block">Link VD Ảnh Mẫu</label>
                              <input
                                  type="text"
                                  value={generationGuideImages.sampleUrl}
                                  onChange={(e) => setGenerationGuideImages({ ...generationGuideImages, sampleUrl: e.target.value })}
                                  className="w-full neu-inset-sm border border-white/10 rounded-lg p-3 text-white"
                                  placeholder="https://..."
                              />
                              <p className="text-xs text-slate-700 dark:text-slate-400 font-semibold mt-2">
                                  Ảnh mẫu dùng cho nút "VD Ảnh Mẫu" để người dùng xem bố cục mẫu phù hợp.
                              </p>
                          </div>
                      </div>
                  </div>

                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
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
                          <label className="flex items-center gap-3 text-sm font-bold text-slate-900 dark:text-white">
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
                                  <label className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1 block">Tiêu đề</label>
                                  <input
                                      type="text"
                                      value={systemAnnouncement.title}
                                      onChange={(e) => setSystemAnnouncement({ ...systemAnnouncement, title: e.target.value })}
                                      className="w-full neu-inset-sm border border-white/10 rounded-lg p-3 text-white"
                                      placeholder="Thông báo từ AUDITION AI"
                                  />
                              </div>
                              <div>
                                  <label className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1 block">Kiểu hiển thị</label>
                                  <select
                                      value={systemAnnouncement.variant}
                                      onChange={(e) => setSystemAnnouncement({ ...systemAnnouncement, variant: e.target.value as SystemAnnouncementConfig['variant'] })}
                                      className="w-full neu-inset-sm border border-white/10 rounded-lg p-3 text-white"
                                  >
                                      <option value="info">Thông tin</option>
                                      <option value="promo">Khuyến mại</option>
                                      <option value="warning">Cảnh báo</option>
                                  </select>
                              </div>
                          </div>

                          <div>
                              <label className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1 block">Nội dung</label>
                              <textarea
                                  value={systemAnnouncement.message}
                                  onChange={(e) => setSystemAnnouncement({ ...systemAnnouncement, message: e.target.value })}
                                  className="w-full min-h-[120px] neu-inset-sm border border-white/10 rounded-lg p-3 text-white leading-relaxed"
                                  placeholder="Nhập nội dung thông báo sẽ hiển thị cho người dùng..."
                              />
                              <p className="text-xs text-slate-700 dark:text-slate-400 font-semibold mt-2">
                                  Người dùng đóng thông báo thì thông báo sẽ ẩn trong phiên hiện tại. Tải lại ứng dụng sẽ hiển thị lại nếu cấu hình đang bật.
                              </p>
                          </div>
                      </div>
                  </div>

                  {/* Payment Gateway Configuration */}
                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
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
                                              : 'border-white/10 neu-inset-sm hover:border-white/25'
                                      }`}
                                  >
                                      <div className="flex items-center justify-between gap-3">
                                          <div className="font-black text-slate-900 dark:text-white">{gatewayOption.title}</div>
                                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                                              active ? 'bg-emerald-400 text-black' : 'bg-white/10 text-slate-700 dark:text-slate-300 font-semibold'
                                          }`}>
                                              {active ? 'Đang bật' : 'Tắt'}
                                          </span>
                                      </div>
                                      <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-semibold">{gatewayOption.desc}</p>
                                  </button>
                              );
                          })}
                      </div>

                      <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs leading-relaxed text-yellow-100">
                          SePay cần cấu hình <code>SEPAY_MERCHANT_ID</code>, <code>SEPAY_SECRET_KEY</code> và <code>SEPAY_API_TOKEN</code> trên Netlify/Render để checkout, webhook và đối soát tự động hoạt động.
                      </div>
                  </div>

                  {/* Maintenance Mode Configuration */}
                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
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
                              className="px-4 py-2 bg-red-500 text-slate-900 dark:text-white font-bold rounded-lg text-sm hover:bg-red-600 transition-colors"
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
                                  className="w-5 h-5 rounded border-white/20 neu-inset-sm text-red-500 focus:ring-red-500 focus:ring-offset-gray-900"
                              />
                              <label htmlFor="maintenanceToggle" className="text-slate-900 dark:text-white font-medium">Bật chế độ bảo trì</label>
                          </div>
                          <div>
                              <label className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1 block">Thông báo bảo trì</label>
                              <textarea 
                                  value={maintenanceMode.message} 
                                  onChange={e => setMaintenanceMode({...maintenanceMode, message: e.target.value})} 
                                  className="w-full neu-inset-sm border border-white/10 rounded-lg p-3 text-white h-24 resize-none"
                                  placeholder="Hệ thống đang bảo trì, vui lòng quay lại sau."
                              />
                          </div>
                      </div>
                  </div>

                  {/* Feature Maintenance Configuration */}
                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
                      <div className="flex justify-between items-center mb-4">
                          <div>
                              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                  <Icons.Lock className="w-5 h-5 text-yellow-400" />
                                  Bảo trì từng chức năng
                              </h3>
                              <p className="text-xs text-slate-700 dark:text-slate-400 font-semibold mt-1">
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
                          <label className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1 block">Thông báo khi người dùng mở chức năng đang bảo trì</label>
                          <input
                              type="text"
                              value={featureMaintenance.message || ''}
                              onChange={(e) => setFeatureMaintenance((current) => ({ ...current, message: e.target.value }))}
                              className="w-full neu-inset-sm border border-white/10 rounded-lg p-3 text-white"
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
                                              : 'border-white/10 neu-inset-sm hover:border-white/25'
                                      }`}
                                  >
                                      <div className="flex items-start justify-between gap-3">
                                          <div>
                                              <div className="font-black text-slate-900 dark:text-white">{feature.name.vi}</div>
                                              <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-700 dark:text-slate-400 font-semibold">{feature.id}</div>
                                          </div>
                                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                                              isLocked ? 'bg-yellow-400 text-black' : 'bg-emerald-500/15 text-emerald-300'
                                          }`}>
                                              {isLocked ? 'Bảo trì' : 'Đang mở'}
                                          </span>
                                      </div>
                                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-semibold">{feature.description.vi}</p>
                                  </button>
                              );
                          })}
                      </div>
                  </div>

                  {/* API Key Configuration */}
                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Lock className="w-5 h-5 text-audi-pink" />
                          Cấu hình xAI Grok API Key
                      </h3>
                      <div className="space-y-4">
                          <div>
                              <div className="flex justify-between items-end mb-2">
                                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase">Grok API Key</label>
                                  <div className="flex items-center gap-2">
                                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                                          keyStatus === 'valid' ? 'bg-green-500/20 text-green-400' :
                                          keyStatus === 'invalid' ? 'bg-red-500/20 text-red-400' :
                                          keyStatus === 'checking' ? 'bg-yellow-500/20 text-yellow-400' :
                                          'bg-white/10 text-slate-700 dark:text-slate-300 font-semibold'
                                      }`}>
                                          {keyStatus === 'valid' ? 'VALID' :
                                           keyStatus === 'invalid' ? 'INVALID' :
                                           keyStatus === 'checking' ? 'CHECKING...' : 'IDLE'}
                                      </span>
                                  </div>
                              </div>
                              <div className="flex gap-2 relative">
                                  <div className="flex-1 relative">
                                      <input 
                                          type={showKey ? "text" : "password"}
                                          value={apiKey}
                                          onChange={(e) => {
                                              setApiKey(e.target.value);
                                              setKeyStatus('unknown');
                                          }}
                                          placeholder='xai-...'
                                          className="w-full neu-inset-sm border border-white/10 rounded-lg p-3 text-white font-mono text-sm pr-12"
                                      />
                                      <button 
                                        onClick={() => setShowKey(!showKey)} 
                                        className="absolute right-3 top-3 text-slate-700 dark:text-slate-400 font-semibold hover:text-white hidden md:block"
                                        title="Hiện/Ẩn Key"
                                      >
                                          {showKey ? <Icons.Eye className="w-5 h-5" /> : <Icons.Lock className="w-5 h-5" />}
                                      </button>
                                  </div>
                                  <button onClick={handleSaveApiKey} disabled={keyStatus === 'checking'} className="px-6 py-3 bg-audi-pink text-slate-900 dark:text-white font-bold rounded-lg hover:bg-pink-600 disabled:opacity-50 text-sm whitespace-nowrap">
                                      {keyStatus === 'checking' ? <Icons.Loader className="animate-spin w-5 h-5"/> : 'Thêm Key'}
                                  </button>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-400 font-semibold mt-2">
                                  Key sẽ được lưu vào Database. Hệ thống sẽ tự động xoay vòng ngẫu nhiên giữa các key đang hoạt động để tránh quá tải.
                              </p>
                          </div>
                      </div>
                  </div>

                  {/* List of Keys in DB */}
                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Database className="w-5 h-5 text-audi-cyan" />
                          Danh sách Service Account trong Database
                      </h3>
                      
                      <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300 font-semibold">
                              <thead className="neu-raised-sm text-xs font-black text-slate-950 dark:text-white uppercase font-accent border-b border-slate-300 dark:border-slate-700">
                                  <tr>
                                      <th className="px-4 py-3 w-24">Loại</th>
                                      <th className="px-4 py-3">Tên / ID</th>
                                      <th className="px-4 py-3">Key Value</th>
                                      <th className="px-4 py-3">Trạng thái</th>
                                      <th className="px-4 py-3">Ngày tạo</th>
                                      <th className="px-4 py-3 text-right">Thao tác</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                  {dbKeys.length === 0 ? (
                                      <tr><td colSpan={6} className="text-center py-6 text-slate-700 dark:text-slate-400 font-semibold">Chưa tìm thấy key nào trong database.</td></tr>
                                  ) : dbKeys.map((k) => {
                                      const isPro = k.name?.includes('[PRO]');
                                      const displayName = k.name?.replace('[PRO]', '').replace('[FLASH]', '').trim() || 'Unnamed Key';
                                      
                                      return (
                                      <tr key={k.id} className="hover:neu-inset-sm">
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
                                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                              <div className="text-sm">{displayName}</div>
                                              <div className="text-[10px] text-slate-600 font-mono">{k.id.substring(0,8)}...</div>
                                          </td>
                                          <td className="px-4 py-3 font-mono text-xs">
                                              {k.key_value ? `${k.key_value.substring(0, 8)}...${k.key_value.substring(k.key_value.length - 6)}` : 'N/A'}
                                          </td>
                                          <td className="px-4 py-3">
                                              <span className={`text-[10px] font-bold px-2 py-1 rounded border ${k.status === 'active' ? 'bg-green-500/20 text-green-500 border-green-500/50' : 'bg-slate-500/20 text-slate-700 dark:text-slate-400 font-semibold border-slate-500/50'}`}>
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
                              <div className="text-center py-4 text-slate-700 dark:text-slate-400 font-semibold text-sm">Chưa có key.</div>
                          ) : dbKeys.map((k) => {
                              const isPro = k.name?.includes('[PRO]');
                              const displayName = k.name?.replace('[PRO]', '').replace('[FLASH]', '').trim() || 'Unnamed Key';
                              
                              return (
                              <div key={k.id} className="neu-inset-sm rounded-xl p-4 border border-white/5 relative overflow-hidden">
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
                                          <div className="font-bold text-slate-900 dark:text-white text-sm">{displayName}</div>
                                          <div className="font-mono text-[10px] text-slate-700 dark:text-slate-400 font-semibold">{k.id}</div>
                                      </div>
                                      <span className={`text-[10px] font-bold px-2 py-1 rounded border ${k.status === 'active' ? 'bg-green-500/20 text-green-500 border-green-500/50' : 'bg-slate-500/20 text-slate-700 dark:text-slate-400 font-semibold border-slate-500/50'}`}>
                                          {k.status?.toUpperCase()}
                                      </span>
                                  </div>
                                  <div className="font-mono text-xs text-slate-300 break-all mb-3 neu-inset-sm p-2 rounded">
                                      {k.key_value ? `${k.key_value.substring(0, 15)}...` : 'N/A'}
                                  </div>
                                  <div className="flex justify-between items-center mt-3 border-t border-white/5 pt-3">
                                      <span className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold">{new Date(k.created_at).toLocaleDateString()}</span>
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
                  <div className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl mt-6">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Database className="w-5 h-5 text-audi-cyan" />
                          Bảo trì Database
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button 
                              onClick={() => setShowGiftcodeFix(true)}
                              className="p-4 neu-inset-sm hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-audi-purple/20 flex items-center justify-center text-audi-purple group-hover:scale-110 transition-transform">
                                      <Icons.Gift className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-slate-900 dark:text-white">Fix Giftcode Table</span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Sửa lỗi thiếu bảng gift_codes hoặc system_settings.</p>
                          </button>

                          <button 
                              onClick={() => setShowUserFix(true)}
                              className="p-4 neu-inset-sm hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-audi-pink/20 flex items-center justify-center text-audi-pink group-hover:scale-110 transition-transform">
                                      <Icons.Users className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-slate-900 dark:text-white">Fix Users Table</span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Sửa lỗi thiếu bảng users hoặc lỗi phân quyền (RLS).</p>
                          </button>

                          <button 
                              onClick={() => setShowBalanceFix(true)}
                              className="p-4 neu-inset-sm hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 group-hover:scale-110 transition-transform">
                                      <Icons.Gem className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-slate-900 dark:text-white">Fix Negative Balance</span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Sửa lỗi số dư âm (-Vcoin) cho tất cả tài khoản.</p>
                          </button>

                          <button 
                              onClick={handleCleanupImages}
                              className="p-4 neu-inset-sm hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                                      <Icons.Trash className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-slate-900 dark:text-white">Dọn asset hết hạn</span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Xóa toàn bộ asset chưa publish đã quá 7 ngày trong lịch sử tạo (giữ lại ảnh public).</p>
                          </button>
                      </div>

                      <div className="mt-6 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                  <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                                      <Icons.Cloud className="h-4 w-4 text-orange-300" />
                                      Xóa R2 thủ công theo thời gian
                                  </h4>
                                  <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-semibold">
                                      Chọn khoảng ngày để preview rồi xoá file R2 và metadata lịch sử. Mặc định giữ ảnh public và bỏ qua job đang chạy.
                                  </p>
                                  <p className="mt-2 text-xs font-bold text-red-200">
                                      Đang tạm khóa vì truy vấn cleanup theo DB có thể làm Supabase nano bị unhealthy.
                                  </p>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                  <button
                                      onClick={handlePreviewR2Cleanup}
                                      disabled
                                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white hover:bg-white/15 disabled:opacity-50"
                                  >
                                      {r2CleanupLoading ? <Icons.Loader className="h-4 w-4 animate-spin" /> : <Icons.Search className="h-4 w-4" />}
                                      Xem trước
                                  </button>
                                  <button
                                      onClick={handleExecuteR2Cleanup}
                                      disabled
                                      className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white hover:bg-red-600 disabled:opacity-50"
                                  >
                                      <Icons.Trash className="h-4 w-4" />
                                      Xóa thật
                                  </button>
                              </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div>
                                  <label className="mb-1 block text-xs font-bold uppercase text-slate-700 dark:text-slate-400 font-semibold">Từ ngày</label>
                                  <input
                                      type="date"
                                      value={r2CleanupStartDate}
                                      onChange={(e) => {
                                          setR2CleanupStartDate(e.target.value);
                                          setR2CleanupPreview(null);
                                      }}
                                      className="w-full rounded-lg border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-orange-300"
                                  />
                              </div>
                              <div>
                                  <label className="mb-1 block text-xs font-bold uppercase text-slate-700 dark:text-slate-400 font-semibold">Đến ngày</label>
                                  <input
                                      type="date"
                                      value={r2CleanupEndDate}
                                      onChange={(e) => {
                                          setR2CleanupEndDate(e.target.value);
                                          setR2CleanupPreview(null);
                                      }}
                                      className="w-full rounded-lg border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none focus:border-orange-300"
                                  />
                              </div>
                              <div className="xl:col-span-2">
                                  <label className="mb-1 block text-xs font-bold uppercase text-slate-700 dark:text-slate-400 font-semibold">Prefix R2</label>
                                  <input
                                      type="text"
                                      value={r2CleanupPrefix}
                                      onChange={(e) => {
                                          setR2CleanupPrefix(e.target.value);
                                          setR2CleanupPreview(null);
                                      }}
                                      placeholder="Ví dụ: inputs/ hoặc để trống"
                                      className="w-full rounded-lg border border-white/10 neu-inset-sm px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-orange-300"
                                  />
                              </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                              <label className="flex items-start gap-3 rounded-xl border border-white/10 neu-inset-sm p-3 text-xs text-slate-300">
                                  <input
                                      type="checkbox"
                                      checked={r2CleanupIncludeOrphans}
                                      onChange={(e) => {
                                          setR2CleanupIncludeOrphans(e.target.checked);
                                          setR2CleanupPreview(null);
                                      }}
                                      className="mt-0.5 accent-orange-400"
                                  />
                                  <span>
                                      <b className="text-white">Quét file mồ côi trên R2</b>
                                      <span className="mt-1 block text-slate-700 dark:text-slate-400 font-semibold">Cần nhập prefix, ví dụ inputs/. Nếu tắt, preview chỉ quét metadata DB nên chạy nhanh hơn.</span>
                                  </span>
                              </label>
                              <label className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-100">
                                  <input
                                      type="checkbox"
                                      checked={r2CleanupIncludePublic}
                                      onChange={(e) => {
                                          setR2CleanupIncludePublic(e.target.checked);
                                          setR2CleanupPreview(null);
                                      }}
                                      className="mt-0.5 accent-red-500"
                                  />
                                  <span>
                                      <b className="text-red-100">Cho phép xoá cả ảnh public</b>
                                      <span className="mt-1 block text-red-200/70">Tắt mặc định để bảo vệ showcase/published assets.</span>
                                  </span>
                              </label>
                          </div>

                          {r2CleanupPreview && (
                              <div className="mt-4 rounded-xl border border-white/10 neu-inset-sm p-4">
                                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                      {[
                                          ['DB rows', r2CleanupPreview.matched.dbRows],
                                          ['R2 từ DB', r2CleanupPreview.matched.dbR2Objects],
                                          ['R2 mồ côi', r2CleanupPreview.matched.orphanR2Objects],
                                          [r2CleanupPreview.dryRun ? 'Sẽ xoá R2' : 'Đã xoá R2', r2CleanupPreview.dryRun ? r2CleanupPreview.matched.totalR2Objects : r2CleanupPreview.deleted.r2Objects],
                                      ].map(([label, value]) => (
                                          <div key={String(label)} className="rounded-lg neu-inset-sm p-3">
                                              <div className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-400 font-semibold">{label}</div>
                                              <div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{Number(value || 0).toLocaleString('vi-VN')}</div>
                                          </div>
                                      ))}
                                  </div>
                                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                      <div>
                                          <div className="mb-2 text-xs font-bold uppercase text-slate-700 dark:text-slate-400 font-semibold">Mẫu DB</div>
                                          <div className="max-h-40 space-y-1 overflow-auto rounded-lg neu-inset-sm p-2 text-[11px] text-slate-700 dark:text-slate-300 font-semibold">
                                              {(r2CleanupPreview.samples?.dbRows || []).length === 0 ? (
                                                  <div>Không có dòng DB trong khoảng này.</div>
                                              ) : r2CleanupPreview.samples?.dbRows?.map((row) => (
                                                  <div key={row.id} className="truncate font-mono">{row.createdAt} · {row.id} · {row.r2Key || 'no-r2-key'}</div>
                                              ))}
                                          </div>
                                      </div>
                                      <div>
                                          <div className="mb-2 text-xs font-bold uppercase text-slate-700 dark:text-slate-400 font-semibold">Mẫu R2</div>
                                          <div className="max-h-40 space-y-1 overflow-auto rounded-lg neu-inset-sm p-2 text-[11px] text-slate-700 dark:text-slate-300 font-semibold">
                                              {(r2CleanupPreview.samples?.r2Objects || []).length === 0 ? (
                                                  <div>Không có file R2 mồ côi theo bộ lọc.</div>
                                              ) : r2CleanupPreview.samples?.r2Objects?.map((obj) => (
                                                  <div key={obj.key} className="truncate font-mono">{obj.lastModified} · {obj.key}</div>
                                              ))}
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          )}
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
                          <h3 className="text-xl font-bold text-slate-900 dark:text-white">SỬA LỖI SỐ DƯ ÂM</h3>
                          <p className="text-slate-700 dark:text-slate-300 font-semibold text-xs">Reset số dư về 0 cho các tài khoản bị âm Vcoin</p>
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
                      <div className="relative h-64 neu-inset-sm border border-white/10 rounded-xl overflow-hidden">
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
                          <h3 className="text-xl font-bold text-slate-900 dark:text-white">LỖI DATABASE: BẢNG DỮ LIỆU</h3>
                          <p className="text-slate-700 dark:text-slate-300 font-semibold text-xs">Phát hiện thiếu bảng Giftcode hoặc System Settings</p>
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
                      <div className="relative h-64 neu-inset-sm border border-white/10 rounded-xl overflow-hidden">
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
                          <h3 className="text-xl font-bold text-slate-900 dark:text-white">LỖI DATABASE: BẢNG USERS</h3>
                          <p className="text-slate-700 dark:text-slate-300 font-semibold text-xs">Phát hiện thiếu bảng Users hoặc lỗi RLS Policy</p>
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
                      <div className="relative h-64 neu-inset-sm border border-white/10 rounded-xl overflow-hidden">
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
                              <code className="flex-1 neu-inset-sm p-2 rounded text-[10px] font-mono text-white overflow-x-auto whitespace-nowrap">
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

      {queueJobPendingRetry && (
          <AdminModalPortal>
              <div className="fixed inset-0 z-[2200] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4 animate-fade-in">
                  <div className="bg-[#12121a] w-full max-w-lg rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
                      <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b border-white/10">
                          <div className="min-w-0">
                              <h3 className="text-lg font-bold text-white">Chạy lại job thất bại</h3>
                              <p className="mt-1 text-xs text-slate-400 font-mono break-all">{queueJobPendingRetry.id}</p>
                          </div>
                          <button
                              onClick={() => setQueueJobPendingRetry(null)}
                              disabled={Boolean(retryingQueueJobProvider)}
                              className="p-2 rounded-lg neu-inset-sm hover:bg-white/10 text-white disabled:opacity-50"
                              aria-label="Đóng"
                          >
                              <Icons.X className="w-5 h-5" />
                          </button>
                      </div>
                      <div className="p-4 sm:p-6">
                          <p className="text-sm leading-relaxed text-slate-300">
                              Chọn provider cho lần chạy mới. Hệ thống tạo một job liên kết với job cũ và áp dụng lại đúng mức phí gốc. Nếu lần chạy mới thất bại, Vcoin sẽ tự động được hoàn.
                          </p>
                          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <button
                                  onClick={() => handleRetryQueueJob('tst')}
                                  disabled={Boolean(retryingQueueJobProvider)}
                                  className="order-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20 p-4 text-left disabled:opacity-50"
                              >
                                  <span className="block text-sm font-black text-cyan-300">API 2 · TST</span>
                                  <span className="block mt-1 text-xs text-slate-400">Dùng tuyến API 2 hiện tại</span>
                                  {retryingQueueJobProvider === 'tst' && <span className="block mt-2 text-xs text-cyan-200">Đang tạo job...</span>}
                              </button>
                              <button
                                  onClick={() => handleRetryQueueJob('gpti2')}
                                  disabled={Boolean(retryingQueueJobProvider)}
                                  className="order-1 rounded-xl border border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20 p-4 text-left disabled:opacity-50"
                              >
                                  <span className="block text-sm font-black text-emerald-300">API 1 · GPTi2</span>
                                  <span className="block mt-1 text-xs text-slate-400">Chạy lại job ảnh qua GPTi2</span>
                                  {retryingQueueJobProvider === 'gpti2' && <span className="block mt-2 text-xs text-emerald-200">Đang chạy lại...</span>}
                              </button>
                              <button
                                  onClick={() => handleRetryQueueJob('gommo')}
                                  disabled={Boolean(retryingQueueJobProvider)}
                                  className="order-3 rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 hover:bg-fuchsia-400/20 p-4 text-left disabled:opacity-50"
                              >
                                  <span className="block text-sm font-black text-fuchsia-300">API 3 · Gommo</span>
                                  <span className="block mt-1 text-xs text-slate-400">Chạy trực tiếp lại qua API 3</span>
                                  {retryingQueueJobProvider === 'gommo' && <span className="block mt-2 text-xs text-fuchsia-200">Đang tạo job...</span>}
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </AdminModalPortal>
      )}

      {selectedQueueJobId && (
          <AdminModalPortal>
          <div className="fixed inset-0 z-[2100] bg-black/70 backdrop-blur-sm flex justify-center items-start sm:items-center p-2 sm:p-4 md:p-6 animate-fade-in">
              <div className="bg-[#12121a] w-full max-w-6xl rounded-2xl border border-white/20 shadow-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="flex items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10">
                      <div className="min-w-0">
                          <h3 className="text-xl font-bold text-slate-900 dark:text-white">Chi tiết Queue Job</h3>
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold font-mono mt-1 break-all">{selectedQueueJobId}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                          {selectedQueueJobDetail && selectedQueueStatus === 'failed' && (
                              <button
                                  onClick={() => setQueueJobPendingRetry(selectedQueueJobDetail.job)}
                                  className="px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 text-xs sm:text-sm font-bold"
                              >
                                  Chạy lại
                              </button>
                          )}
                          {selectedQueueJobDetail && ['queued', 'processing', 'rescuing'].includes(selectedQueueJobDetail.job.displayStatus || selectedQueueJobDetail.job.status) && (
                              <button
                                  onClick={() => handleStopQueueJob(selectedQueueJobDetail.job.id)}
                                  disabled={stoppingQueueJob}
                                  className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-200 text-sm font-bold disabled:opacity-60"
                              >
                                  {stoppingQueueJob ? 'Đang dừng...' : 'Dừng tiến trình'}
                              </button>
                          )}
                          <button onClick={() => { setSelectedQueueJobId(null); setSelectedQueueJobDetail(null); setQueuePromptExpanded(false); }} className="p-2 rounded-lg neu-inset-sm hover:bg-white/10 text-white">
                              <Icons.X className="w-5 h-5" />
                          </button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6">
                      {loadingQueueJobDetail ? (
                          <div className="py-20 text-center text-slate-700 dark:text-slate-300 font-semibold">Đang tải chi tiết job...</div>
                      ) : !selectedQueueJobDetail ? (
                          <div className="py-20 text-center text-slate-700 dark:text-slate-300 font-semibold">Không tải được dữ liệu chi tiết cho job này.</div>
                      ) : (
                          <div className="space-y-6">
                              <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-6">
                                  <div className="space-y-6">
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                          <div className="rounded-2xl border border-white/10 neu-inset-sm p-4">
                                              <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Người dùng</div>
                                              <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white break-words">{selectedQueueJobDetail.job.userName || 'Unknown'}</div>
                                              <div className="mt-1 text-xs text-slate-700 dark:text-slate-300 font-semibold break-all">{selectedQueueJobDetail.job.userEmail || '-'}</div>
                                          </div>
                                          <div className="rounded-2xl border border-white/10 neu-inset-sm p-4">
                                              <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Trạng thái</div>
                                              <div className={`mt-2 inline-flex px-3 py-1.5 rounded-full text-xs font-bold uppercase ${getQueueStatusClass(selectedQueueStatus)}`}>
                                                  {getQueueStatusLabel(selectedQueueStatus)}
                                              </div>
                                              <div className="mt-3 text-sm text-slate-300">{getQueueStageLabel(selectedQueueJobDetail.job.queueStage)}</div>
                                          </div>
                                          <div className="rounded-2xl border border-white/10 neu-inset-sm p-4">
                                              <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Tiến trình</div>
                                              <div className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{Math.round(selectedQueueJobDetail.job.progress || 0)}%</div>
                                              <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                                                  <div className={`h-full ${selectedQueueStatus === 'failed' ? 'bg-red-400' : selectedQueueStatus === 'completed' ? 'bg-emerald-400' : 'bg-audi-cyan'}`} style={{ width: `${Math.max(0, Math.min(100, selectedQueueJobDetail.job.progress || 0))}%` }} />
                                              </div>
                                          </div>
                                      </div>

                                      <div className="neu-inset-sm border border-white/10 rounded-2xl p-4">
                                          <div className="flex items-center justify-between gap-3 mb-3">
                                              <div>
                                                  <div className="text-sm font-bold text-slate-900 dark:text-white">Prompt</div>
                                                  <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold mt-1">{selectedQueuePrompt.length.toLocaleString('vi-VN')} ký tự</div>
                                              </div>
                                              {selectedQueuePrompt.length > 240 && (
                                                  <button
                                                      onClick={() => setQueuePromptExpanded((current) => !current)}
                                                      className="neu-button px-3.5 py-1.5 rounded-xl text-xs font-black text-[#FF007F] hover:scale-105"
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
                                              <div className="neu-inset-sm border border-white/10 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-400 font-semibold">
                                                  Không tìm thấy ảnh tham chiếu, ảnh mẫu hoặc kết quả để hiển thị cho job này.
                                              </div>
                                          ) : orderedQueueMediaSections.map((section) => (
                                              <div key={section.key} className={`rounded-2xl border p-4 ${getQueueMediaSectionTone(section.key)}`}>
                                                  <div className="flex items-center justify-between gap-3 mb-4">
                                                      <div>
                                                          <div className="text-sm font-bold text-slate-900 dark:text-white">{section.label}</div>
                                                          {section.description && <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-1">{section.description}</div>}
                                                      </div>
                                                      <div className="text-xs text-slate-700 dark:text-slate-400 font-semibold">{section.items.length} mục</div>
                                                  </div>
                                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                      {section.items.map((media, index) => (
                                                          <div key={`${section.key}-${media.role}-${index}`} className="rounded-2xl overflow-hidden border border-white/10 bg-[#0f0f16]">
                                                              <div className="px-3 py-2 border-b border-white/10">
                                                                  <div className="text-sm font-bold text-slate-900 dark:text-white">{media.label}</div>
                                                                  <div className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold mt-1">{getQueueMediaMeta(media)}</div>
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
                                                      <div className="text-sm font-black text-slate-900 dark:text-white">Queue Health</div>
                                                      <div className="mt-2 text-lg font-black">{selectedQueueJobDetail.job.health.label}</div>
                                                  </div>
                                                  <div className="rounded-full border border-white/10 neu-inset-sm px-2.5 py-1 text-[10px] font-bold uppercase">
                                                      {selectedQueueJobDetail.job.health.code}
                                                  </div>
                                              </div>
                                              <div className="mt-3 text-sm leading-relaxed opacity-90">{selectedQueueJobDetail.job.health.detail}</div>
                                              <div className="mt-3 text-sm font-bold opacity-95">Hành động: {selectedQueueJobDetail.job.health.action}</div>
                                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                                                  <span className="rounded-full neu-inset-sm px-2 py-1">lease: {selectedQueueJobDetail.job.health.leaseState || '-'}</span>
                                                  {typeof selectedQueueJobDetail.job.health.recoveries === 'number' && <span className="rounded-full neu-inset-sm px-2 py-1">recoveries: {selectedQueueJobDetail.job.health.recoveries}</span>}
                                                  {typeof selectedQueueJobDetail.job.health.secondsSinceUpdated === 'number' && <span className="rounded-full neu-inset-sm px-2 py-1">updated: {selectedQueueJobDetail.job.health.secondsSinceUpdated}s</span>}
                                                  {typeof selectedQueueJobDetail.job.health.secondsUntilWatchdogDue === 'number' && selectedQueueJobDetail.job.health.secondsUntilWatchdogDue > 0 && <span className="rounded-full neu-inset-sm px-2 py-1">watchdog còn: {selectedQueueJobDetail.job.health.secondsUntilWatchdogDue}s</span>}
                                                  {selectedQueueJobDetail.job.health.providerRisk && <span className="rounded-full neu-inset-sm px-2 py-1">provider-risk</span>}
                                                  {selectedQueueJobDetail.job.health.safeToRequeue && <span className="rounded-full neu-inset-sm px-2 py-1">safe-requeue</span>}
                                                  {selectedQueueJobDetail.job.health.watchdogDue && <span className="rounded-full neu-inset-sm px-2 py-1">watchdog-due</span>}
                                              </div>
                                          </div>
                                      )}

                                      <div className="neu-inset-sm border border-white/10 rounded-2xl p-4">
                                          <div className="text-sm font-bold text-slate-900 dark:text-white mb-4">Tóm tắt nhanh</div>
                                          <div className="grid grid-cols-2 gap-3">
                                              {[
                                                  { label: 'Thiết bị', value: getQueuePlatformLabel(selectedQueueJobDetail.job.clientPlatform) },
                                                  { label: 'Asset', value: selectedQueueJobDetail.job.assetType },
                                                  { label: 'Queue Kind', value: selectedQueueJobDetail.job.queueKind || '-' },
                                                  { label: 'Luồng provider', value: selectedQueueProviderFlow || '-' },
                                                  { label: 'Provider hiện tại', value: selectedQueueProviderLabel(selectedQueueJobDetail.job.provider) },
                                                  { label: 'Provider Job', value: selectedQueueJobDetail.job.jobId || '-' },
                                                  { label: 'Error Type', value: getQueueErrorCategoryLabel(selectedQueueJobDetail.job.errorCategory) },
                                                  { label: 'Cập nhật', value: getTimeAgo(selectedQueueJobDetail.job.updatedAt) },
                                              ].map((item) => (
                                                  <div key={item.label} className="rounded-xl border border-white/10 bg-[#11111a] px-3 py-3">
                                                      <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">{item.label}</div>
                                                      <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white break-words">{item.value}</div>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>

                                      {selectedQueueJobDetail.runtimeConfig && (
                                          <div className="neu-inset-sm border border-white/10 rounded-2xl p-4">
                                              <div className="text-sm font-bold text-slate-900 dark:text-white mb-4">Cấu hình chạy</div>
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
                                                          <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">{item.label}</div>
                                                          <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white break-words">{item.value}</div>
                                                      </div>
                                                  ))}
                                              </div>
                                          </div>
                                      )}

                                      {(selectedQueueJobDetail.job.error || selectedQueueJobDetail.job.errorRaw) && (
                                          <div className="neu-inset-sm border border-white/10 rounded-2xl p-4 space-y-3">
                                              <div className="flex items-center gap-3">
                                                  <div className="text-sm font-bold text-slate-900 dark:text-white">Phân tích lỗi</div>
                                                  {selectedQueueJobDetail.job.errorCategory && (
                                                      <div className={`inline-flex px-2 py-1 rounded border text-[10px] font-bold uppercase ${getQueueErrorCategoryClass(selectedQueueJobDetail.job.errorCategory)}`}>
                                                          {getQueueErrorCategoryLabel(selectedQueueJobDetail.job.errorCategory)}
                                                      </div>
                                                  )}
                                              </div>
                                              {selectedQueueJobDetail.job.error && (
                                                  <div>
                                                      <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Tóm tắt dễ hiểu</div>
                                                      <div className="text-sm text-red-300 mt-2 leading-relaxed">{selectedQueueJobDetail.job.error}</div>
                                                  </div>
                                              )}
                                              {selectedQueueJobDetail.job.errorRaw && selectedQueueJobDetail.job.errorRaw !== selectedQueueJobDetail.job.error && (
                                                  <div>
                                                      <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Lỗi gốc từ hệ thống</div>
                                                      <div className="text-sm text-slate-700 dark:text-slate-300 font-semibold mt-2 leading-relaxed break-all">{selectedQueueJobDetail.job.errorRaw}</div>
                                                  </div>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
                                  <div className="neu-inset-sm border border-white/10 rounded-2xl p-4">
                                      <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">Log tiến trình</div>
                                      <div className="space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-2">
                                          {(selectedQueueJobDetail.job.queueLogs || []).length === 0 ? (
                                              <div className="text-sm text-slate-700 dark:text-slate-400 font-semibold">Chưa có log cho job này.</div>
                                          ) : (
                                              (selectedQueueJobDetail.job.queueLogs || []).map((log, index) => (
                                                  <div key={`${log.at}-${index}`} className="border border-white/10 rounded-xl p-3 bg-[#0f0f16]">
                                                      <div className="flex items-center justify-between gap-3">
                                                          <div className="text-xs font-bold text-slate-900 dark:text-white uppercase">{getQueueStageLabel(log.stage)}</div>
                                                          <div className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold">{new Date(log.at).toLocaleString()}</div>
                                                      </div>
                                                      <div className="text-sm text-slate-300 mt-2">{log.message}</div>
                                                  </div>
                                              ))
                                          )}
                                      </div>
                                  </div>

                                  <details className="neu-inset-sm border border-white/10 rounded-2xl p-4">
                                      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-bold text-slate-900 dark:text-white">
                                          <span>Payload Preview</span>
                                          <span className="text-xs text-slate-700 dark:text-slate-400 font-semibold">Mở khi cần debug sâu</span>
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
                              <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white break-words">{viewingUser.username}</h3>
                              <p className="text-slate-700 dark:text-slate-300 font-semibold text-sm break-all">{viewingUser.email}</p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                  <span className="text-audi-yellow font-bold text-xs bg-audi-yellow/10 px-2 py-0.5 rounded">{viewingUser.vcoin_balance} Vcoin</span>
                                  <span className="text-blue-400 font-bold text-xs bg-blue-400/10 px-2 py-0.5 rounded uppercase">{viewingUser.role}</span>
                                  <span className="text-slate-300 font-bold text-xs neu-inset-sm px-2 py-0.5 rounded">{filteredUserHistory.length} giao dịch</span>
                              </div>
                          </div>
                      </div>
                      <button onClick={() => setViewingUser(null)} className="self-end md:self-auto p-2 neu-inset-sm hover:bg-white/10 rounded-xl text-slate-700 dark:text-slate-300 font-semibold hover:text-white transition-colors">
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
                                      <h4 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                          <Icons.History className="w-5 h-5 text-audi-cyan" />
                                          Lịch sử VCoin chi tiết
                                      </h4>
                                      <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-1">Hiển thị theo từng nhóm, có mã đối soát và số dư sau giao dịch.</div>
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
                                                      : 'neu-inset-sm text-slate-300 border-white/10 hover:bg-white/10'
                                              }`}
                                          >
                                              {option.label}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              {filteredUserHistory.length === 0 ? (
                                  <div className="text-center py-10 text-slate-700 dark:text-slate-400 font-semibold italic neu-inset-sm rounded-xl border border-white/5">
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
                                                          <div className="w-9 h-9 rounded-lg neu-inset-sm border border-white/10 flex items-center justify-center shrink-0">
                                                              <SectionIcon className="w-5 h-5 text-audi-cyan" />
                                                          </div>
                                                          <div>
                                                              <div className="font-bold text-slate-900 dark:text-white">{section.title}</div>
                                                              <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-0.5">{section.description}</div>
                                                          </div>
                                                      </div>
                                                      <div className="flex flex-wrap gap-2 text-xs">
                                                          <span className="px-2 py-1 rounded neu-inset-sm text-slate-300 border border-white/10">{section.items.length} giao dịch</span>
                                                          <span className={`px-2 py-1 rounded border font-bold ${sectionTotal >= 0 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-pink-500/10 text-audi-pink border-pink-500/20'}`}>
                                                              {sectionTotal > 0 ? '+' : ''}{formatVcoinValue(sectionTotal)}
                                                          </span>
                                                      </div>
                                                  </div>

                                                  {section.items.length === 0 ? (
                                                      <div className="px-4 py-6 text-sm text-slate-700 dark:text-slate-400 font-semibold italic">Không có dữ liệu.</div>
                                                  ) : (
                                                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                                          {visibleItems.map((item) => {
                                                              const generatedAsset = getHistoryGeneratedAsset(item);
                                                              const assetKind = generatedAsset ? getAssetKind(generatedAsset) : null;
                                                              return (
                                                              <div key={item.id} className="p-4 hover:bg-white/[0.03] transition-colors">
                                                                  <div className="grid grid-cols-1 xl:grid-cols-[160px_1fr_120px_120px] gap-3 xl:items-center">
                                                                      <div>
                                                                          <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold">Thời gian</div>
                                                                          <div className="mt-1 text-xs font-mono text-slate-300">{new Date(item.createdAt).toLocaleString('vi-VN')}</div>
                                                                      </div>
                                                                      <div className="min-w-0">
                                                                          <div className="flex flex-col sm:flex-row gap-3">
                                                                              {generatedAsset?.url && (
                                                                                  <a
                                                                                      href={generatedAsset.url}
                                                                                      target="_blank"
                                                                                      rel="noreferrer"
                                                                                      className="block w-full sm:w-24 h-32 sm:h-24 rounded-lg overflow-hidden border border-white/10 neu-inset-sm shrink-0"
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
                                                                                      <div className="font-bold text-slate-900 dark:text-white break-words">{item.description}</div>
                                                                                      <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${getHistoryStatusClass(item)}`}>
                                                                                          {getHistoryStatusLabel(item)}
                                                                                      </span>
                                                                                      {(item.category === 'admin_transaction' || item.type === 'admin_adjustment') && (
                                                                                          <span className="inline-flex px-2 py-0.5 rounded border text-[10px] font-bold bg-violet-500/10 text-violet-300 border-violet-500/20">
                                                                                              Admin Transaction
                                                                                          </span>
                                                                                      )}
                                                                                      {getTopupGiftcodeLabel(item.topupGiftcode) && (
                                                                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold bg-audi-cyan/10 text-audi-cyan border-audi-cyan/20">
                                                                                              <Icons.Gift className="w-3 h-3" />
                                                                                              Giftcode nạp
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
                                                                                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px] text-slate-700 dark:text-slate-400 font-semibold">
                                                                                      <div className="break-all">ID: <span className="font-mono text-slate-300">{item.referenceId || item.id}</span></div>
                                                                                      <div className="break-all">Mã: <span className="font-mono text-slate-300">{item.code || item.referenceType || '-'}</span></div>
                                                                                      {getTopupGiftcodeLabel(item.topupGiftcode) && (
                                                                                          <div className="break-all">Giftcode nạp: <span className="font-mono font-bold text-audi-cyan">{getTopupGiftcodeLabel(item.topupGiftcode)}</span></div>
                                                                                      )}
                                                                                      {Number(item.discountAmount || 0) > 0 && (
                                                                                          <div>Giảm giá: <span className="font-bold text-emerald-300">{Number(item.discountAmount || 0).toLocaleString('vi-VN')}đ</span></div>
                                                                                      )}
                                                                                      {item.toolName && <div className="break-all">Công cụ: <span className="text-slate-300">{item.toolName}</span></div>}
                                                                                      {item.jobStatus && <div>Job: <span className="text-slate-300 uppercase">{item.jobStatus}</span></div>}
                                                                                  </div>
                                                                              </div>
                                                                          </div>
                                                                      </div>
                                                                      <div>
                                                                          <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold xl:text-right">Biến động</div>
                                                                          <div className={`mt-1 text-sm font-black xl:text-right ${item.vcoinChange > 0 ? 'text-emerald-300' : item.vcoinChange < 0 ? 'text-audi-pink' : 'text-slate-300'}`}>
                                                                              {item.vcoinChange > 0 ? '+' : ''}{formatVcoinValue(item.vcoinChange)}
                                                                          </div>
                                                                      </div>
                                                                      <div>
                                                                          <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 font-semibold font-bold xl:text-right">Số dư sau</div>
                                                                          <div className="mt-1 text-sm font-black text-audi-yellow xl:text-right">{formatVcoinValue(item.balanceAfter)}</div>
                                                                      </div>
                                                                  </div>
                                                              </div>
                                                              );
                                                          })}
                                                          {section.items.length > sectionLimit && (
                                                              <div className="px-4 py-3 text-center neu-inset-sm">
                                                                  <button
                                                                      onClick={() => showMoreUserLedgerSection(section.id)}
                                                                      className="text-xs font-bold text-audi-cyan hover:text-white transition-colors py-2 px-4 rounded-lg hover:neu-inset-sm border border-white/10"
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
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Sửa Người Dùng</h3>
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Tên hiển thị</label>
                          <input value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white focus:border-audi-pink outline-none" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Số dư Vcoin</label>
                          <input type="number" value={editingUser.vcoin_balance || 0} onChange={e => setEditingUser({...editingUser, vcoin_balance: Number(e.target.value)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-audi-yellow font-bold focus:border-audi-pink outline-none" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Nội dung giao dịch sửa VCoin</label>
                          <textarea
                              value={adminUserAdjustmentReason}
                              onChange={(e) => setAdminUserAdjustmentReason(e.target.value)}
                              rows={3}
                              placeholder="VD: Bù lỗi nạp tiền, cộng thưởng hỗ trợ khách hàng..."
                              className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-slate-900 dark:text-white text-sm focus:border-audi-pink outline-none resize-none"
                          />
                          <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Bắt buộc khi thay đổi số dư VCoin. Nội dung này sẽ hiển thị trong lịch sử giao dịch.</div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Ảnh đại diện URL</label>
                          <input value={editingUser.avatar || ''} onChange={e => setEditingUser({...editingUser, avatar: e.target.value})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-slate-300 text-xs font-mono focus:border-audi-pink outline-none" />
                      </div>
                  </div>
                  <div className="flex gap-3"><button onClick={() => { setEditingUser(null); setEditingUserOriginalBalance(null); setAdminUserAdjustmentReason(''); }} className="flex-1 py-3 rounded-xl neu-inset-sm hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSaveUser} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-slate-900 dark:text-white font-bold">Lưu</button></div>
              </div>
          </div>
          </AdminModalPortal>
      )}
      {/* ... Other modals ... */}
      {editingPackage && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{editingPackage.id.startsWith('temp_') ? 'Thêm Gói Mới' : 'Sửa Gói Nạp'}</h3>
                  <div className="space-y-4 mb-6">
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Tên gói</label><input value={editingPackage.name} onChange={e => setEditingPackage({...editingPackage, name: e.target.value})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white" /></div><div><label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Tag (VD: Mới)</label><input value={editingPackage.bonusText} onChange={e => setEditingPackage({...editingPackage, bonusText: e.target.value})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white" /></div></div>
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Giá (VND)</label><input type="number" value={editingPackage.price} onChange={e => setEditingPackage({...editingPackage, price: Number(e.target.value)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-green-400 font-bold" /></div><div><label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Vcoin nhận</label><input type="number" value={editingPackage.vcoin} onChange={e => setEditingPackage({...editingPackage, vcoin: Number(e.target.value)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" /></div></div>
                      <div><label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">% Bonus thêm (Mặc định)</label><div className="relative"><input type="number" value={editingPackage.bonusPercent} onChange={e => setEditingPackage({...editingPackage, bonusPercent: Number(e.target.value)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-audi-pink font-bold pl-3" /><span className="absolute right-3 top-3.5 text-xs text-slate-700 dark:text-slate-400 font-semibold font-bold">%</span></div></div>
                      <div><label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Cú pháp chuyển khoản</label><input value={editingPackage.transferContent} onChange={e => setEditingPackage({...editingPackage, transferContent: e.target.value})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white font-mono" /></div>
                      <div className="flex gap-4 pt-2"><label className="flex items-center gap-2 cursor-pointer neu-inset-sm p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors"><input type="checkbox" checked={editingPackage.isPopular} onChange={e => setEditingPackage({...editingPackage, isPopular: e.target.checked})} className="accent-audi-pink w-4 h-4" /><span className="text-sm font-bold text-slate-900 dark:text-white">Gói HOT (Nổi bật)</span></label><label className="flex items-center gap-2 cursor-pointer neu-inset-sm p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors"><input type="checkbox" checked={editingPackage.isActive} onChange={e => setEditingPackage({...editingPackage, isActive: e.target.checked})} className="accent-green-500 w-4 h-4" /><span className="text-sm font-bold text-slate-900 dark:text-white">Đang bán (Active)</span></label></div>
                  </div>
                  <div className="flex gap-3"><button onClick={() => setEditingPackage(null)} className="flex-1 py-3 rounded-xl neu-inset-sm hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSavePackage} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-slate-900 dark:text-white font-bold">Lưu Thay Đổi</button></div>
              </div>
          </div>
      )}
      {editingPromotion && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 sticky top-0 bg-[#12121a] z-10 py-2 border-b border-white/10 shrink-0">
                      {editingPromotion.id.startsWith('temp_') ? 'Tạo Chiến Dịch Mới' : 'Sửa Chiến Dịch'}
                  </h3>
                  <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Tên chiến dịch (Nội bộ)</label>
                          <input value={editingPromotion.name} onChange={e => setEditingPromotion({...editingPromotion, name: e.target.value})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-slate-900 dark:text-white font-bold" placeholder="Ví dụ: Sale 8/3"/>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Thông báo chạy (Marquee)</label>
                          <input value={editingPromotion.marqueeText} onChange={e => setEditingPromotion({...editingPromotion, marqueeText: e.target.value})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white" placeholder="Khuyến mãi đặc biệt..."/>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">% Bonus Vcoin</label>
                          <div className="relative">
                              <input type="number" value={editingPromotion.bonusPercent} onChange={e => setEditingPromotion({...editingPromotion, bonusPercent: Number(e.target.value)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-audi-pink font-bold pl-3" />
                              <span className="absolute right-3 top-3.5 text-xs text-slate-700 dark:text-slate-400 font-semibold font-bold">%</span>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Bắt đầu (giờ Việt Nam)</label>
                              <input type="datetime-local" value={formatVietnamDateTimeLocal(editingPromotion.startTime)} onChange={e => setEditingPromotion({...editingPromotion, startTime: parseVietnamDateTimeLocalToIso(e.target.value, editingPromotion.startTime)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white font-mono text-xs" />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Kết thúc (giờ Việt Nam)</label>
                              <input type="datetime-local" value={formatVietnamDateTimeLocal(editingPromotion.endTime)} onChange={e => setEditingPromotion({...editingPromotion, endTime: parseVietnamDateTimeLocalToIso(e.target.value, editingPromotion.endTime)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white font-mono text-xs" />
                          </div>
                      </div>
                      <p className="text-[10px] text-audi-cyan font-bold -mt-2">Múi giờ áp dụng: Việt Nam (UTC+7). Lưu xuống hệ thống bằng ISO để chạy khuyến mãi chính xác.</p>
                      <div className="neu-inset-sm rounded-xl p-3 flex items-center gap-3 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setEditingPromotion({...editingPromotion, isActive: !editingPromotion.isActive})}>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${editingPromotion.isActive ? 'bg-audi-lime border-audi-lime' : 'border-slate-500'}`}>{editingPromotion.isActive && <Icons.Check className="w-3 h-3 text-black" />}</div>
                          <label className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer select-none">Kích hoạt (Manual Switch)</label>
                      </div>
                      <p className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold italic">Chiến dịch chỉ chạy khi BẬT và trong khoảng thời gian quy định.</p>
                  </div>
                  <div className="flex gap-3 pt-6 mt-2 border-t border-white/10 shrink-0">
                      <button onClick={() => setEditingPromotion(null)} className="flex-1 py-3 rounded-xl neu-inset-sm hover:bg-white/10 text-slate-300 font-bold transition-colors">Hủy</button>
                      <button onClick={handleSavePromotion} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-slate-900 dark:text-white font-bold shadow-lg transition-all">Lưu Chiến Dịch</button>
                  </div>
              </div>
          </div>
      )}
      {editingGiftcode && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{editingGiftcode.id.startsWith('temp_') ? 'Tạo Giftcode' : 'Sửa Giftcode'}</h3>
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Loại code</label>
                          <select value={editingGiftcode.codeType || 'reward'} onChange={e => setEditingGiftcode({...editingGiftcode, codeType: e.target.value as any})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-slate-900 dark:text-white font-bold">
                              <option value="reward">Thưởng Vcoin</option>
                              <option value="topup_discount">Giảm giá nạp tiền</option>
                          </select>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Mã Code (Tự động in hoa)</label>
                          <input value={editingGiftcode.code} onChange={e => setEditingGiftcode({...editingGiftcode, code: e.target.value.toUpperCase()})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white font-mono font-bold" placeholder={editingGiftcode.codeType === 'topup_discount' ? 'Vd: AUAI-50-8K2QD' : 'Vd: CHAOMUNG'} />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Mã chiến dịch</label>
                          <input value={editingGiftcode.campaignKey || ''} onChange={e => setEditingGiftcode({...editingGiftcode, campaignKey: e.target.value.toUpperCase()})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white font-mono font-bold" placeholder="Vd: TET2026" />
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold -mt-2">Code thưởng dùng cho mục Giftcode. Code giảm giá nạp tiền dùng ở màn nạp và được reserve theo giao dịch SePay.</p>
                      {editingGiftcode.codeType === 'topup_discount' ? (
                          <>
                              <div>
                                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Giảm giá (%)</label>
                                  <input type="number" min={1} max={100} value={editingGiftcode.discountPercent || 0} onChange={e => setEditingGiftcode({...editingGiftcode, discountPercent: Number(e.target.value), reward: 0})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-audi-cyan font-bold" />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Áp dụng cho</label>
                                  <select value={editingGiftcode.audience || 'all'} onChange={e => setEditingGiftcode({...editingGiftcode, audience: e.target.value as any})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-slate-900 dark:text-white font-bold">
                                      <option value="all">Tất cả tài khoản</option>
                                      <option value="new_user_first_topup">Chỉ lần nạp đầu tiên</option>
                                      <option value="specific_user">Một tài khoản cụ thể</option>
                                  </select>
                              </div>
                              {editingGiftcode.audience === 'specific_user' && (
                                  <div>
                                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">User ID</label>
                                      <input value={editingGiftcode.assignedUserId || ''} onChange={e => setEditingGiftcode({...editingGiftcode, assignedUserId: e.target.value.trim() || null})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white font-mono text-xs" placeholder="UUID tài khoản" />
                                  </div>
                              )}
                              <label className="flex items-center gap-2 cursor-pointer neu-inset-sm p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                                  <input type="checkbox" checked={Boolean(editingGiftcode.autoGeneratePerUser)} onChange={e => setEditingGiftcode({...editingGiftcode, autoGeneratePerUser: e.target.checked})} className="accent-audi-cyan w-4 h-4" />
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">Đánh dấu mẫu tạo code riêng từng user</span>
                              </label>
                          </>
                      ) : (
                          <div>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Phần thưởng (Vcoin)</label>
                              <input type="number" value={editingGiftcode.reward} onChange={e => setEditingGiftcode({...editingGiftcode, reward: Number(e.target.value), discountPercent: 0})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" />
                          </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Giới hạn tổng</label>
                              <input type="number" value={editingGiftcode.totalLimit} onChange={e => setEditingGiftcode({...editingGiftcode, totalLimit: Number(e.target.value)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white" />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Max/Người</label>
                              <input type="number" value={editingGiftcode.maxPerUser} onChange={e => setEditingGiftcode({...editingGiftcode, maxPerUser: Number(e.target.value)})} className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white" />
                          </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer neu-inset-sm p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors mt-2"><input type="checkbox" checked={editingGiftcode.isActive} onChange={e => setEditingGiftcode({...editingGiftcode, isActive: e.target.checked})} className="accent-green-500 w-4 h-4" /><span className="text-sm font-bold text-slate-900 dark:text-white">Kích hoạt ngay</span></label>
                  </div>
                  <div className="flex gap-3"><button onClick={() => setEditingGiftcode(null)} className="flex-1 py-3 rounded-xl neu-inset-sm hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSaveGiftcode} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-slate-900 dark:text-white font-bold">Lưu Code</button></div>
              </div>
          </div>
      )}

      {editingStyle && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 sticky top-0 bg-[#12121a] z-10 py-2 border-b border-white/10 shrink-0">
                      {editingStyle.id.startsWith('temp_') ? 'Thêm Style Mới' : 'Sửa Style'}
                  </h3>
                  <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Tên Style</label>
                          <input 
                              value={editingStyle.name} 
                              onChange={e => setEditingStyle({...editingStyle, name: e.target.value})} 
                              className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-slate-900 dark:text-white font-bold" 
                              placeholder="Ví dụ: 3D Audition"
                          />
                      </div>
                      
                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Ảnh Mẫu (Reference)</label>
                          <div className="flex gap-4 items-start">
                              <div className="w-24 h-32 neu-inset-sm rounded-lg border border-white/10 overflow-hidden shrink-0">
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
                                      className="block w-full text-sm text-slate-700 dark:text-slate-400 font-semibold file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-audi-pink file:text-white hover:file:bg-pink-600 mb-2"
                                  />
                                  <p className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold">Upload ảnh chất lượng cao để làm mẫu chuẩn cho AI.</p>
                              </div>
                          </div>
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-semibold uppercase mb-1 block">Trigger Prompt (Optional)</label>
                          <textarea 
                              value={editingStyle.trigger_prompt || ''} 
                              onChange={e => setEditingStyle({...editingStyle, trigger_prompt: e.target.value})} 
                              className="w-full neu-inset-sm border border-white/10 rounded-xl p-3 text-white font-mono text-xs h-24" 
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
                          <label className="flex items-center gap-2 cursor-pointer neu-inset-sm p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors">
                              <input 
                                  type="checkbox" 
                                  checked={editingStyle.is_default} 
                                  onChange={e => setEditingStyle({...editingStyle, is_default: e.target.checked})} 
                                  className="accent-audi-yellow w-4 h-4" 
                              />
                              <span className="text-sm font-bold text-slate-900 dark:text-white">Đặt làm Mặc Định</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer neu-inset-sm p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors">
                              <input 
                                  type="checkbox" 
                                  checked={editingStyle.is_active} 
                                  onChange={e => setEditingStyle({...editingStyle, is_active: e.target.checked})} 
                                  className="accent-green-500 w-4 h-4" 
                              />
                              <span className="text-sm font-bold text-slate-900 dark:text-white">Kích hoạt</span>
                          </label>
                      </div>
                  </div>
                  
                  <div className="flex gap-3 pt-6 mt-2 border-t border-white/10 shrink-0">
                      <button onClick={() => setEditingStyle(null)} className="flex-1 py-3 rounded-xl neu-inset-sm hover:bg-white/10 text-slate-300 font-bold transition-colors">Hủy</button>
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
                          className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-slate-900 dark:text-white font-bold shadow-lg transition-all"
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
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Icons.Users className="w-6 h-6 text-green-500" />
                          Người dùng đã nhập code <span className="text-audi-yellow font-mono">{viewingGiftcodeUsage.code}</span>
                      </h3>
                      <button onClick={() => setViewingGiftcodeUsage(null)} className="p-2 hover:bg-white/10 rounded-lg text-slate-700 dark:text-slate-300 font-semibold hover:text-white transition-colors"><Icons.X className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
                      {loadingGiftcodeUsers ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-700 dark:text-slate-400 font-semibold gap-3">
                              <Icons.Loader className="w-8 h-8 animate-spin text-audi-cyan" />
                              <p>Đang tải danh sách...</p>
                          </div>
                      ) : giftcodeUsers.length === 0 ? (
                          <div className="text-center py-12 text-slate-700 dark:text-slate-400 font-semibold italic">
                              Chưa có ai sử dụng mã này.
                          </div>
                      ) : (
                          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300 font-semibold">
                              <thead className="neu-inset-sm text-xs font-bold text-slate-700 dark:text-slate-400 font-semibold uppercase sticky top-0 backdrop-blur-md z-10">
                                  <tr>
                                      <th className="px-6 py-3">Người dùng</th>
                                      <th className="px-6 py-3">Email</th>
                                      <th className="px-6 py-3">IP</th>
                                      <th className="px-6 py-3">Risk</th>
                                      <th className="px-6 py-3">Thưởng</th>
                                      <th className="px-6 py-3">Xử lý</th>
                                      <th className="px-6 py-3 text-right">Thời gian</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                  {giftcodeUsers.map((u, idx) => {
                                      const locked = u.accountStatus === 'locked';
                                      return (
                                      <tr key={idx} className={`transition-colors ${locked ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:neu-inset-sm'}`}>
                                          <td className="px-6 py-3 flex items-center gap-3">
                                              <img src={u.userAvatar} className="w-8 h-8 rounded-full bg-white/10" />
                                                  <div>
                                                      <div className="font-bold text-slate-900 dark:text-white">{u.userName}</div>
                                                  {u.isTopupUsage && u.topupCode && <div className="mt-1 font-mono text-[10px] text-audi-cyan">{u.topupCode}</div>}
                                                  <div className="mt-1 flex flex-wrap gap-1">
                                                      {locked && <span className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">LOCKED</span>}
                                                      {u.accountWarning && <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-[10px] font-bold text-yellow-300">WARNED</span>}
                                                  </div>
                                                  {locked && u.lockReason && <div className="mt-1 max-w-[180px] truncate text-[10px] text-red-300" title={u.lockReason}>{u.lockReason}</div>}
                                              </div>
                                          </td>
                                          <td className="px-6 py-3">{u.userEmail}</td>
                                          <td className="px-6 py-3 font-mono text-xs">{u.ipAddress || 'Ẩn / cũ'}</td>
                                          <td className="px-6 py-3">
                                              <div className="font-mono text-xs text-audi-yellow">{u.riskScore || 0}</div>
                                              {u.browserKeyHash && <div className="mt-1 max-w-[160px] truncate font-mono text-[10px] text-audi-cyan" title={u.browserKeyHash}>key:{u.browserKeyHash.slice(0, 10)}</div>}
                                              {u.riskFlags?.length > 0 && <div className="mt-1 max-w-[160px] truncate text-[10px] text-slate-700 dark:text-slate-400 font-semibold" title={u.riskFlags.join(', ')}>{u.riskFlags.join(', ')}</div>}
                                          </td>
                                          <td className="px-6 py-3">
                                              {u.isTopupUsage ? (
                                                  <div>
                                                      <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase bg-audi-cyan/15 text-audi-cyan">topup</span>
                                                      <div className="mt-1 text-[10px] text-slate-700 dark:text-slate-400 font-semibold">Giảm {Number(u.discountAmount || 0).toLocaleString()}đ</div>
                                                  </div>
                                              ) : (
                                                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${u.rewardStatus === 'granted' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{u.rewardStatus || 'granted'}</span>
                                              )}
                                              {u.abuseStatus && u.abuseStatus !== 'ok' && <div className="mt-1 text-[10px] text-red-300">{u.abuseStatus}</div>}
                                          </td>
                                          <td className="px-6 py-3">
                                              {u.isTopupUsage ? (
                                                  <span className="text-[10px] text-slate-700 dark:text-slate-400 font-semibold">Đối soát qua giao dịch nạp</span>
                                              ) : (
                                                  <div className="flex flex-wrap gap-1">
                                                      <button onClick={() => handleGiftcodeUserAction('revoke', u)} disabled={u.rewardStatus === 'revoked'} className="neu-button px-3 py-1.5 rounded-xl text-xs font-black text-red-500 hover:scale-105 disabled:opacity-40">Thu hồi</button>
                                                      <button onClick={() => handleGiftcodeUserAction('warn', u)} className="rounded bg-yellow-500/15 px-2 py-1 text-[10px] font-bold text-yellow-300 hover:bg-yellow-500 hover:text-black">Cảnh báo</button>
                                                      <button onClick={() => handleGiftcodeUserAction('lock', u)} disabled={locked} className="neu-button px-3 py-1.5 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 hover:scale-105 disabled:opacity-40">Khóa</button>
                                                  </div>
                                              )}
                                          </td>
                                          <td className="px-6 py-3 text-right font-mono text-xs">{new Date(u.usedAt).toLocaleString()}</td>
                                      </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      )}
                  </div>

                  <div className="p-4 border-t border-white/10 neu-inset-sm shrink-0 text-right">
                      <button onClick={() => setViewingGiftcodeUsage(null)} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold transition-colors">Đóng</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
