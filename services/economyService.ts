import { getSupabaseAuthHeader, getSupabaseUser, supabase } from './supabaseClient';
import { trackEvent } from './analyticsService';
import { UserProfile, CreditPackage, Giftcode, PromotionCampaign, Transaction, HistoryItem, VcoinLog, AdminQueueJob, AdminQueueSummary, AdminQueueJobDetail, AdminQueueHealthReport, AdminQueueRescueResult } from '../types';
import {
  creditsToVcoin,
  fetchTstModels,
  fetchTstPricing,
  filterAdminManagedPricingEntries,
  getPerSecondPricingKey,
  getVertexEditPricingRows,
  isPerSecondBillingModel,
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
    group5: 8,
};

const USER_PROFILE_CACHE_TTL_MS = 30_000;
const PACKAGE_CACHE_TTL_MS = 5 * 60_000;
const PROMOTION_CACHE_TTL_MS = 5 * 60_000;
const CHECKIN_STATUS_CACHE_TTL_MS = 30_000;
const CHECKIN_STATUS_ATTENTION_THROTTLE_MS = 15_000;
const MODEL_PRICING_CACHE_TTL_MS = 60_000;
const TST_SERVER_AVAILABILITY_CACHE_TTL_MS = 60_000;
const TST_SUPABASE_READ_TIMEOUT_MS = 12_000;
const TST_SUPABASE_READ_RETRIES = 1;
const TST_SUPABASE_READ_RETRY_DELAY_MS = 500;
const MAINTENANCE_MODE_CACHE_TTL_MS = 60_000;
const MAINTENANCE_MODE_POLL_MS = 300_000;
const VISIT_LOG_THROTTLE_MS = 30 * 60_000;
const USER_HISTORY_FETCH_LIMIT = 200;
const ADMIN_STATS_TRANSACTION_LIMIT = 1000;
const ADMIN_STATS_USAGE_LOG_LIMIT = 3000;
const ADMIN_STATS_USER_PAGE_SIZE = 500;

type TimedCache<T> = {
    value: T;
    expiresAt: number;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
};

const readWithRetry = async <T>(factory: () => Promise<T>, label: string): Promise<T> => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= TST_SUPABASE_READ_RETRIES; attempt += 1) {
        try {
            return await withTimeout(factory(), TST_SUPABASE_READ_TIMEOUT_MS, label);
        } catch (error) {
            lastError = error;
            if (attempt >= TST_SUPABASE_READ_RETRIES) {
                break;
            }
            await delay(TST_SUPABASE_READ_RETRY_DELAY_MS);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
};

export type CheckinStatusState = {
    streak: number;
    isCheckedInToday: boolean;
    history: string[];
    claimedMilestones: number[];
};

export type PaymentGateway = 'sepay';

export type PaymentGatewayConfig = {
    gateway: PaymentGateway;
};

export type SystemAnnouncementConfig = {
    isActive: boolean;
    title: string;
    message: string;
    variant: 'info' | 'promo' | 'warning';
    updatedAt?: string;
};

export type FeatureMaintenanceConfig = {
    disabledFeatureIds: string[];
    message?: string;
    updatedAt?: string;
};

export type AppTourSurface = 'desktop' | 'mobile';
export type AppTourPlacement = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export type AppTourStep = {
    id: string;
    targetId: string;
    title: string;
    description: string;
    placement?: AppTourPlacement;
    order?: number;
    isActive?: boolean;
};

export type AppTourDefinition = {
    id: string;
    title: string;
    surface: AppTourSurface;
    screen: string;
    featureId?: string;
    isActive: boolean;
    steps: AppTourStep[];
};

export type AppToursConfig = {
    isActive: boolean;
    showFrequency: 'daily' | 'once' | 'always';
    tours: AppTourDefinition[];
    updatedAt?: string;
};

const DEFAULT_PAYMENT_GATEWAY_CONFIG: PaymentGatewayConfig = {
    gateway: 'sepay',
};

export const DEFAULT_SYSTEM_ANNOUNCEMENT_CONFIG: SystemAnnouncementConfig = {
    isActive: false,
    title: 'Thông báo từ AUDITION AI',
    message: 'Chào mừng bạn quay lại AUDITION AI.',
    variant: 'info',
};

export const DEFAULT_FEATURE_MAINTENANCE_CONFIG: FeatureMaintenanceConfig = {
    disabledFeatureIds: [],
    message: 'Tính năng đang bảo trì. Vui lòng quay lại sau.',
};

export const APP_TOUR_TARGETS: Array<{ id: string; label: string; surface: AppTourSurface; screen: string; featureId?: string }> = [
    { id: 'desktop.layout.logo', label: 'Desktop - Logo / home', surface: 'desktop', screen: 'global' },
    { id: 'desktop.layout.language', label: 'Desktop - Language switch', surface: 'desktop', screen: 'global' },
    { id: 'desktop.layout.dock', label: 'Desktop - Bottom dock', surface: 'desktop', screen: 'global' },
    { id: 'desktop.layout.vcoin', label: 'Desktop - VCOIN balance/top up', surface: 'desktop', screen: 'global' },
    { id: 'desktop.layout.profile', label: 'Desktop - Profile/settings', surface: 'desktop', screen: 'global' },
    { id: 'desktop.home.checkin', label: 'Desktop - Daily check-in', surface: 'desktop', screen: 'home' },
    { id: 'desktop.home.features', label: 'Desktop - Tool cards', surface: 'desktop', screen: 'home' },
    { id: 'desktop.tool.back', label: 'Desktop - Tool back button', surface: 'desktop', screen: 'tool_workspace' },
    { id: 'desktop.image.references', label: 'Desktop - Prompt image references', surface: 'desktop', screen: 'tool_workspace', featureId: 'ai_image_tool' },
    { id: 'desktop.image.prompt', label: 'Desktop - Prompt image prompt', surface: 'desktop', screen: 'tool_workspace', featureId: 'ai_image_tool' },
    { id: 'desktop.image.model', label: 'Desktop - Prompt image model/settings', surface: 'desktop', screen: 'tool_workspace', featureId: 'ai_image_tool' },
    { id: 'desktop.image.generate', label: 'Desktop - Prompt image generate button', surface: 'desktop', screen: 'tool_workspace', featureId: 'ai_image_tool' },
    { id: 'desktop.generation.prompt', label: 'Desktop - Studio image prompt', surface: 'desktop', screen: 'tool_workspace' },
    { id: 'desktop.generation.characters', label: 'Desktop - Studio image characters', surface: 'desktop', screen: 'tool_workspace' },
    { id: 'desktop.generation.settings', label: 'Desktop - Studio image settings', surface: 'desktop', screen: 'tool_workspace' },
    { id: 'desktop.generation.generate', label: 'Desktop - Studio image generate button', surface: 'desktop', screen: 'tool_workspace' },
    { id: 'desktop.video.mode', label: 'Desktop - Video mode switch', surface: 'desktop', screen: 'tool_workspace', featureId: 'video_ai_gen' },
    { id: 'desktop.video.upload', label: 'Desktop - Video upload area', surface: 'desktop', screen: 'tool_workspace', featureId: 'video_ai_gen' },
    { id: 'desktop.video.prompt', label: 'Desktop - Video/motion prompt', surface: 'desktop', screen: 'tool_workspace', featureId: 'video_ai_gen' },
    { id: 'desktop.video.model', label: 'Desktop - Video/motion model settings', surface: 'desktop', screen: 'tool_workspace', featureId: 'video_ai_gen' },
    { id: 'desktop.video.generate', label: 'Desktop - Video/motion generate button', surface: 'desktop', screen: 'tool_workspace', featureId: 'video_ai_gen' },
    { id: 'mobile.layout.topbar', label: 'Mobile - Top bar', surface: 'mobile', screen: 'global' },
    { id: 'mobile.layout.vcoin', label: 'Mobile - VCOIN balance', surface: 'mobile', screen: 'global' },
    { id: 'mobile.layout.profile', label: 'Mobile - Profile/settings', surface: 'mobile', screen: 'global' },
    { id: 'mobile.layout.bottomnav', label: 'Mobile - Bottom navigation', surface: 'mobile', screen: 'global' },
    { id: 'mobile.home.features', label: 'Mobile - Tool cards', surface: 'mobile', screen: 'home' },
    { id: 'mobile.image.prompt', label: 'Mobile - Prompt image prompt', surface: 'mobile', screen: 'tool_workspace', featureId: 'ai_image_tool' },
    { id: 'mobile.image.references', label: 'Mobile - Prompt image references', surface: 'mobile', screen: 'tool_workspace', featureId: 'ai_image_tool' },
    { id: 'mobile.image.generate', label: 'Mobile - Prompt image generate button', surface: 'mobile', screen: 'tool_workspace', featureId: 'ai_image_tool' },
    { id: 'mobile.video.upload', label: 'Mobile - Video upload area', surface: 'mobile', screen: 'tool_workspace', featureId: 'video_ai_gen' },
    { id: 'mobile.video.prompt', label: 'Mobile - Video/motion prompt', surface: 'mobile', screen: 'tool_workspace', featureId: 'video_ai_gen' },
    { id: 'mobile.video.generate', label: 'Mobile - Video/motion generate button', surface: 'mobile', screen: 'tool_workspace', featureId: 'video_ai_gen' },
];

export const DEFAULT_APP_TOURS_CONFIG: AppToursConfig = {
    isActive: true,
    showFrequency: 'daily',
    tours: [
        {
            id: 'desktop_home_intro',
            title: 'Huong dan trang chu may tinh',
            surface: 'desktop',
            screen: 'home',
            isActive: true,
            steps: [
                { id: 'desktop_home_intro_1', targetId: 'desktop.home.features', title: 'Chon cong cu AI', description: 'Chon cong cu tao anh, chinh sua anh hoac tao video de bat dau.', placement: 'top', order: 1, isActive: true },
                { id: 'desktop_home_intro_2', targetId: 'desktop.home.checkin', title: 'Diem danh moi ngay', description: 'Bam vao day de nhan phan thuong diem danh khi co luot kha dung.', placement: 'left', order: 2, isActive: true },
                { id: 'desktop_home_intro_3', targetId: 'desktop.layout.vcoin', title: 'So du VCOIN', description: 'Theo doi so du va nap them VCOIN de su dung cac tinh nang AI.', placement: 'top', order: 3, isActive: true },
            ],
        },
        {
            id: 'desktop_image_tool_intro',
            title: 'Huong dan tao anh may tinh',
            surface: 'desktop',
            screen: 'tool_workspace',
            featureId: 'ai_image_tool',
            isActive: true,
            steps: [
                { id: 'desktop_image_tool_1', targetId: 'desktop.image.references', title: 'Anh tham chieu', description: 'Tai anh mau neu ban muon AI bam theo nhan vat, bo cuc hoac phong cach cu the.', placement: 'right', order: 1, isActive: true },
                { id: 'desktop_image_tool_2', targetId: 'desktop.image.prompt', title: 'Prompt tao anh', description: 'Nhap mo ta anh cang ro thi ket qua cang sat y tuong.', placement: 'top', order: 2, isActive: true },
                { id: 'desktop_image_tool_3', targetId: 'desktop.image.model', title: 'Model va cau hinh', description: 'Chon model, chat luong va toc do phu hop voi nhu cau.', placement: 'left', order: 3, isActive: true },
                { id: 'desktop_image_tool_4', targetId: 'desktop.image.generate', title: 'Tao anh', description: 'Kiem tra chi phi VCOIN roi bam tao de dua job vao hang doi.', placement: 'top', order: 4, isActive: true },
            ],
        },
        {
            id: 'desktop_video_tool_intro',
            title: 'Huong dan tao video may tinh',
            surface: 'desktop',
            screen: 'tool_workspace',
            featureId: 'video_ai_gen',
            isActive: true,
            steps: [
                { id: 'desktop_video_tool_1', targetId: 'desktop.video.mode', title: 'Chon che do video', description: 'Chuyen giua tao Video AI va Motion Control tuy muc dich.', placement: 'bottom', order: 1, isActive: true },
                { id: 'desktop_video_tool_2', targetId: 'desktop.video.upload', title: 'Tai tu lieu', description: 'Tai anh keyframe cho Video AI hoac anh nhan vat/video chuyen dong cho Motion Control.', placement: 'right', order: 2, isActive: true },
                { id: 'desktop_video_tool_3', targetId: 'desktop.video.prompt', title: 'Mo ta chuyen dong', description: 'Viet y tuong, hanh dong, boi canh hoac yeu cau chuyen dong cho video.', placement: 'top', order: 3, isActive: true },
                { id: 'desktop_video_tool_4', targetId: 'desktop.video.generate', title: 'Tao video', description: 'Kiem tra VCOIN va bam tao de gui job render video.', placement: 'top', order: 4, isActive: true },
            ],
        },
        {
            id: 'mobile_home_intro',
            title: 'Huong dan trang chu dien thoai',
            surface: 'mobile',
            screen: 'home',
            isActive: true,
            steps: [
                { id: 'mobile_home_intro_1', targetId: 'mobile.layout.topbar', title: 'Thanh tai khoan', description: 'Xem nhanh so du, uu dai va mo trang tai khoan.', placement: 'bottom', order: 1, isActive: true },
                { id: 'mobile_home_intro_2', targetId: 'mobile.home.features', title: 'Chon cong cu', description: 'Chon cong cu AI ban muon dung tren dien thoai.', placement: 'top', order: 2, isActive: true },
                { id: 'mobile_home_intro_3', targetId: 'mobile.layout.bottomnav', title: 'Dieu huong nhanh', description: 'Dung thanh duoi de chuyen giua trang chu, thu vien, nap tien va tai khoan.', placement: 'top', order: 3, isActive: true },
            ],
        },
        {
            id: 'mobile_image_tool_intro',
            title: 'Huong dan tao anh dien thoai',
            surface: 'mobile',
            screen: 'tool_workspace',
            featureId: 'ai_image_tool',
            isActive: true,
            steps: [
                { id: 'mobile_image_tool_1', targetId: 'mobile.image.references', title: 'Anh tham chieu', description: 'Them anh mau de AI hieu nhan vat hoac phong cach ban muon.', placement: 'bottom', order: 1, isActive: true },
                { id: 'mobile_image_tool_2', targetId: 'mobile.image.prompt', title: 'Prompt tao anh', description: 'Nhap mo ta ro rang truoc khi tao anh.', placement: 'top', order: 2, isActive: true },
                { id: 'mobile_image_tool_3', targetId: 'mobile.image.generate', title: 'Bam tao', description: 'Kiem tra chi phi roi gui yeu cau tao anh.', placement: 'top', order: 3, isActive: true },
            ],
        },
        {
            id: 'mobile_video_tool_intro',
            title: 'Huong dan tao video dien thoai',
            surface: 'mobile',
            screen: 'tool_workspace',
            featureId: 'video_ai_gen',
            isActive: true,
            steps: [
                { id: 'mobile_video_tool_1', targetId: 'mobile.video.upload', title: 'Tai anh hoac video mau', description: 'Chuan bi tu lieu dau vao cho Video AI hoac Motion Control.', placement: 'bottom', order: 1, isActive: true },
                { id: 'mobile_video_tool_2', targetId: 'mobile.video.prompt', title: 'Mo ta video', description: 'Viet chuyen dong, boi canh va y tuong chinh.', placement: 'top', order: 2, isActive: true },
                { id: 'mobile_video_tool_3', targetId: 'mobile.video.generate', title: 'Tao video', description: 'Bam tao de dua video vao hang doi xu ly.', placement: 'top', order: 3, isActive: true },
            ],
        },
    ],
};

let userProfileCache: (TimedCache<UserProfile> & { userId: string }) | null = null;
let userProfilePromise: Promise<UserProfile> | null = null;
let packageCache: TimedCache<CreditPackage[]> | null = null;
let promotionCache: TimedCache<PromotionCampaign | null> | null = null;
const DEFAULT_CHECKIN_STATUS: CheckinStatusState = {
    streak: 0,
    isCheckedInToday: false,
    history: [],
    claimedMilestones: [],
};
let checkinStatusCache: (TimedCache<CheckinStatusState> & { userId: string }) | null = null;
let checkinStatusPromise: Promise<CheckinStatusState> | null = null;
const checkinStatusSubscribers = new Set<(value: CheckinStatusState) => void>();
let checkinStatusAttentionCleanup: (() => void) | null = null;
let lastCheckinStatusAttentionAt = 0;
let modelPricingCache: TimedCache<ModelPricing[]> | null = null;
let tstServerAvailabilityCache: TimedCache<TstServerAvailabilityConfig> | null = null;
let featureMaintenanceCache: TimedCache<FeatureMaintenanceConfig> | null = null;
const DEFAULT_MAINTENANCE_MODE = {
    isActive: false,
    message: "Hệ thống đang bảo trì, vui lòng quay lại sau."
};
type MaintenanceModeState = typeof DEFAULT_MAINTENANCE_MODE;
let maintenanceModeCache: TimedCache<MaintenanceModeState> | null = null;
let maintenanceModePromise: Promise<MaintenanceModeState> | null = null;
const maintenanceModeSubscribers = new Set<(value: MaintenanceModeState) => void>();
let maintenanceModePollTimer: ReturnType<typeof setInterval> | null = null;
let lastActiveUpdateAt = 0;

export const invalidateUserProfileCache = () => {
    userProfileCache = null;
    userProfilePromise = null;
};

export const invalidatePackageCache = () => {
    packageCache = null;
};

export const invalidatePromotionCache = () => {
    promotionCache = null;
};

export const invalidateCheckinStatusCache = () => {
    checkinStatusCache = null;
    checkinStatusPromise = null;
};

export const invalidateModelPricingCache = () => {
    modelPricingCache = null;
};

export const invalidateTstServerAvailabilityCache = () => {
    tstServerAvailabilityCache = null;
};

export const invalidateFeatureMaintenanceCache = () => {
    featureMaintenanceCache = null;
};

export const invalidateMaintenanceModeCache = () => {
    maintenanceModeCache = null;
    maintenanceModePromise = null;
};

const notifyMaintenanceModeSubscribers = (value: MaintenanceModeState) => {
    maintenanceModeSubscribers.forEach((subscriber) => subscriber(value));
};

const setSharedMaintenanceMode = (value: MaintenanceModeState) => {
    maintenanceModeCache = {
        value,
        expiresAt: Date.now() + MAINTENANCE_MODE_CACHE_TTL_MS,
    };
    notifyMaintenanceModeSubscribers(value);
    return value;
};

const stopMaintenanceModePolling = () => {
    if (maintenanceModePollTimer) {
        clearInterval(maintenanceModePollTimer);
        maintenanceModePollTimer = null;
    }
};

const ensureMaintenanceModePolling = () => {
    if (maintenanceModePollTimer || maintenanceModeSubscribers.size === 0) {
        return;
    }

    maintenanceModePollTimer = setInterval(() => {
        void getMaintenanceMode({ force: true });
    }, MAINTENANCE_MODE_POLL_MS);
};

const notifyCheckinStatusSubscribers = (value: CheckinStatusState) => {
    checkinStatusSubscribers.forEach((subscriber) => subscriber(value));
};

const setSharedCheckinStatus = (userId: string, value: CheckinStatusState) => {
    checkinStatusCache = {
        userId,
        value,
        expiresAt: Date.now() + CHECKIN_STATUS_CACHE_TTL_MS,
    };
    notifyCheckinStatusSubscribers(value);
    return value;
};

const stopCheckinStatusAttentionTracking = () => {
    if (checkinStatusAttentionCleanup) {
        checkinStatusAttentionCleanup();
        checkinStatusAttentionCleanup = null;
    }
};

const ensureCheckinStatusAttentionTracking = () => {
    if (
        checkinStatusAttentionCleanup ||
        checkinStatusSubscribers.size === 0 ||
        typeof window === 'undefined' ||
        typeof document === 'undefined'
    ) {
        return;
    }

    const refreshOnAttention = () => {
        const now = Date.now();
        if (now - lastCheckinStatusAttentionAt < CHECKIN_STATUS_ATTENTION_THROTTLE_MS) {
            return;
        }
        lastCheckinStatusAttentionAt = now;
        void getCheckinStatus({ force: true });
    };

    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            refreshOnAttention();
        }
    };

    window.addEventListener('focus', refreshOnAttention);
    document.addEventListener('visibilitychange', handleVisibility);

    checkinStatusAttentionCleanup = () => {
        window.removeEventListener('focus', refreshOnAttention);
        document.removeEventListener('visibilitychange', handleVisibility);
    };
};

const getCurrentSessionUser = async () => {
    return getSupabaseUser();
};

const getSessionAuthHeader = async () => {
    if (!supabase) throw new Error("No Database");
    return getSupabaseAuthHeader();
};

const normalizeHistoryDescription = (entry: any): string => {
    const directDescription =
        entry?.description ||
        entry?.reason ||
        entry?.note ||
        entry?.action ||
        entry?.details;

    if (typeof directDescription === 'string' && directDescription.trim()) {
        return directDescription;
    }

    const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    if (typeof metadata.tool_name === 'string' && metadata.tool_name.trim()) {
        return metadata.tool_name;
    }

    if (typeof metadata.tool_id === 'string' && metadata.tool_id.trim()) {
        return metadata.tool_id;
    }

    if (entry?.reference_type === 'generated_image_charge') {
        return 'Su dung AI';
    }

    if (entry?.reference_type === 'generated_image_refund') {
        return 'Hoan Vcoin';
    }

    return 'Giao dich he thong';
};

const normalizeHistoryType = (value: any): HistoryItem['type'] => {
    switch (value) {
        case 'topup':
        case 'usage':
        case 'reward':
        case 'giftcode':
        case 'refund':
        case 'pending_topup':
        case 'admin_adjustment':
            return value;
        default:
            return 'usage';
    }
};

const mapPaymentTransactionToHistoryItem = (tx: any): HistoryItem => ({
    id: tx.id,
    createdAt: tx.created_at,
    description: `Nap Vcoin (${tx.order_code})`,
    vcoinChange: Number(tx.vcoin_received || 0),
    amountVnd: Number(tx.amount_vnd || 0),
    type: tx.status === 'paid' ? 'topup' : 'pending_topup',
    status: tx.status === 'paid' ? 'success' : tx.status === 'pending' ? 'pending' : 'failed',
    code: tx.order_code
});

const mapVcoinTransactionToHistoryItem = (log: any): HistoryItem => ({
    id: log.id,
    createdAt: log.created_at,
    description: normalizeHistoryDescription(log),
    vcoinChange: Number(log.amount || 0),
    type: normalizeHistoryType(log.type),
    status: 'success'
});

// --- USER & PROFILE ---

export const getUserProfile = async (options?: { force?: boolean }): Promise<UserProfile> => {
    if (!supabase) throw new Error("No Database");

    const forceRefresh = options?.force === true;
    const user = await getCurrentSessionUser();
    if (!user) throw new Error("Not logged in");

    if (!forceRefresh && userProfileCache && userProfileCache.userId === user.id && userProfileCache.expiresAt > Date.now()) {
        return userProfileCache.value;
    }

    if (!forceRefresh && userProfilePromise) {
        return userProfilePromise;
    }

    userProfilePromise = (async () => {
        let data: any = null;
        let error: { message?: string } | null = null;

        try {
            const response = await readWithRetry<{ data: any; error: { message?: string } | null }>(
                () => supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle(),
                'Fetching user profile',
            );
            data = response.data;
            error = response.error;
        } catch (readError: any) {
            console.error("Error fetching user profile:", readError);
            const cachedProfile = userProfileCache;
            if (cachedProfile && cachedProfile.userId === user.id) {
                return cachedProfile.value;
            }
            throw new Error("Failed to fetch user profile: " + (readError?.message || 'Network error'));
        }

        if (error) {
            console.error("Error fetching user profile:", error);
            const cachedProfile = userProfileCache;
            if (cachedProfile && cachedProfile.userId === user.id) {
                return cachedProfile.value;
            }
            throw new Error("Failed to fetch user profile: " + error.message);
        }

        let profile: UserProfile;

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

            profile = {
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
        } else {
            profile = {
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
        }

        userProfileCache = {
            userId: user.id,
            value: profile,
            expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
        };

        return profile;
    })();

    try {
        return await userProfilePromise;
    } finally {
        userProfilePromise = null;
    }
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

export const getModelPricing = async (options?: { force?: boolean }): Promise<ModelPricing[]> => {
  if (!supabase) return [];
  if (!options?.force && modelPricingCache && modelPricingCache.expiresAt > Date.now()) {
    return modelPricingCache.value;
  }
  let data: ModelPricing[] | null = null;
  let error: { message?: string } | null = null;
  try {
    const response = await readWithRetry<{ data: ModelPricing[] | null; error: { message?: string } | null }>(
      () => supabase.from('model_pricing').select('*'),
      'Fetching model pricing',
    );
    data = response.data;
    error = response.error;
  } catch (readError) {
    console.error('Error fetching model pricing:', readError);
    return [];
  }
  if (error) {
    console.error('Error fetching model pricing:', error);
    return [];
  }
  const value = data || [];
  modelPricingCache = {
    value,
    expiresAt: Date.now() + MODEL_PRICING_CACHE_TTL_MS,
  };
  return value;
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
  invalidateModelPricingCache();
  return { success: true };
};

export const getTstServerAvailabilityConfig = async (options?: { force?: boolean }): Promise<TstServerAvailabilityConfig> => {
  if (!supabase) return DEFAULT_TST_SERVER_AVAILABILITY_CONFIG;
  if (!options?.force && tstServerAvailabilityCache && tstServerAvailabilityCache.expiresAt > Date.now()) {
    return tstServerAvailabilityCache.value;
  }
  let data: { value?: unknown } | null = null;
  let error: { message?: string } | null = null;
  try {
    const response = await readWithRetry<{ data: { value?: unknown } | null; error: { message?: string } | null }>(
      () =>
        supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'tst_server_availability')
          .maybeSingle(),
      'Fetching TST server availability config',
    );
    data = response.data;
    error = response.error;
  } catch (readError) {
    console.error('Error fetching TST server availability config:', readError);
    return DEFAULT_TST_SERVER_AVAILABILITY_CONFIG;
  }

  if (error) {
    console.error('Error fetching TST server availability config:', error);
    return DEFAULT_TST_SERVER_AVAILABILITY_CONFIG;
  }

  const parsed = parseSettingValue<TstServerAvailabilityConfig>(data?.value, DEFAULT_TST_SERVER_AVAILABILITY_CONFIG);
  const value = {
    disabledByModel: parsed?.disabledByModel || {},
    autoDisabledCombos: parsed?.autoDisabledCombos || {},
    manualReopenedCombos: parsed?.manualReopenedCombos || {},
    updatedAt: parsed?.updatedAt,
  };
  tstServerAvailabilityCache = {
    value,
    expiresAt: Date.now() + TST_SERVER_AVAILABILITY_CACHE_TTL_MS,
  };
  return value;
};

export const saveTstServerAvailabilityConfig = async (
  config: TstServerAvailabilityConfig,
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'No Database' };

  const payload: TstServerAvailabilityConfig = {
    disabledByModel: config?.disabledByModel || {},
    autoDisabledCombos: config?.autoDisabledCombos || {},
    manualReopenedCombos: config?.manualReopenedCombos || {},
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

  invalidateTstServerAvailabilityCache();
  return { success: true };
};

export const syncTSTPrices = async (): Promise<{success: boolean, error?: string, data?: any[]}> => {
  if (!supabase) return { success: false, error: "No Database" };

  try {
    const [rawPricing, runtimeModels] = await Promise.all([fetchTstPricing(true), fetchTstModels(true)]);
    const livePricing = filterAdminManagedPricingEntries(
      sanitizePricingEntriesWithRuntimeModels(rawPricing, runtimeModels),
    );
    const currentPricing = await getModelPricing({ force: true });
    const currentPricingMap = new Map(
      currentPricing.map((row) => [`${row.model_id}::${row.option_id}`, row]),
    );

    const runtimeTypeByModel = new Map(runtimeModels.map((model) => [model.model, model.type]));
    const rows = livePricing.map((entry) => {
      const type = runtimeTypeByModel.get(entry.model);
      const isPerSecond = isPerSecondBillingModel(entry.model, type === 'motion-control' ? 'motion-control' : type === 'video' ? 'video' : undefined);
      const optionId = isPerSecond
        ? getPerSecondPricingKey({
            modelId: entry.model,
            serverId: entry.server,
            resolution: entry.resolution,
            speed: entry.speed,
            audio: entry.audio,
          })
        : entry.config_key || [
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

    const manualVertexRows = getVertexEditPricingRows().map((row) => ({
      model_id: row.modelId,
      option_id: row.configKey,
      tst_price_credits: row.credits,
      audition_price_vcoin:
        currentPricingMap.get(`${row.modelId}::${row.configKey}`)?.audition_price_vcoin ??
        row.defaultAuditionVcoin ??
        row.vcoin,
      updated_at: new Date().toISOString(),
    }));

    const allRows = [...rows, ...manualVertexRows];

    const validKeys = new Set(allRows.map((row) => row.model_id + '::' + row.option_id));
    const staleIds = currentPricing
      .filter((row) => !isAdminManagedPricingModel(row.model_id) || !validKeys.has(row.model_id + '::' + row.option_id))
      .map((row) => row.id)
      .filter(Boolean);

    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from('model_pricing').delete().in('id', staleIds);
      if (deleteError) throw deleteError;
    }

    for (const row of allRows) {
      const { error } = await supabase.from('model_pricing').upsert(row, { onConflict: 'model_id, option_id' });
      if (error) throw error;
    }

    invalidateModelPricingCache();
    return { success: true, data: await getModelPricing({ force: true }) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const updateLastActive = async () => {
    if (!supabase) return;
    if (Date.now() - lastActiveUpdateAt < 60_000) return;
    try {
        const user = await getCurrentSessionUser();
        if (user) {
            lastActiveUpdateAt = Date.now();
            await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', user.id);
            const cachedProfile = userProfileCache;
            if (cachedProfile && cachedProfile.userId === user.id) {
                userProfileCache = {
                    userId: cachedProfile.userId,
                    value: {
                        ...cachedProfile.value,
                        lastActive: new Date().toISOString(),
                    },
                    expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
                };
            }
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
        invalidateUserProfileCache();
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const updateAdminUserProfile = async (
    profile: UserProfile,
    options: { adjustmentReason?: string } = {},
): Promise<{success: boolean, error?: string}> => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { data: currentProfile, error: currentProfileError } = await supabase
            .from('users')
            .select('vcoin_balance')
            .eq('id', profile.id)
            .maybeSingle();

        if (currentProfileError) throw currentProfileError;

        const currentBalance = Number(currentProfile?.vcoin_balance || 0);
        const nextBalance = Number(profile.vcoin_balance || 0);
        const balanceDelta = nextBalance - currentBalance;

        const { error } = await supabase
            .from('users')
            .update({
                display_name: profile.username,
                photo_url: profile.avatar
            })
            .eq('id', profile.id);
        
        if (error) throw error;

        if (Math.abs(balanceDelta) > 0.0001) {
            const adjustmentReason = options.adjustmentReason?.trim() || `Admin adjustment: ${currentBalance} -> ${nextBalance} VCoin`;
            const { error: balanceError } = await supabase.rpc('apply_balance_transaction', {
                p_target_user_id: profile.id,
                p_amount: balanceDelta,
                p_reason: adjustmentReason,
                p_log_type: 'admin_adjustment',
                p_reference_type: 'admin_adjustment',
                p_reference_id: `${profile.id}:${Date.now()}`,
                p_metadata: {
                    previous_balance: currentBalance,
                    next_balance: nextBalance,
                    admin_note: adjustmentReason,
                    source: 'admin_user_profile',
                },
            });

            if (balanceError) throw balanceError;
        }

        invalidateUserProfileCache();
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

const reconcileCurrentUserBalanceFromLedger = async () => {
    if (!supabase) return { repaired: false, delta: 0, ledgerBalance: 0, currentBalance: 0 };

    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser?.id) {
        return { repaired: false, delta: 0, ledgerBalance: 0, currentBalance: 0 };
    }

    const pageSize = 1000;
    let from = 0;
    let ledgerBalance = 0;

    while (true) {
        const { data, error } = await supabase
            .from('vcoin_transactions')
            .select('amount')
            .eq('user_id', sessionUser.id)
            .range(from, from + pageSize - 1);

        if (error) {
            throw error;
        }

        const rows = data || [];
        ledgerBalance += rows.reduce((sum: number, row: any) => sum + Number(row?.amount || 0), 0);

        if (rows.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('vcoin_balance')
        .eq('id', sessionUser.id)
        .maybeSingle();

    if (userError) {
        throw userError;
    }

    const currentBalance = Number(userRow?.vcoin_balance || 0);
    const delta = ledgerBalance - currentBalance;
    const repaired = delta > 0.0001;
    const effectiveBalance = repaired ? ledgerBalance : currentBalance;

    // Only top up when the ledger is ahead of the stored balance.
    // Do not lower a balance here, because admin/manual adjustments may not have
    // been backfilled into vcoin_transactions yet.
    if (repaired) {
        const { error: updateError } = await supabase
            .from('users')
            .update({ vcoin_balance: ledgerBalance })
            .eq('id', sessionUser.id);

        if (updateError) {
            throw updateError;
        }

        invalidateUserProfileCache();
        window.dispatchEvent(new Event('balance_updated'));

        return {
            repaired: true,
            delta,
            ledgerBalance,
            currentBalance,
            effectiveBalance,
        };
    }

    return {
        repaired: false,
        delta,
        ledgerBalance,
        currentBalance,
        effectiveBalance,
    };
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
        const { data, error } = await supabase.rpc('apply_balance_transaction', {
            p_target_user_id: userId,
            p_amount: amount,
            p_reason: reason,
            p_log_type: type,
            p_reference_type: options.referenceType ?? null,
            p_reference_id: options.referenceId ?? null,
            p_metadata: options.metadata ?? {},
        });

        if (!error) {
            const sessionUser = await getCurrentSessionUser().catch(() => null);
            if (!options.targetUserId || sessionUser?.id === userId) {
                await reconcileCurrentUserBalanceFromLedger().catch((reconcileError) => {
                    console.warn('[Economy] Failed to reconcile balance after RPC update', reconcileError);
                });
                invalidateUserProfileCache();
                window.dispatchEvent(new Event('balance_updated'));
            }
            return;
        }

        console.warn("[Economy] apply_balance_transaction RPC failed, falling back to legacy flow", error, data);
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
        const sessionUser = await getCurrentSessionUser().catch(() => null);
        const canDirectlyRepairCurrentUser = sessionUser?.id === userId;

        if (canDirectlyRepairCurrentUser) {
            const { data: latestUser, error: fetchError } = await supabase.from('users').select('vcoin_balance').eq('id', userId).maybeSingle();
            if (fetchError) throw fetchError;
            const currentBalance = Number(latestUser?.vcoin_balance || 0);
            const newBalance = currentBalance + amount;
            const { error: directError } = await supabase.from('users').update({ vcoin_balance: newBalance }).eq('id', userId);
            if (directError) throw directError;
        } else {
            const { error } = await supabase.rpc('secure_update_balance', {
                amount: amount,
                reason: reason,
                log_type: type
            });

            if (error) throw error;
        }
    } catch (e: any) {
        console.error("[Economy] Critical: Failed to update balance", e);
        throw new Error("Failed to update balance: " + e.message);
    }
    
    const sessionUser = await getCurrentSessionUser().catch(() => null);
    if (!options.targetUserId || sessionUser?.id === userId) {
        await reconcileCurrentUserBalanceFromLedger().catch((reconcileError) => {
            console.warn('[Economy] Failed to reconcile balance after legacy update', reconcileError);
        });
        invalidateUserProfileCache();
        window.dispatchEvent(new Event('balance_updated'));
    }
};

export const logVisit = async () => {
    if (!supabase) return;
    try {
        const route = window.location.pathname + window.location.hash;
        const visitThrottleKey = `auditionai:last-visit:${route}`;
        const lastVisitAtRaw = window.localStorage.getItem(visitThrottleKey);
        const lastVisitAt = lastVisitAtRaw ? Number(lastVisitAtRaw) : 0;
        if (Number.isFinite(lastVisitAt) && lastVisitAt > 0 && Date.now() - lastVisitAt < VISIT_LOG_THROTTLE_MS) {
            return;
        }

        let userId: string | null = null;
        try {
            userId = (await getCurrentSessionUser())?.id || null;
        } catch {}

        const visitData = {
            user_id: userId,
            visit_date: new Date().toISOString().slice(0, 10),
            route,
            user_agent: navigator.userAgent || null
        };
        const { error } = await supabase.from('app_visits').insert(visitData);
        
        if (error && error.message.includes('column "user_id" does not exist')) {
            await supabase.from('app_visits').insert({ uid: null });
        }

        if (!error) {
            window.localStorage.setItem(visitThrottleKey, String(Date.now()));
        }
    } catch(e) {
        // Silent
    }
};

// --- PACKAGES & PROMOTIONS ---

export const getPackages = async (): Promise<CreditPackage[]> => {
    if (!supabase) return [];
    if (packageCache && packageCache.expiresAt > Date.now()) {
        return packageCache.value;
    }
    const { data } = await supabase
        .from('credit_packages')
        .select('id, name, credits_amount, price_vnd, tag, bonus_credits, is_featured, is_active, display_order, transfer_syntax')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
        
    if (!data) return [];
    
    const value = data.map((p: any) => ({
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
    packageCache = {
        value,
        expiresAt: Date.now() + PACKAGE_CACHE_TTL_MS,
    };
    return value;
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
        invalidatePackageCache();
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
            invalidatePackageCache();
            return { success: true, action: 'hidden' };
        }
        invalidatePackageCache();
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
        invalidatePackageCache();
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export const getActivePromotion = async (): Promise<PromotionCampaign | null> => {
    if (!supabase) return null;
    if (promotionCache && promotionCache.expiresAt > Date.now()) {
        return promotionCache.value;
    }
    const now = new Date().toISOString();
    try {
        const { data, error } = await supabase
            .from('promotions')
            .select('*')
            .eq('is_active', true)
            .lt('start_time', now)
            .gt('end_time', now)
            .maybeSingle();
            
        if (error || !data) {
            promotionCache = {
                value: null,
                expiresAt: Date.now() + PROMOTION_CACHE_TTL_MS,
            };
            return null;
        }

        const value = {
            id: data.id,
            name: data.title || 'Event',
            marqueeText: data.description || '',
            bonusPercent: data.bonus_percent || 0,
            startTime: data.start_time,
            endTime: data.end_time,
            isActive: data.is_active
        };
        promotionCache = {
            value,
            expiresAt: Date.now() + PROMOTION_CACHE_TTL_MS,
        };
        return value;
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
        invalidatePromotionCache();
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
        invalidatePromotionCache();
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

// --- HELPER ---
export const getLocalTodayStr = () => {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
};

const shiftDateStr = (dateStr: string, days: number) => {
    const date = new Date(`${dateStr}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

const calculateConsecutiveStreak = (dates: string[], today: string) => {
    const dateSet = new Set(dates);
    let cursor = dateSet.has(today) ? today : shiftDateStr(today, -1);
    let streak = 0;

    while (dateSet.has(cursor)) {
        streak += 1;
        cursor = shiftDateStr(cursor, -1);
    }

    return {
        streak,
        streakStartedOn: streak > 0 ? shiftDateStr(cursor, 1) : null,
    };
};

const getLocalDayBoundaryIso = (dateStr: string, boundary: 'start' | 'end') => {
    const suffix = boundary === 'start' ? 'T00:00:00.000' : 'T23:59:59.999';
    return new Date(`${dateStr}${suffix}`).toISOString();
};

const getNextMonthStartIso = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map((value) => Number(value));
    return new Date(year, month, 1, 0, 0, 0, 0).toISOString();
};

type RewardRepairWindow = {
    startAt: string;
    endAt?: string;
};

const hasRewardLog = async (
    userId: string,
    referenceType: string,
    referenceId: string,
    legacyDescription: string,
    window: RewardRepairWindow,
) => {
    if (!supabase) return false;

    try {
        const { data, error } = await supabase
            .from('vcoin_transactions')
            .select('id')
            .eq('user_id', userId)
            .eq('reference_type', referenceType)
            .eq('reference_id', referenceId)
            .limit(1);

        if (!error && (data?.length || 0) > 0) {
            return true;
        }
    } catch (error) {
        console.warn('[Checkin] Failed to verify reward log by reference', error);
    }

    try {
        let query = supabase
            .from('vcoin_transactions')
            .select('id')
            .eq('user_id', userId)
            .eq('type', 'reward')
            .eq('description', legacyDescription)
            .gte('created_at', window.startAt);

        if (window.endAt) {
            query = query.lt('created_at', window.endAt);
        }

        const { data, error } = await query.limit(1);
        if (error) {
            throw error;
        }

        return (data?.length || 0) > 0;
    } catch (error) {
        console.warn('[Checkin] Failed to verify legacy reward log', error);
        return false;
    }
};

const ensureRewardApplied = async ({
    userId,
    amount,
    reason,
    referenceType,
    referenceId,
    metadata,
    repairWindow,
}: {
    userId: string;
    amount: number;
    reason: string;
    referenceType: string;
    referenceId: string;
    metadata?: Record<string, any>;
    repairWindow: RewardRepairWindow;
}) => {
    const alreadyApplied = await hasRewardLog(userId, referenceType, referenceId, reason, repairWindow);
    if (alreadyApplied) {
        const sessionUser = await getCurrentSessionUser().catch(() => null);
        if (sessionUser?.id === userId) {
            await reconcileCurrentUserBalanceFromLedger().catch((reconcileError) => {
                console.warn('[Checkin] Failed to reconcile existing reward balance drift', reconcileError);
            });
        }
        return false;
    }

    await updateUserBalance(amount, reason, 'reward', {
        targetUserId: userId,
        referenceType,
        referenceId,
        metadata,
    });

    return true;
};

// --- CHECKIN & REWARDS ---

export const getCheckinStatus = async (options?: { force?: boolean }): Promise<CheckinStatusState> => {
    if (!supabase) return DEFAULT_CHECKIN_STATUS;
    const user = await getCurrentSessionUser();
    if (!user) return DEFAULT_CHECKIN_STATUS;

    const forceRefresh = options?.force === true;
    if (!forceRefresh && checkinStatusCache && checkinStatusCache.userId === user.id && checkinStatusCache.expiresAt > Date.now()) {
        return checkinStatusCache.value;
    }
    if (!forceRefresh && checkinStatusPromise) {
        return checkinStatusPromise;
    }

    checkinStatusPromise = (async () => {
        const today = getLocalTodayStr();
        const { data: checkins, error: checkinError } = await supabase
            .from('daily_check_ins')
            .select('check_in_date')
            .eq('user_id', user.id);

        if (checkinError) {
            throw new Error(checkinError.message);
        }

        const history = checkins?.map((r: any) => String(r.check_in_date)) || [];
        const { streak, streakStartedOn } = calculateConsecutiveStreak(history, today);
        const milestoneResponse = streakStartedOn
            ? await supabase
                .from('milestone_claims')
                .select('day_milestone')
                .eq('user_id', user.id)
                .eq('streak_started_on', streakStartedOn)
            : { data: [], error: null };
        const { data: milestones, error: milestoneError } = milestoneResponse;

        if (milestoneError) {
            throw new Error(milestoneError.message);
        }

        const value: CheckinStatusState = {
            streak,
            isCheckedInToday: history.includes(today),
            history,
            claimedMilestones: milestones?.map((m: any) => m.day_milestone) || [],
        };

        return setSharedCheckinStatus(user.id, value);
    })();

    try {
        return await checkinStatusPromise;
    } finally {
        checkinStatusPromise = null;
    }
};

export const subscribeCheckinStatus = (
    subscriber: (value: CheckinStatusState) => void,
    options?: { force?: boolean }
) => {
    checkinStatusSubscribers.add(subscriber);
    ensureCheckinStatusAttentionTracking();

    if (options?.force !== true && checkinStatusCache && checkinStatusCache.expiresAt > Date.now()) {
        subscriber(checkinStatusCache.value);
    } else {
        void getCheckinStatus(options).catch(() => subscriber(DEFAULT_CHECKIN_STATUS));
    }

    return () => {
        checkinStatusSubscribers.delete(subscriber);
        if (checkinStatusSubscribers.size === 0) {
            stopCheckinStatusAttentionTracking();
        }
    };
};

export const performCheckin = async (): Promise<{success: boolean, reward: number, newStreak: number, message?: string}> => {
    if (!supabase) return { success: false, reward: 0, newStreak: 0, message: "No Database" };
    trackEvent('daily_checkin_start');

    try {
        const response = await fetch('/api/checkin-reward', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(await getSessionAuthHeader()),
            },
            body: JSON.stringify({ action: 'daily' }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.message || payload?.error || 'Check-in request failed');
        }

        invalidateCheckinStatusCache();
        invalidateUserProfileCache();
        const refreshedStatus = await getCheckinStatus({ force: true }).catch(() => DEFAULT_CHECKIN_STATUS);
        window.dispatchEvent(new Event('balance_updated'));

        const result = {
            success: Boolean(payload?.success),
            reward: Number(payload?.reward || 0),
            newStreak: Number(payload?.newStreak || refreshedStatus.streak || 0),
            message: payload?.message,
        };
        trackEvent(result.success ? 'daily_checkin_success' : 'daily_checkin_no_reward', {
            reward_vcoin: result.reward,
            streak: result.newStreak,
        });
        return result;
    } catch (e: any) {
        trackEvent('daily_checkin_error', {
            error_message: e?.message?.slice?.(0, 120) || 'unknown',
        });
        return { success: false, reward: 0, newStreak: 0, message: e.message };
    }
};

export const claimMilestoneReward = async (day: number): Promise<{success: boolean, message: string}> => {
    if (!supabase) return { success: false, message: "No Database" };
    trackEvent('milestone_reward_claim_start', { day });
    try {
        const response = await fetch('/api/checkin-reward', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(await getSessionAuthHeader()),
            },
            body: JSON.stringify({ action: 'milestone', day }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.message || payload?.error || 'Milestone request failed');
        }

        invalidateCheckinStatusCache();
        invalidateUserProfileCache();
        await getCheckinStatus({ force: true }).catch(() => DEFAULT_CHECKIN_STATUS);
        window.dispatchEvent(new Event('balance_updated'));

        const result = {
            success: Boolean(payload?.success),
            message: payload?.message || ''
        };
        trackEvent(result.success ? 'milestone_reward_claim_success' : 'milestone_reward_claim_no_reward', { day });
        return result;
    } catch (e: any) {
        trackEvent('milestone_reward_claim_error', {
            day,
            error_message: e?.message?.slice?.(0, 120) || 'unknown',
        });
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
const SERVICE_ACCOUNT_SOFT_COOLDOWN_MS = 2 * 60 * 1000;

const isServiceAccountJson = (value: string) =>
    value.includes('project_id') && value.includes('private_key') && value.includes('client_email');

export const isKeyDisabled = (key: string): boolean => {
    return temporarilyDisabledKeys.has(key);
};

export const reportKeyFailure = (key: string) => {
    if (!key) return;
    const shortKey = key.substring(0, 4) + '...' + key.slice(-4);
    console.warn(`[System] ðŸ”´ API Key ${shortKey} failed (429/503). Temporarily disabling for 1 minute.`);
    temporarilyDisabledKeys.add(key);
    
    // Also max out its usage stats so it's deprioritized
    keyUsageStats.set(key, {
        usageCount: MAX_REQ_PER_MIN,
        resetAt: Date.now() + KEY_COOLDOWN_MS
    });

    setTimeout(() => {
        temporarilyDisabledKeys.delete(key);
        console.log(`[System] ðŸŸ¢ API Key ${shortKey} is back in rotation.`);
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

        const serviceAccountKeys = allKeys.filter((k: any) =>
            typeof k.key_value === 'string' &&
            isServiceAccountJson(k.key_value) &&
            !temporarilyDisabledKeys.has(k.key_value) &&
            !excludedKeys.includes(k.key_value)
        );

        if (serviceAccountKeys.length > 0) {
            const sortedServiceAccounts = [...serviceAccountKeys].sort((a: any, b: any) => {
                const aLastUsed = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
                const bLastUsed = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
                const aIsCoolingAfterFailure = aLastUsed > now;
                const bIsCoolingAfterFailure = bLastUsed > now;
                const aIsWarm = !aIsCoolingAfterFailure && aLastUsed > 0 && now - aLastUsed < SERVICE_ACCOUNT_SOFT_COOLDOWN_MS;
                const bIsWarm = !bIsCoolingAfterFailure && bLastUsed > 0 && now - bLastUsed < SERVICE_ACCOUNT_SOFT_COOLDOWN_MS;

                if (aIsCoolingAfterFailure !== bIsCoolingAfterFailure) {
                    return aIsCoolingAfterFailure ? 1 : -1;
                }

                if (aIsWarm !== bIsWarm) {
                    return aIsWarm ? 1 : -1;
                }

                return aLastUsed - bLastUsed;
            });

            const selectedServiceAccount = sortedServiceAccounts[0];
            lastUsedKey = selectedServiceAccount.key_value;
            supabase
                .from('api_keys')
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', selectedServiceAccount.id)
                .then(() => {});

            return selectedServiceAccount.key_value;
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

const SHELL_OVERRIDE_STORAGE_KEY = 'auditionai:shell-override';
const PENDING_SEPAY_ORDERS_STORAGE_KEY = 'auditionai:pending-sepay-orders';
const PHONE_USER_AGENT_PATTERN = /iphone|ipod|android.+mobile|windows phone|blackberry|opera mini|mobile safari/i;

const shouldPreferMobileShell = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('desktop') === '1') return false;
    if (params.get('mobile') === '1') return true;

    const savedOverride = window.localStorage.getItem(SHELL_OVERRIDE_STORAGE_KEY);
    if (savedOverride === 'mobile') return true;
    if (savedOverride === 'desktop') return false;

    const navigatorWithUAData = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    if (typeof navigatorWithUAData.userAgentData?.mobile === 'boolean') {
        return navigatorWithUAData.userAgentData.mobile;
    }

    return PHONE_USER_AGENT_PATTERN.test(navigator.userAgent.toLowerCase());
};

const buildPaymentReturnUrls = () => {
    const baseUrl = new URL('/topup', window.location.origin);
    const cancelUrl = new URL('/topup', window.location.origin);

    if (shouldPreferMobileShell()) {
        baseUrl.searchParams.set('mobile', '1');
        cancelUrl.searchParams.set('mobile', '1');
    }

    return {
        returnUrl: baseUrl.toString(),
        cancelUrl: cancelUrl.toString(),
    };
};

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
    const analyticsBase = {
        package_id: packageId,
        package_price_vnd: pkg.price,
        package_vcoin: pkg.vcoin,
        bonus_percent: activeBonusPercent,
        total_vcoin: totalCoins,
    };
    trackEvent('topup_checkout_start', analyticsBase);
    
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

    // Call Cloud Function to get SePay checkout URL.
    try {
        const { returnUrl, cancelUrl } = buildPaymentReturnUrls();
        const res = await fetch('/api/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: pkg.price,
                description: `AI${String(providerOrderCode).slice(-7)}`,
                orderCode: providerOrderCode,
                transactionId: data.id,
                returnUrl,
                cancelUrl,
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
        const paymentData = await res.json();

        if (!res.ok || !paymentData?.checkoutUrl) {
            throw new Error(paymentData?.desc || paymentData?.error || 'Failed to create payment checkout URL');
        }

        const paymentMethod = 'sepay';
        if (typeof window !== 'undefined') {
            try {
                window.sessionStorage.setItem(
                    `auditionai:pending-payment:${orderCode}`,
                    JSON.stringify({
                        orderCode,
                        amount: pkg.price,
                        vcoin: totalCoins,
                        packageName: pkg.name,
                        paymentMethod,
                    }),
                );
                const rawPendingOrders = window.localStorage.getItem(PENDING_SEPAY_ORDERS_STORAGE_KEY);
                const pendingOrders = rawPendingOrders ? JSON.parse(rawPendingOrders) : [];
                const nextPendingOrders = [
                    ...(Array.isArray(pendingOrders) ? pendingOrders : []),
                    {
                        orderCode,
                        transactionId: data.id,
                        createdAt: Date.now(),
                        amount: pkg.price,
                        vcoin: totalCoins,
                        packageName: pkg.name,
                    },
                ].filter((item, index, all) =>
                    item?.orderCode &&
                    all.findIndex((candidate) => String(candidate?.orderCode) === String(item.orderCode)) === index
                ).slice(-12);
                window.localStorage.setItem(PENDING_SEPAY_ORDERS_STORAGE_KEY, JSON.stringify(nextPendingOrders));
            } catch (storageError) {
                console.warn('Failed to persist pending payment metadata', storageError);
            }
        }

        await supabase
            .from('payment_transactions')
            .update({
                checkout_url: paymentData.checkoutUrl,
                provider_payment_link_id: paymentData.paymentLinkId || null,
                payment_method: paymentMethod,
            })
            .eq('id', data.id);
        
        // Update transaction with checkoutUrl if needed, or just return it
        trackEvent('topup_checkout_created', {
            ...analyticsBase,
            payment_method: paymentMethod,
        });
        return {
            id: data.id,
            userId: user.id,
            packageId,
            amount: pkg.price,
            vcoin_received: totalCoins,
            status: 'pending',
            createdAt: data.created_at,
            paymentMethod,
            code: orderCode,
            order_code: orderCode,
            checkoutUrl: paymentData.checkoutUrl
        };
    } catch (e) {
        console.warn("Payment gateway generation failed, using manual mode", e);
        trackEvent('topup_checkout_manual_fallback', {
            ...analyticsBase,
            error_message: e instanceof Error ? e.message.slice(0, 120) : 'unknown',
        });
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
        .select('id, created_at, order_code, vcoin_received, amount_vnd, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(USER_HISTORY_FETCH_LIMIT);

    // 2. Get Usage/Reward Logs
    const { data: logs } = await supabase
        .from('vcoin_transactions')
        .select('id, created_at, amount, type, description, metadata, reference_type')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(USER_HISTORY_FETCH_LIMIT);

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
        // Top-up logs are already represented by payment_transactions.
        // Showing both creates duplicate successful top-up rows in the Vcoin history.
        if (String(l.type || '').toLowerCase() === 'topup') {
            return;
        }

        history.push({
            id: l.id,
            createdAt: l.created_at,
            description: l.description || l.reason || l.note || l.action || l.details || 'Giao dịch hệ thống',
            vcoinChange: l.amount, // Amount is already signed (negative for usage)
            type: l.type || 'usage', // Fallback to usage if type is missing (for legacy logs)
            status: 'success'
        });
    });

    return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getAdminUserHistory = async (targetUserId: string): Promise<HistoryItem[]> => {
    if (!targetUserId) return [];

    const authHeader = await getSessionAuthHeader();
    const response = await fetch(`/api/admin-user-history?userId=${encodeURIComponent(targetUserId)}`, {
        method: 'GET',
        headers: authHeader,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Khong the tai lich su nguoi dung');
    }

    return Array.isArray(payload?.history) ? payload.history : [];
};

const EMPTY_ADMIN_QUEUE_SUMMARY: AdminQueueSummary = {
    total: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    overduePolls: 0,
    untouchedQueued: 0,
    stalledPreDispatch: 0,
};

const normalizeAdminQueueSummary = (value: Partial<AdminQueueSummary> | null | undefined): AdminQueueSummary => ({
    total: Number(value?.total || 0),
    queued: Number(value?.queued || 0),
    processing: Number(value?.processing || 0),
    completed: Number(value?.completed || 0),
    failed: Number(value?.failed || 0),
    overduePolls: Number(value?.overduePolls || 0),
    untouchedQueued: Number(value?.untouchedQueued || 0),
    stalledPreDispatch: Number(value?.stalledPreDispatch || 0),
});

export const getAdminQueueJobs = async (params?: {
    search?: string;
    email?: string;
    userId?: string;
    status?: 'all' | 'queued' | 'processing' | 'completed' | 'failed' | 'rescuing';
    assetType?: 'all' | 'image' | 'video';
    timeScope?: 'today' | 'all';
    stage?: string;
    stuckOnly?: boolean;
    limit?: number;
}): Promise<{ jobs: AdminQueueJob[]; summary: AdminQueueSummary }> => {
    const authHeader = await getSessionAuthHeader();
    const search = new URLSearchParams();

    if (params?.search) search.set('search', params.search);
    if (params?.email) search.set('email', params.email);
    if (params?.userId) search.set('userId', params.userId);
    if (params?.status) search.set('status', params.status);
    if (params?.assetType) search.set('assetType', params.assetType);
    if (params?.timeScope) search.set('timeScope', params.timeScope);
    if (params?.stage) search.set('stage', params.stage);
    if (typeof params?.stuckOnly === 'boolean') search.set('stuckOnly', String(params.stuckOnly));
    if (typeof params?.limit === 'number') search.set('limit', String(params.limit));

    const response = await fetch(`/api/admin-queue-jobs?${search.toString()}`, {
        method: 'GET',
        headers: authHeader,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Khong the tai queue jobs');
    }

    return {
        jobs: Array.isArray(payload?.jobs) ? payload.jobs : [],
        summary: normalizeAdminQueueSummary(payload?.summary || EMPTY_ADMIN_QUEUE_SUMMARY),
    };
};

export const getAdminQueueHealthReport = async (): Promise<AdminQueueHealthReport> => {
    const authHeader = await getSessionAuthHeader();
    const response = await fetch('/api/admin-queue-health-report', {
        method: 'GET',
        headers: authHeader,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Khong the tai queue health report');
    }

    return payload as AdminQueueHealthReport;
};

export const runAdminQueueReconcile = async () => {
    const authHeader = await getSessionAuthHeader();
    const response = await fetch('/api/queue-reconcile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader,
        },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Khong the reconcile queue');
    }

    return payload;
};

export const forceRescueFailedQueueJobs = async (params?: {
    server?: string;
    assetType?: 'image' | 'video' | 'all';
    lookbackHours?: number;
    limit?: number;
    jobId?: string;
    idPrefix?: string;
}): Promise<AdminQueueRescueResult> => {
    const authHeader = await getSessionAuthHeader();
    const response = await fetch('/api/force-rescue-failed-jobs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader,
        },
        body: JSON.stringify({
            lookbackHours: params?.lookbackHours ?? 168,
            limit: params?.limit ?? 50,
            server: params?.server,
            assetType: params?.assetType ?? 'all',
            jobId: params?.jobId,
            idPrefix: params?.idPrefix,
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Khong the rescue failed queue jobs');
    }

    return payload as AdminQueueRescueResult;
};

export const getAdminQueueJobDetail = async (jobId: string): Promise<AdminQueueJobDetail> => {
    const authHeader = await getSessionAuthHeader();
    const response = await fetch(`/api/admin-queue-job-detail?jobId=${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers: authHeader,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Khong the tai chi tiet queue job');
    }

    return payload as AdminQueueJobDetail;
};

export const stopAdminQueueJob = async (jobId: string) => {
    const authHeader = await getSessionAuthHeader();
    const response = await fetch('/api/admin-stop-queue-job', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader,
        },
        body: JSON.stringify({ jobId }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Khong the dung queue job');
    }

    return payload as { success: boolean; refunded?: boolean; jobId?: string; providerJobId?: string | null; providerCancelRequested?: boolean };
};

// --- MAINTENANCE MODE ---

export const getMaintenanceMode = async (options?: { force?: boolean }) => {
    if (!supabase) return DEFAULT_MAINTENANCE_MODE;

    if (!options?.force && maintenanceModeCache && maintenanceModeCache.expiresAt > Date.now()) {
        return maintenanceModeCache.value;
    }

    if (!options?.force && maintenanceModePromise) {
        return maintenanceModePromise;
    }

    maintenanceModePromise = (async () => {
        try {
            const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'maintenance_mode').maybeSingle();
            if (error) throw error;

            if (data?.value) {
                const parsedValue = parseSettingValue(data.value, DEFAULT_MAINTENANCE_MODE);
                return setSharedMaintenanceMode({
                    isActive: !!parsedValue.isActive,
                    message: parsedValue.message || DEFAULT_MAINTENANCE_MODE.message
                });
            }

            return setSharedMaintenanceMode(DEFAULT_MAINTENANCE_MODE);
        } catch (e) {
            console.error("Get Maintenance Mode Error", e);
            return setSharedMaintenanceMode(DEFAULT_MAINTENANCE_MODE);
        }
    })();

    try {
        return await maintenanceModePromise;
    } finally {
        maintenanceModePromise = null;
    }
};

export const subscribeMaintenanceMode = (
    subscriber: (value: MaintenanceModeState) => void,
    options?: { immediate?: boolean }
) => {
    maintenanceModeSubscribers.add(subscriber);

    if (options?.immediate !== false) {
        subscriber(maintenanceModeCache?.value || DEFAULT_MAINTENANCE_MODE);
    }

    ensureMaintenanceModePolling();
    void getMaintenanceMode();

    return () => {
        maintenanceModeSubscribers.delete(subscriber);
        if (maintenanceModeSubscribers.size === 0) {
            stopMaintenanceModePolling();
        }
    };
};

export const saveMaintenanceMode = async (isActive: boolean, message: string) => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { data, error } = await supabase.from('system_settings').upsert(
            { key: 'maintenance_mode', value: { isActive, message } },
            { onConflict: 'key' }
        ).select();

        if (error) throw error;
        setSharedMaintenanceMode({ isActive, message: message || DEFAULT_MAINTENANCE_MODE.message });
        return { success: true };
    } catch (e) {
        console.error("Save Maintenance Mode Error", e);
        return { success: false, error: e };
    }
};

// --- FEATURE MAINTENANCE ---

const normalizeFeatureMaintenanceConfig = (value: any): FeatureMaintenanceConfig => {
    const disabledFeatureIds = Array.isArray(value?.disabledFeatureIds)
        ? value.disabledFeatureIds
            .map((entry: any) => String(entry || '').trim())
            .filter(Boolean)
        : [];

    return {
        disabledFeatureIds: Array.from(new Set(disabledFeatureIds)),
        message: String(value?.message || DEFAULT_FEATURE_MAINTENANCE_CONFIG.message || '').trim() || DEFAULT_FEATURE_MAINTENANCE_CONFIG.message,
        updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : undefined,
    };
};

export const getFeatureMaintenanceConfig = async (options?: { force?: boolean }): Promise<FeatureMaintenanceConfig> => {
    if (!supabase) return DEFAULT_FEATURE_MAINTENANCE_CONFIG;
    if (!options?.force && featureMaintenanceCache && featureMaintenanceCache.expiresAt > Date.now()) {
        return featureMaintenanceCache.value;
    }

    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'feature_maintenance')
            .maybeSingle();
        if (error) throw error;

        const normalized = normalizeFeatureMaintenanceConfig(data?.value);
        featureMaintenanceCache = {
            value: normalized,
            expiresAt: Date.now() + MAINTENANCE_MODE_CACHE_TTL_MS,
        };
        return normalized;
    } catch (e) {
        console.error("Get Feature Maintenance Config Error", e);
        return DEFAULT_FEATURE_MAINTENANCE_CONFIG;
    }
};

export const saveFeatureMaintenanceConfig = async (config: FeatureMaintenanceConfig) => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const normalized = normalizeFeatureMaintenanceConfig(config);
        const payload: FeatureMaintenanceConfig = {
            ...normalized,
            updatedAt: new Date().toISOString(),
        };
        const { error } = await supabase.from('system_settings').upsert(
            { key: 'feature_maintenance', value: payload },
            { onConflict: 'key' }
        );

        if (error) throw error;
        featureMaintenanceCache = {
            value: payload,
            expiresAt: Date.now() + MAINTENANCE_MODE_CACHE_TTL_MS,
        };
        return { success: true };
    } catch (e: any) {
        console.error("Save Feature Maintenance Config Error", e);
        return { success: false, error: e?.message || e };
    }
};

export const isFeatureInMaintenance = (config: FeatureMaintenanceConfig | null | undefined, featureId?: string | null) => {
    if (!featureId) return false;
    return !!config?.disabledFeatureIds?.includes(featureId);
};

// --- PAYMENT GATEWAY ---

const normalizePaymentGateway = (value: any): PaymentGateway => {
    return 'sepay';
};

export const getPaymentGatewayConfig = async (): Promise<PaymentGatewayConfig> => {
    if (!supabase) return DEFAULT_PAYMENT_GATEWAY_CONFIG;
    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'payment_gateway')
            .maybeSingle();
        if (error) throw error;

        return {
            gateway: normalizePaymentGateway(data?.value),
        };
    } catch (e) {
        console.error("Get Payment Gateway Config Error", e);
        return DEFAULT_PAYMENT_GATEWAY_CONFIG;
    }
};

export const savePaymentGatewayConfig = async (gateway: PaymentGateway) => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const { error } = await supabase.from('system_settings').upsert(
            {
                key: 'payment_gateway',
                value: {
                    gateway: 'sepay',
                    updatedAt: new Date().toISOString(),
                },
            },
            { onConflict: 'key' },
        );

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error("Save Payment Gateway Config Error", e);
        return { success: false, error: e?.message || e };
    }
};

// --- SYSTEM ANNOUNCEMENT ---

const normalizeSystemAnnouncement = (value: any): SystemAnnouncementConfig => {
    const variant = String(value?.variant || '').toLowerCase();
    return {
        isActive: !!value?.isActive,
        title: String(value?.title || DEFAULT_SYSTEM_ANNOUNCEMENT_CONFIG.title).trim() || DEFAULT_SYSTEM_ANNOUNCEMENT_CONFIG.title,
        message: String(value?.message || DEFAULT_SYSTEM_ANNOUNCEMENT_CONFIG.message).trim() || DEFAULT_SYSTEM_ANNOUNCEMENT_CONFIG.message,
        variant: variant === 'promo' || variant === 'warning' ? variant : 'info',
        updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : undefined,
    };
};

export const getSystemAnnouncementConfig = async (): Promise<SystemAnnouncementConfig> => {
    if (!supabase) return DEFAULT_SYSTEM_ANNOUNCEMENT_CONFIG;
    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'system_announcement')
            .maybeSingle();
        if (error) throw error;

        return normalizeSystemAnnouncement(data?.value);
    } catch (e) {
        console.error("Get System Announcement Config Error", e);
        return DEFAULT_SYSTEM_ANNOUNCEMENT_CONFIG;
    }
};

export const saveSystemAnnouncementConfig = async (config: SystemAnnouncementConfig) => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const normalizedConfig = normalizeSystemAnnouncement(config);
        const { error } = await supabase.from('system_settings').upsert(
            {
                key: 'system_announcement',
                value: {
                    ...normalizedConfig,
                    updatedAt: new Date().toISOString(),
                },
            },
            { onConflict: 'key' },
        );

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error("Save System Announcement Config Error", e);
        return { success: false, error: e?.message || e };
    }
};

// --- APP TOURS ---

const normalizeTourPlacement = (value: any): AppTourPlacement => {
    const placement = String(value || '').toLowerCase();
    return placement === 'top' || placement === 'right' || placement === 'bottom' || placement === 'left' ? placement : 'auto';
};

const normalizeAppTourStep = (value: any, index: number): AppTourStep => ({
    id: String(value?.id || `step_${Date.now()}_${index}`).trim(),
    targetId: String(value?.targetId || '').trim(),
    title: String(value?.title || 'Huong dan').trim() || 'Huong dan',
    description: String(value?.description || '').trim(),
    placement: normalizeTourPlacement(value?.placement),
    order: Number.isFinite(Number(value?.order)) ? Number(value.order) : index + 1,
    isActive: value?.isActive !== false,
});

const normalizeAppTour = (value: any, index: number): AppTourDefinition => {
    const surface = String(value?.surface || '').toLowerCase() === 'mobile' ? 'mobile' : 'desktop';
    const steps = Array.isArray(value?.steps)
        ? value.steps
            .map(normalizeAppTourStep)
            .filter((step: AppTourStep) => step.targetId && step.title)
            .sort((left: AppTourStep, right: AppTourStep) => (left.order || 0) - (right.order || 0))
        : [];

    return {
        id: String(value?.id || `tour_${surface}_${index + 1}`).trim(),
        title: String(value?.title || 'Huong dan ung dung').trim() || 'Huong dan ung dung',
        surface,
        screen: String(value?.screen || 'global').trim() || 'global',
        featureId: String(value?.featureId || '').trim() || undefined,
        isActive: value?.isActive !== false,
        steps,
    };
};

const normalizeAppToursConfig = (value: any): AppToursConfig => {
    const frequency = String(value?.showFrequency || '').toLowerCase();
    const showFrequency = frequency === 'once' || frequency === 'always' ? frequency : 'daily';
    const sourceTours = Array.isArray(value?.tours) ? value.tours : DEFAULT_APP_TOURS_CONFIG.tours;
    const tours = sourceTours
        .map(normalizeAppTour)
        .filter((tour: AppTourDefinition) => tour.id && tour.steps.length > 0);

    return {
        isActive: value?.isActive !== false,
        showFrequency,
        tours,
        updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : undefined,
    };
};

export const getAppToursConfig = async (): Promise<AppToursConfig> => {
    if (!supabase) return DEFAULT_APP_TOURS_CONFIG;
    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'app_tours')
            .maybeSingle();
        if (error) throw error;

        return normalizeAppToursConfig(data?.value || DEFAULT_APP_TOURS_CONFIG);
    } catch (e) {
        console.error("Get App Tours Config Error", e);
        return DEFAULT_APP_TOURS_CONFIG;
    }
};

export const saveAppToursConfig = async (config: AppToursConfig) => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const normalizedConfig = normalizeAppToursConfig(config);
        const payload = {
            ...normalizedConfig,
            updatedAt: new Date().toISOString(),
        };
        const { error } = await supabase.from('system_settings').upsert(
            { key: 'app_tours', value: payload },
            { onConflict: 'key' },
        );

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error("Save App Tours Config Error", e);
        return { success: false, error: e?.message || e };
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

export type GenerationGuideImagesConfig = {
    characterUrl: string;
    sampleUrl: string;
};

const DEFAULT_GENERATION_GUIDE_IMAGES: GenerationGuideImagesConfig = {
    characterUrl: '',
    sampleUrl: '',
};

export const getGenerationGuideImages = async (): Promise<GenerationGuideImagesConfig> => {
    if (!supabase) return DEFAULT_GENERATION_GUIDE_IMAGES;
    try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'generation_guide_images').maybeSingle();
        if (error) throw error;

        if (data?.value) {
            const parsedValue = parseSettingValue(data.value, DEFAULT_GENERATION_GUIDE_IMAGES);
            return {
                characterUrl: String(parsedValue.characterUrl || '').trim(),
                sampleUrl: String(parsedValue.sampleUrl || '').trim(),
            };
        }

        return DEFAULT_GENERATION_GUIDE_IMAGES;
    } catch (e) {
        return DEFAULT_GENERATION_GUIDE_IMAGES;
    }
};

export const saveGenerationGuideImages = async (characterUrl: string, sampleUrl: string) => {
    if (!supabase) return { success: false, error: "No Database" };
    try {
        const payload = {
            characterUrl: characterUrl.trim(),
            sampleUrl: sampleUrl.trim(),
        };

        const { data: existing } = await supabase.from('system_settings').select('key').eq('key', 'generation_guide_images').maybeSingle();

        let error;
        if (existing) {
            const res = await supabase.from('system_settings').update({ value: payload }).eq('key', 'generation_guide_images');
            error = res.error;
        } else {
            const res = await supabase.from('system_settings').insert({ key: 'generation_guide_images', value: payload });
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
        const normalizedCode = String(code.code || '').trim().toUpperCase();
        const normalizedCampaignKey = String(code.campaignKey || normalizedCode).trim().toUpperCase();
        const payload = {
            code: normalizedCode,
            campaign_key: normalizedCampaignKey,
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
    const cleanCode = codeStr.trim().toUpperCase();
    if (!cleanCode) return { success: false, reward: 0, message: "Vui lòng nhập giftcode." };
    trackEvent('giftcode_redeem_start');

    try {
        const authHeader = await getSessionAuthHeader();
        const response = await fetch('/api/redeem-giftcode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader,
            },
            body: JSON.stringify({ code: cleanCode }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
            trackEvent('giftcode_redeem_failed', {
                reason: payload?.message || 'request_failed',
            });
            return {
                success: false,
                reward: 0,
                message: payload?.message || 'Không thể sử dụng giftcode.',
            };
        }

        invalidateUserProfileCache();
        window.dispatchEvent(new Event('balance_updated'));
        const reward = Number(payload?.reward || 0);
        trackEvent('giftcode_redeem_success', { reward_vcoin: reward });
        return { success: true, reward, message: 'Success' };
    } catch (e: any) {
        trackEvent('giftcode_redeem_error', {
            error_message: e?.message?.slice?.(0, 120) || 'unknown',
        });
        return { success: false, reward: 0, message: e.message };
    }
};

export const getGiftcodeUsages = async (codeId: string) => {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('gift_code_usages')
        .select('user_id, created_at, ip_address, users(display_name, email, photo_url)')
        .eq('gift_code_id', codeId)
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    
    return data.map((u: any) => {
        const userObj = Array.isArray(u.users) ? u.users[0] : u.users;
        return {
            userId: u.user_id,
            usedAt: u.created_at,
            ipAddress: u.ip_address || null,
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

const normalizeAdminVietnameseText = (value: string) => {
    const replacements: Array<[string, string]> = [
        ['KhÃ¡c', 'Khác'],
        ['nÃ¢ng cáº¥p', 'nâng cấp'],
        ['lÃ m nÃ©t', 'làm nét'],
        ['tÃ¡ch ná»n', 'tách nền'],
        ['ngÆ°á»i', 'người'],
        ['Ä‘Ã´i', 'đôi'],
        ['táº¡o áº£nh', 'tạo ảnh'],
        ['chÃ¢n dung', 'chân dung'],
        ['áº£nh', 'ảnh'],
        ['xá»­ lÃ½', 'xử lý'],
        ['LÃ m NÃ©t áº¢nh', 'Làm Nét Ảnh'],
        ['TÃ¡ch Ná»n', 'Tách Nền'],
        ['Táº¡o áº¢nh', 'Tạo Ảnh'],
        ['Táº¡o áº£nh', 'Tạo ảnh'],
        ['NgÆ°á»i', 'Người'],
        ['ÄÃ´i', 'Đôi'],
        ['ÄÆ¡n', 'Đơn'],
        ['Chá»‰nh Sá»­a', 'Chỉnh Sửa'],
        ['Chá»‰nh sá»­a áº£nh', 'Chỉnh sửa ảnh'],
        ['Xá»­ LÃ½ áº¢nh', 'Xử Lý Ảnh'],
    ];

    return replacements.reduce((text, [bad, good]) => text.split(bad).join(good), value);
};

export const getAdminStats = async () => {
    if (!supabase) return {
        dashboard: { visitsToday: 0, visitsTotal: 0, newUsersToday: 0, usersTotal: 0, imagesToday: 0, imagesTotal: 0, aiUsage: [] },
        usersList: [], packages: [], promotions: [], giftcodes: [], transactions: []
    };
    // Fetch Users (Handling > 1000 rows limit)
    let users: any[] = [];
    let userError = null;
    let page = 0;
    const pageSize = ADMIN_STATS_USER_PAGE_SIZE;
    
    while (true) {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, display_name, photo_url, vcoin_balance, is_admin, created_at, last_active')
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
    if (userError) {
        console.error("Error fetching users for Admin Stats:", userError);
    }
    const { data: pkgs } = await supabase
        .from('credit_packages')
        .select('id, name, credits_amount, price_vnd, tag, bonus_credits, is_featured, is_active, display_order, transfer_syntax')
        .order('display_order');
    
    let promos = [];
    try {
        const { data } = await supabase
            .from('promotions')
            .select('id, title, description, bonus_percent, start_time, end_time, is_active');
        promos = data || [];
    } catch (e) {
        // Silent
    }
    
    // Fetch giftcodes with accurate usage count from relation
    const { data: codes } = await supabase
        .from('gift_codes')
        .select('id, code, campaign_key, reward, total_limit, used_count, max_per_user, is_active, gift_code_usages(count)');

    const { data: txs, error: txError } = await supabase
        .from('payment_transactions')
        .select('id, user_id, package_id, amount_vnd, vcoin_received, status, created_at, order_code, payment_method')
        .order('created_at', { ascending: false })
        .limit(ADMIN_STATS_TRANSACTION_LIMIT);
    if (txError) {
        console.error('Error fetching payment transactions for Admin Stats:', txError);
    }
    
    // Try to fetch logs from both potential table names
    let usageLogs: any[] = [];
    
    // Attempt 1: vcoin_transactions (Fetch up to 10000)
    const { data: logs1 } = await supabase
        .from('vcoin_transactions')
        .select('id, user_id, amount, type, description, metadata, reference_type, created_at')
        .order('created_at', { ascending: false })
        .limit(ADMIN_STATS_USAGE_LOG_LIMIT);
    if (logs1) usageLogs = [...usageLogs, ...logs1];

    // Filter for usage: type 'usage' OR negative amount
    usageLogs = usageLogs.filter((l: any) => l.type === 'usage' || (l.amount && Number(l.amount) < 0));
    
    // Calculate dashboard
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTodayISO = startOfToday.toISOString();
    
    // 1. Users
    const newUsersToday = users?.filter((u: any) => u.created_at && new Date(u.created_at) >= startOfToday).length || 0;
    
    const countRows = async (tableName: string, since?: string): Promise<number> => {
        try {
            let query = supabase.from(tableName).select('id', { count: 'exact', head: true });
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
        let rawFeature = normalizeAdminVietnameseText(log.reason || log.description || log.note || log.action || log.activity || log.details || 'Khác');
        
        // If still 'Khác', try to find any property that looks like a feature name
        if (rawFeature === 'Khác') {
            for (const key in log) {
                if (typeof log[key] === 'string' && (log[key].startsWith('Gen') || log[key].startsWith('Edit') || log[key].includes(':'))) {
                    rawFeature = normalizeAdminVietnameseText(log[key]);
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
        } else if (lower.includes('5 người') || lower.includes('group of 5') || lower.includes('squad of 5')) {
            feature = 'Tạo Ảnh 5 Người';
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
         let coins = Number(t.vcoin_received) || 0;

         if (coins === 0 && t.package_id) {
             const pkg = pkgs?.find((p: any) => p.id === t.package_id);
             if (pkg) {
                 coins = Number(pkg.credits_amount) || 0;
                 if (pkg.bonus_credits) {
                     coins += Math.floor(coins * Number(pkg.bonus_credits) / 100);
                 }
             }
         }

         if (coins === 0 && t.amount_vnd) {
             coins = Math.floor(Number(t.amount_vnd) / 1000);
         }

         const txUserId = t.user_id || t.userId;
         const txUser = users?.find((u: any) => u.id === txUserId);
         
         return {
             id: t.id,
             userId: txUserId,
             userName: txUser?.display_name || txUser?.email?.split('@')[0] || 'Unknown',
             userEmail: txUser?.email || 'No Email',
             userAvatar: txUser?.photo_url,
             packageId: t.package_id,
             amount: Number(t.amount_vnd) || 0,
             vcoin_received: coins,
             status: t.status,
             createdAt: t.created_at,
             code: t.order_code,
             order_code: t.order_code,
             paymentMethod: t.payment_method || 'sepay'
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
                 campaignKey: c.campaign_key || c.code,
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



