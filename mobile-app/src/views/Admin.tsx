import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  CreditCard,
  Gift,
  Image as ImageIcon,
  KeyRound,
  Loader,
  Megaphone,
  Package,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings2,
  Shield,
  SlidersHorizontal,
  Trash2,
  Users,
  Video,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/NotificationSystem';
import {
  adminApproveTransaction,
  adminRejectTransaction,
  deleteApiKey,
  deleteGiftcode,
  deletePackage,
  deletePromotion,
  deleteStylePreset,
  getAdminQueueJobDetail,
  getAdminQueueJobs,
  getAdminStats,
  getAdminUserHistory,
  getApiKeysList,
  getFeatureMaintenanceConfig,
  getGenerationGuideImages,
  getGiftcodePromoConfig,
  getMaintenanceMode,
  getModelPricing,
  getPaymentGatewayConfig,
  getStylePresets,
  getSystemAnnouncementConfig,
  getTutorialVideo,
  runAdminQueueReconcile,
  saveGenerationGuideImages,
  saveGiftcode,
  saveGiftcodePromoConfig,
  saveModelPricing,
  savePackage,
  savePaymentGatewayConfig,
  savePromotion,
  saveStylePreset,
  saveSystemAnnouncementConfig,
  saveTutorialVideo,
  saveFeatureMaintenanceConfig,
  saveMaintenanceMode,
  updatePackageOrder,
  updateAdminUserProfile,
  stopAdminQueueJob,
} from '../services/economyService';
import { getUserImagesFromStorage } from '../services/storageService';
import { APP_CONFIG } from '../constants';
import {
  filterAdminManagedPricingRows,
  getPricingRows,
  isAdminManagedPricingModel,
  type TstPricingRow,
} from '../services/tstCatalog';
import type { FeatureMaintenanceConfig, ModelPricing, PaymentGateway, SystemAnnouncementConfig } from '../services/economyService';
import type { AdminQueueInputMedia, AdminQueueJob, AdminQueueJobDetail, AdminQueueMediaSection, AdminQueueSummary, CreditPackage, GeneratedImage, Giftcode, HistoryItem, PromotionCampaign, StylePreset, Transaction, UserProfile } from '../types';

type AdminTab = 'overview' | 'queue' | 'transactions' | 'users' | 'packages' | 'marketing' | 'pricing' | 'styles' | 'system';
type AdminStatsPayload = Awaited<ReturnType<typeof getAdminStats>>;
type AdminUsageRow = {
  feature: string;
  count: number;
  vcoins: number;
  revenue: number;
};
type AdminUserRow = {
  id: string;
  username?: string;
  email?: string;
  avatar?: string;
  vcoin_balance?: number;
  role?: string;
  created_at?: string;
  isVip?: boolean;
  lastActive?: string;
  usageCount?: number;
};

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

const formatDateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Chưa cập nhật';

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
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 7, Number(minute), 0, 0)).toISOString();
};

const getQueueStatus = (job: AdminQueueJob) => job.displayStatus || job.status;

const getQueueStatusLabel = (status?: string) => {
  switch (status) {
    case 'queued':
      return 'Đang chờ';
    case 'processing':
      return 'Đang xử lý';
    case 'rescuing':
      return 'Đang cứu kết quả';
    case 'failed':
      return 'Thất bại';
    case 'completed':
      return 'Hoàn thành';
    default:
      return 'Hoàn thành';
  }
};

const getQueuePlatformLabel = (platform?: string) => {
  switch (platform) {
    case 'mobile':
      return 'Điện thoại';
    case 'desktop':
      return 'Máy tính';
    default:
      return 'Không rõ';
  }
};

const getQueueStageLabel = (stage?: string) => {
  switch (stage) {
    case 'queued':
      return 'Đã vào hàng đợi';
    case 'preparing':
      return 'Đang chuẩn bị';
    case 'uploading_refs':
      return 'Đang tải ảnh tham chiếu';
    case 'synthesizing_prompt':
      return 'Đang xử lý prompt text + role metadata';
    case 'building_payload':
      return 'Đang dựng payload';
    case 'dispatching':
      return 'Đang gửi provider';
    case 'submitted':
      return 'Provider đã nhận job';
    case 'polling':
      return 'Đang chờ provider';
    case 'verifying_output':
      return 'Đang hậu kiểm';
    case 'completed':
      return 'Hoàn thành';
    case 'failed':
      return 'Thất bại';
    default:
      return stage || '-';
  }
};

const getQueueStatusTone = (status?: string) => {
  switch (status) {
    case 'failed':
      return 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300';
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'processing':
      return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300';
    case 'rescuing':
      return 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300';
    default:
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  }
};

const getQueueHealthTone = (severity?: string) => {
  switch (severity) {
    case 'ok':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'info':
      return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300';
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
  }
};

const getQueueMediaSectionTone = (key: AdminQueueMediaSection['key']) => {
  switch (key) {
    case 'result':
      return 'border-emerald-200/70 dark:border-emerald-500/20';
    case 'sample':
      return 'border-fuchsia-200/70 dark:border-fuchsia-500/20';
    default:
      return 'border-cyan-200/70 dark:border-cyan-500/20';
  }
};

const getQueueMediaMeta = (media: AdminQueueInputMedia) => `${media.kind} · ${media.sourceType}${media.userProvided === false ? ' · hệ thống' : ''}`;

const getVertexTaskLabel = (task?: string) => {
  switch (task) {
    case 'image_prompt_compression':
      return 'Vertex nén prompt';
    case 'image_prompt_synthesis':
      return 'Vertex tổng hợp prompt';
    default:
      return task || 'Vertex';
  }
};

const getVertexStatusTone = (status?: string) => {
  switch (status) {
    case 'error':
      return 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300';
    case 'warning':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
    default:
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  }
};

const getPaymentStatusLabel = (status?: string) => {
  switch (status) {
    case 'pending':
      return 'Chờ duyệt';
    case 'paid':
      return 'Đã thanh toán';
    case 'cancelled':
      return 'Đã hủy';
    case 'failed':
      return 'Thất bại';
    default:
      return status || 'Không rõ';
  }
};

const getRoleLabel = (role?: string) => (role === 'admin' ? 'Quản trị viên' : 'Người dùng');

const getUserLastSeen = (user: AdminUserRow) => {
  if (!user.lastActive) return 'Chưa online';
  const diffMins = Math.floor((Date.now() - new Date(user.lastActive).getTime()) / 60000);
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${Math.floor(diffHours / 24)} ngày trước`;
};

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-[20px] border border-gray-100 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-[#18181B] ${className}`}>
    {children}
  </div>
);

const pillButtonClass = (active: boolean, tone = 'bg-gray-900 text-white dark:bg-white dark:text-black') =>
  `whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold ${active ? tone : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`;

const fieldClass =
  'w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white';

const compactPanelClass = 'rounded-[18px] bg-gray-50 p-3 dark:bg-zinc-800/80';

const newCreditPackage = (): CreditPackage => ({
  id: `temp_${Date.now()}`,
  name: 'Gói mới',
  vcoin: 100,
  price: 100000,
  currency: 'VND',
  bonusText: '',
  bonusPercent: 0,
  isPopular: false,
  isActive: true,
  displayOrder: 999,
  colorTheme: 'pink',
  transferContent: 'AUDITIONAI',
});

const newPromotion = (): PromotionCampaign => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: `temp_${Date.now()}`,
    name: 'Sự kiện mới',
    marqueeText: 'Khuyến mãi đặc biệt từ AUDITION AI',
    bonusPercent: 10,
    startTime: now.toISOString(),
    endTime: tomorrow.toISOString(),
    isActive: true,
  };
};

const newGiftcode = (): Giftcode => ({
  id: `temp_${Date.now()}`,
  code: 'NEWCODE',
  campaignKey: 'NEWCODE',
  reward: 20,
  totalLimit: 100,
  usedCount: 0,
  maxPerUser: 1,
  isActive: true,
});

const newStylePreset = (): StylePreset => ({
  id: `temp_${Date.now()}`,
  name: 'Style mới',
  image_url: '',
  trigger_prompt: '',
  is_active: true,
  is_default: false,
});

export function AdminView() {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const { notify, confirm } = useNotification();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStatsPayload | null>(null);
  const [queueJobs, setQueueJobs] = useState<AdminQueueJob[]>([]);
  const [queueSummary, setQueueSummary] = useState<AdminQueueSummary>(EMPTY_QUEUE_SUMMARY);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [stoppingQueueJobId, setStoppingQueueJobId] = useState<string | null>(null);
  const [selectedQueueJobId, setSelectedQueueJobId] = useState<string | null>(null);
  const [selectedQueueJobDetail, setSelectedQueueJobDetail] = useState<AdminQueueJobDetail | null>(null);
  const [loadingQueueDetail, setLoadingQueueDetail] = useState(false);
  const [queuePromptExpanded, setQueuePromptExpanded] = useState(false);
  const [actingTransactionId, setActingTransactionId] = useState<string | null>(null);
  const [queueStatusFilter, setQueueStatusFilter] = useState<'all' | 'processing' | 'failed' | 'completed'>('all');
  const [queueAssetFilter, setQueueAssetFilter] = useState<'all' | 'image' | 'video'>('all');
  const [queueTimeScope, setQueueTimeScope] = useState<'today' | 'all'>('all');
  const [queueSearch, setQueueSearch] = useState('');
  const [queueStuckOnly, setQueueStuckOnly] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [maintenance, setMaintenance] = useState({ isActive: false, message: '' });
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({
    disabledFeatureIds: [],
    message: 'Tính năng đang bảo trì. Vui lòng quay lại sau.',
  });
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [savingFeatureMaintenance, setSavingFeatureMaintenance] = useState(false);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [promotions, setPromotions] = useState<PromotionCampaign[]>([]);
  const [giftcodes, setGiftcodes] = useState<Giftcode[]>([]);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [modelPricing, setModelPricing] = useState<ModelPricing[]>([]);
  const [pricingRows, setPricingRows] = useState<TstPricingRow[]>([]);
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [giftcodePromo, setGiftcodePromo] = useState({ text: '', isActive: false });
  const [tutorialVideo, setTutorialVideo] = useState({ url: '', isActive: true });
  const [guideImages, setGuideImages] = useState({ characterUrl: '', sampleUrl: '' });
  const [paymentGateway, setPaymentGateway] = useState<PaymentGateway>('sepay');
  const [systemAnnouncement, setSystemAnnouncement] = useState<SystemAnnouncementConfig>({
    isActive: false,
    title: 'Thông báo từ AUDITION AI',
    message: 'Chào mừng bạn quay lại AUDITION AI.',
    variant: 'info',
  });
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<PromotionCampaign | null>(null);
  const [editingGiftcode, setEditingGiftcode] = useState<Giftcode | null>(null);
  const [editingStyle, setEditingStyle] = useState<StylePreset | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingUserOriginalBalance, setEditingUserOriginalBalance] = useState<number | null>(null);
  const [adminUserAdjustmentReason, setAdminUserAdjustmentReason] = useState('');
  const [marketingSearch, setMarketingSearch] = useState('');
  const [pricingSearch, setPricingSearch] = useState('');
  const [styleSearch, setStyleSearch] = useState('');
  const [savingExtras, setSavingExtras] = useState(false);
  const [viewingUser, setViewingUser] = useState<AdminUserRow | null>(null);
  const [userHistory, setUserHistory] = useState<HistoryItem[]>([]);
  const [userImages, setUserImages] = useState<GeneratedImage[]>([]);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [userLedgerSectionLimits, setUserLedgerSectionLimits] = useState<Record<string, number>>({});
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [statsPayload, maintenancePayload, featureMaintenancePayload] = await Promise.all([
        getAdminStats(),
        getMaintenanceMode(),
        getFeatureMaintenanceConfig(),
      ]);
      setStats(statsPayload);
      setMaintenance({
        isActive: !!maintenancePayload.isActive,
        message: maintenancePayload.message || '',
      });
      setFeatureMaintenance(featureMaintenancePayload);
      setPackages((statsPayload.packages || []) as CreditPackage[]);
      setPromotions((statsPayload.promotions || []) as PromotionCampaign[]);
      setGiftcodes((statsPayload.giftcodes || []) as Giftcode[]);
    } catch (error) {
      console.error('[MobileAdmin] Failed to load stats', error);
      notify('Không thể tải tổng quan admin.', 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [notify]);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const payload = await getAdminQueueJobs({
        search: queueSearch.trim() || undefined,
        status: queueStatusFilter === 'processing' ? 'all' : queueStatusFilter,
        assetType: queueAssetFilter,
        timeScope: queueTimeScope,
        stuckOnly: queueStuckOnly,
        limit: 80,
      });

      const jobs = payload.jobs.filter((job) => {
        const status = getQueueStatus(job);
        if (queueStatusFilter === 'all') return true;
        if (queueStatusFilter === 'processing') {
          return status === 'processing' || status === 'queued' || status === 'rescuing';
        }
        if (queueStatusFilter === 'completed') {
          return status === 'completed';
        }
        return status === 'failed';
      });

      setQueueJobs(jobs);
      setQueueSummary(payload.summary || EMPTY_QUEUE_SUMMARY);
    } catch (error) {
      console.error('[MobileAdmin] Failed to load queue', error);
      notify('Không thể tải queue job.', 'error');
    } finally {
      setLoadingQueue(false);
    }
  }, [notify, queueAssetFilter, queueSearch, queueStatusFilter, queueStuckOnly, queueTimeScope]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const loadAdminExtras = useCallback(async () => {
    try {
      const [
        stylesPayload,
        pricingPayload,
        livePricingPayload,
        apiKeysPayload,
        giftcodePromoPayload,
        tutorialPayload,
        guidePayload,
        paymentGatewayPayload,
        announcementPayload,
      ] = await Promise.all([
        getStylePresets(),
        getModelPricing({ force: true }),
        getPricingRows(true).catch(() => []),
        getApiKeysList(),
        getGiftcodePromoConfig(),
        getTutorialVideo(),
        getGenerationGuideImages(),
        getPaymentGatewayConfig(),
        getSystemAnnouncementConfig(),
      ]);
      setStylePresets((stylesPayload || []) as StylePreset[]);
      setModelPricing((pricingPayload || []).filter((row) => isAdminManagedPricingModel(row.model_id)));
      setPricingRows(filterAdminManagedPricingRows(livePricingPayload || []));
      setApiKeys(apiKeysPayload || []);
      setGiftcodePromo(giftcodePromoPayload);
      setTutorialVideo(tutorialPayload);
      setGuideImages(guidePayload);
      setPaymentGateway(paymentGatewayPayload.gateway);
      setSystemAnnouncement(announcementPayload);
    } catch (error) {
      console.error('[MobileAdmin] Failed to load admin extras', error);
      notify('Không thể tải đủ cấu hình admin.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    void loadAdminExtras();
  }, [loadAdminExtras]);

  const pendingTransactions = useMemo(
    () => ((stats?.transactions || []) as Transaction[]).filter((item: Transaction) => item.status === 'pending'),
    [stats],
  );

  const aiUsageRows = useMemo(
    () => ((stats?.dashboard.aiUsage || []) as AdminUsageRow[]).slice(0, 6),
    [stats],
  );

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return ((stats?.usersList || []) as AdminUserRow[])
      .filter((entry: AdminUserRow) => {
        if (!query) return true;
        return (
          (entry.username || '').toLowerCase().includes(query) ||
          (entry.email || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => Number(b.vcoin_balance || 0) - Number(a.vcoin_balance || 0))
      .slice(0, 25);
  }, [stats, userSearch]);

  const buildAssetFallbackHistory = (images: GeneratedImage[]): HistoryItem[] =>
    images
      .filter((image) => Number(image.cost || 0) > 0)
      .map((image) => ({
        id: `asset-charge-${image.id}`,
        createdAt: new Date(image.updatedAt || image.timestamp).toISOString(),
        description: image.toolName || image.toolId || (image.assetType === 'video' ? 'Tạo video AI' : 'Tạo ảnh AI'),
        vcoinChange: -Math.abs(Number(image.cost || 0)),
        balanceAfter: null,
        category: image.assetType === 'video' || String(image.queueKind || '').includes('video') || String(image.queueKind || '').includes('motion') ? 'video' : 'image',
        referenceType: 'generated_image_charge',
        referenceId: image.id,
        toolName: image.toolName || image.toolId || null,
        assetType: image.assetType || 'image',
        queueKind: image.queueKind || null,
        jobStatus: image.status || null,
        type: 'usage',
        status: 'success',
      }));

  const openUserLedger = async (entry: AdminUserRow) => {
    setViewingUser(entry);
    setLoadingUserDetails(true);
    setUserLedgerSectionLimits({});
    setUserHistory([]);
    setUserImages([]);
    try {
      const [historyResult, imagesResult] = await Promise.allSettled([
        getAdminUserHistory(entry.id),
        getUserImagesFromStorage(entry.id, 60),
      ]);
      const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
      const images = imagesResult.status === 'fulfilled' ? imagesResult.value : [];
      setUserImages(images);
      setUserHistory(history.length > 0 ? history : buildAssetFallbackHistory(images));
    } catch (error) {
      console.error('[MobileAdmin] Failed to load user ledger', error);
      notify('Không thể tải lịch sử người dùng.', 'error');
    } finally {
      setLoadingUserDetails(false);
    }
  };

  const toEditableUserProfile = (entry: AdminUserRow): UserProfile => ({
    id: entry.id,
    username: entry.username || entry.email || '',
    email: entry.email || '',
    avatar: entry.avatar || '',
    vcoin_balance: Number(entry.vcoin_balance || 0),
    role: entry.role === 'admin' ? 'admin' : 'user',
    isVip: !!entry.isVip,
    lastActive: entry.lastActive,
    usageCount: entry.usageCount,
  });

  const openEditUser = (entry: AdminUserRow) => {
    const profile = toEditableUserProfile(entry);
    setEditingUser(profile);
    setEditingUserOriginalBalance(Number(profile.vcoin_balance || 0));
    setAdminUserAdjustmentReason('');
  };

  const userImageById = useMemo(() => {
    const lookup = new Map<string, GeneratedImage>();
    userImages.forEach((image) => {
      if (image.id) lookup.set(image.id, image);
    });
    return lookup;
  }, [userImages]);

  const getHistoryAsset = (item: HistoryItem) => {
    const directId = String(item.referenceId || '').trim();
    if (directId && userImageById.has(directId)) return userImageById.get(directId) || null;
    const fallbackId = String(item.id || '').replace(/^asset-charge-/, '');
    return fallbackId && userImageById.has(fallbackId) ? userImageById.get(fallbackId) || null : null;
  };

  const isRefundHistoryItem = (item: HistoryItem) =>
    item.type === 'refund' ||
    String(item.referenceType || '').toLowerCase().includes('refund') ||
    String(item.description || '').toLowerCase().includes('refund') ||
    String(item.description || '').toLowerCase().includes('hoàn');

  const historyStatusTone = (item: HistoryItem) => {
    if (isRefundHistoryItem(item)) return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
    if (item.status === 'success') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
    if (item.status === 'pending') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
    return 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300';
  };

  const historyStatusLabel = (item: HistoryItem) => {
    if (isRefundHistoryItem(item)) return 'Hoàn tiền';
    if (item.status === 'success') return 'Thành công';
    if (item.status === 'pending') return 'Đang chờ';
    return 'Thất bại';
  };

  const formatVcoin = (value?: number | null) =>
    value === null || value === undefined || Number.isNaN(Number(value)) ? '-' : `${Number(value).toLocaleString('vi-VN')} VC`;

  const userLedgerSections = useMemo(() => [
    { id: 'image', title: 'Tạo ảnh', icon: ImageIcon, items: userHistory.filter((item) => (item.category || (item.assetType === 'image' ? 'image' : 'other')) === 'image') },
    { id: 'video', title: 'Tạo video', icon: Video, items: userHistory.filter((item) => (item.category || (item.assetType === 'video' ? 'video' : 'other')) === 'video') },
    { id: 'checkin', title: 'Điểm danh', icon: Activity, items: userHistory.filter((item) => item.category === 'checkin') },
    { id: 'topup', title: 'Nạp tiền', icon: Wallet, items: userHistory.filter((item) => item.category === 'topup' || item.type === 'topup' || item.type === 'pending_topup') },
    { id: 'giftcode', title: 'Giftcode', icon: Gift, items: userHistory.filter((item) => item.category === 'giftcode' || item.type === 'giftcode') },
    { id: 'admin_transaction', title: 'Sửa VCoin', icon: Shield, items: userHistory.filter((item) => item.category === 'admin_transaction' || item.type === 'admin_adjustment') },
    {
      id: 'other',
      title: 'Khác',
      icon: SlidersHorizontal,
      items: userHistory.filter((item) => item.type !== 'admin_adjustment' && !['image', 'video', 'checkin', 'topup', 'giftcode', 'admin_transaction'].includes(item.category || 'other')),
    },
  ], [userHistory]);

  const showMoreUserLedgerSection = (sectionId: string) => {
    setUserLedgerSectionLimits((current) => ({
      ...current,
      [sectionId]: (current[sectionId] || 10) + 10,
    }));
  };

  const pricingByKey = useMemo(
    () => new Map(modelPricing.map((row) => [`${row.model_id}|${row.option_id}`, row])),
    [modelPricing],
  );
  const filteredPricingRows = useMemo(() => {
    const query = pricingSearch.trim().toLowerCase();
    return pricingRows.filter((row) => {
      if (!query) return true;
      return `${row.modelName} ${row.modelId} ${row.server} ${row.resolution || ''} ${row.duration || ''}`.toLowerCase().includes(query);
    });
  }, [pricingRows, pricingSearch]);
  const filteredStyles = useMemo(() => {
    const query = styleSearch.trim().toLowerCase();
    return stylePresets.filter((style) => !query || `${style.name} ${style.trigger_prompt || ''}`.toLowerCase().includes(query));
  }, [stylePresets, styleSearch]);
  const filteredMarketingGiftcodes = useMemo(() => {
    const query = marketingSearch.trim().toLowerCase();
    return giftcodes.filter((code) => !query || `${code.code} ${code.campaignKey || ''}`.toLowerCase().includes(query));
  }, [giftcodes, marketingSearch]);
  const selectedQueuePrompt = selectedQueueJobDetail?.prompt || selectedQueueJobDetail?.job.prompt || 'Không có prompt';
  const orderedQueueMediaSections = [...(selectedQueueJobDetail?.mediaSections || [])].sort((left, right) => {
    const order = { result: 0, reference: 1, sample: 2 };
    return order[left.key] - order[right.key];
  });

  if (userRole !== 'admin') {
    return <Navigate to="/home" replace />;
  }

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadQueue(), loadAdminExtras()]);
    setRefreshing(false);
  };

  const approveTransaction = (tx: Transaction) =>
    confirm({
      title: 'Duyệt giao dịch?',
      message: `Cộng ${tx.vcoin_received} Vcoin cho ${tx.userName || tx.userEmail || 'người dùng'}?`,
      confirmText: 'Duyệt',
      cancelText: 'Hủy',
      onConfirm: async () => {
        setActingTransactionId(tx.id);
        const result = await adminApproveTransaction(tx.id);
        setActingTransactionId(null);
        if (!result.success) {
          notify(result.error || 'Duyệt thất bại.', 'error');
          return;
        }
        await loadStats();
        notify('Đã duyệt giao dịch.', 'success');
      },
    });

  const rejectTransaction = (tx: Transaction) =>
    confirm({
      title: 'Từ chối giao dịch?',
      message: `Bạn chắc chắn muốn từ chối giao dịch ${tx.order_code || tx.id}?`,
      confirmText: 'Từ chối',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        setActingTransactionId(tx.id);
        const result = await adminRejectTransaction(tx.id);
        setActingTransactionId(null);
        if (!result.success) {
          notify(result.error || 'Từ chối thất bại.', 'error');
          return;
        }
        await loadStats();
        notify('Đã từ chối giao dịch.', 'success');
      },
    });

  const reconcileQueue = () =>
    confirm({
      title: 'Đồng bộ lại queue?',
      message: 'Công cụ này sẽ reset job kẹt và đồng bộ lại queue.',
      confirmText: 'Chạy ngay',
      cancelText: 'Hủy',
      onConfirm: async () => {
        setReconciling(true);
        try {
          const payload = await runAdminQueueReconcile();
          await loadQueue();
          if (selectedQueueJobId) {
            const detail = await getAdminQueueJobDetail(selectedQueueJobId);
            setSelectedQueueJobDetail(detail);
          }
          const resetQueued = Number(payload?.resetSummary?.resetQueued || 0);
          const resetProcessing = Number(payload?.resetSummary?.resetProcessing || 0);
          const resetStalledPreDispatch = Number(payload?.resetSummary?.resetStalledPreDispatch || 0);
          if (payload?.skipped && payload?.reason === 'dedicated_worker_mode') {
            notify(`Reconcile đã reset ${resetQueued}/${resetProcessing}/${resetStalledPreDispatch}. Worker riêng sẽ xử lý tiếp.`, 'success');
          } else {
            notify(`Đã reconcile queue: ${resetQueued}/${resetProcessing}/${resetStalledPreDispatch}.`, 'success');
          }
        } catch (error) {
          console.error('[MobileAdmin] Queue reconcile failed', error);
          notify('Queue reconcile thất bại.', 'error');
        } finally {
          setReconciling(false);
        }
      },
    });

  const openQueueDetail = async (jobId: string) => {
    setSelectedQueueJobId(jobId);
    setSelectedQueueJobDetail(null);
    setQueuePromptExpanded(false);
    setLoadingQueueDetail(true);
    try {
      const detail = await getAdminQueueJobDetail(jobId);
      setSelectedQueueJobDetail(detail);
    } catch (error) {
      console.error('[MobileAdmin] Failed to load queue detail', error);
      notify('Không thể tải chi tiết queue job.', 'error');
    } finally {
      setLoadingQueueDetail(false);
    }
  };

  const closeQueueDetail = () => {
    setSelectedQueueJobId(null);
    setSelectedQueueJobDetail(null);
    setQueuePromptExpanded(false);
  };

  const stopQueueJob = (job: AdminQueueJob) =>
    confirm({
      title: 'Dừng tiến trình?',
      message: 'Queue sẽ ngừng poll/rescue và đánh dấu job là thất bại.',
      confirmText: 'Dừng ngay',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        setStoppingQueueJobId(job.id);
        try {
          const result = await stopAdminQueueJob(job.id);
          await loadQueue();
          if (selectedQueueJobId === job.id) {
            const detail = await getAdminQueueJobDetail(job.id);
            setSelectedQueueJobDetail(detail);
          }
          notify(result?.refunded ? 'Đã dừng job và hoàn lại Vcoin.' : 'Đã dừng job.', 'success');
        } catch (error: any) {
          console.error('[MobileAdmin] Stop queue job failed', error);
          notify(error?.message || 'Không thể dừng job.', 'error');
        } finally {
          setStoppingQueueJobId(null);
        }
      },
    });

  const saveMaintenance = async () => {
    setSavingMaintenance(true);
    const result = await saveMaintenanceMode(maintenance.isActive, maintenance.message);
    setSavingMaintenance(false);
    if (!result.success) {
      notify('Không thể lưu bảo trì.', 'error');
      return;
    }
    notify('Đã lưu trạng thái bảo trì.', 'success');
  };

  const toggleFeatureMaintenance = (featureId: string) => {
    setFeatureMaintenance((current) => {
      const ids = new Set(current.disabledFeatureIds || []);
      if (ids.has(featureId)) ids.delete(featureId);
      else ids.add(featureId);
      return { ...current, disabledFeatureIds: Array.from(ids) };
    });
  };

  const saveFeatureMaintenance = async () => {
    setSavingFeatureMaintenance(true);
    const result = await saveFeatureMaintenanceConfig(featureMaintenance);
    setSavingFeatureMaintenance(false);
    if (!result.success) {
      notify('Không thể lưu bảo trì chức năng.', 'error');
      return;
    }
    notify('Đã lưu bảo trì chức năng.', 'success');
  };

  const saveUserEdit = async () => {
    if (!editingUser) return;

    const nextBalance = Number(editingUser.vcoin_balance || 0);
    const balanceChanged = editingUserOriginalBalance !== null && Math.abs(nextBalance - editingUserOriginalBalance) > 0.0001;
    const adjustmentReason = adminUserAdjustmentReason.trim();

    if (balanceChanged && !adjustmentReason) {
      notify('Nhập nội dung giao dịch sửa VCoin trước khi lưu.', 'error');
      return;
    }

    setSavingUserEdit(true);
    const result = await updateAdminUserProfile(editingUser, { adjustmentReason });
    setSavingUserEdit(false);

    if (!result.success) {
      notify(result.error || 'Không thể cập nhật người dùng.', 'error');
      return;
    }

    setEditingUser(null);
    setEditingUserOriginalBalance(null);
    setAdminUserAdjustmentReason('');
    await loadStats();
    notify('Đã cập nhật người dùng.', 'success');
  };

  const savePackageForm = async () => {
    if (!editingPackage) return;
    setSavingExtras(true);
    const result = await savePackage(editingPackage);
    setSavingExtras(false);
    if (!result.success) {
      notify(result.error || 'Không thể lưu gói nạp.', 'error');
      return;
    }
    setEditingPackage(null);
    await loadStats();
    notify('Đã lưu gói nạp.', 'success');
  };

  const removePackage = (pkg: CreditPackage) =>
    confirm({
      title: 'Xóa gói nạp?',
      message: `Gói ${pkg.name} sẽ bị xóa hoặc ẩn nếu đã phát sinh giao dịch.`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        const result = await deletePackage(pkg.id);
        if (!result.success) {
          notify(result.error || 'Không thể xóa gói nạp.', 'error');
          return;
        }
        await loadStats();
        notify(result.action === 'hidden' ? 'Gói đã được ẩn.' : 'Đã xóa gói nạp.', 'success');
      },
    });

  const movePackage = async (index: number, direction: -1 | 1) => {
    const next = [...packages];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPackages(next);
    const result = await updatePackageOrder(next);
    if (!result.success) notify(result.error || 'Không thể đổi thứ tự gói.', 'error');
  };

  const savePromotionForm = async () => {
    if (!editingPromotion) return;
    setSavingExtras(true);
    const result = await savePromotion(editingPromotion);
    setSavingExtras(false);
    if (!result.success) {
      notify(result.error || 'Không thể lưu sự kiện.', 'error');
      return;
    }
    setEditingPromotion(null);
    await loadStats();
    notify('Đã lưu sự kiện.', 'success');
  };

  const removePromotion = (promotion: PromotionCampaign) =>
    confirm({
      title: 'Xóa sự kiện?',
      message: `Xóa chiến dịch ${promotion.name}?`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        const result = await deletePromotion(promotion.id);
        if (!result.success) {
          notify(result.error || 'Không thể xóa sự kiện.', 'error');
          return;
        }
        await loadStats();
        notify('Đã xóa sự kiện.', 'success');
      },
    });

  const saveGiftcodeForm = async () => {
    if (!editingGiftcode) return;
    setSavingExtras(true);
    const normalized = {
      ...editingGiftcode,
      code: editingGiftcode.code.trim().toUpperCase(),
      campaignKey: (editingGiftcode.campaignKey || editingGiftcode.code).trim().toUpperCase(),
    };
    const result = await saveGiftcode(normalized);
    setSavingExtras(false);
    if (!result.success) {
      notify(result.error || 'Không thể lưu giftcode.', 'error');
      return;
    }
    setEditingGiftcode(null);
    await loadStats();
    notify('Đã lưu giftcode.', 'success');
  };

  const removeGiftcode = (code: Giftcode) =>
    confirm({
      title: 'Xóa giftcode?',
      message: `Xóa mã ${code.code}?`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        await deleteGiftcode(code.id);
        await loadStats();
        notify('Đã xóa giftcode.', 'success');
      },
    });

  const saveStyleForm = async () => {
    if (!editingStyle) return;
    if (!editingStyle.name.trim() || !editingStyle.image_url.trim()) {
      notify('Tên style và ảnh mẫu không được trống.', 'error');
      return;
    }
    setSavingExtras(true);
    const result = await saveStylePreset(editingStyle);
    setSavingExtras(false);
    if (!result.success) {
      notify(result.error || 'Không thể lưu style.', 'error');
      return;
    }
    setEditingStyle(null);
    await loadAdminExtras();
    notify('Đã lưu style mẫu.', 'success');
  };

  const removeStyle = (style: StylePreset) =>
    confirm({
      title: 'Xóa style mẫu?',
      message: `Xóa style ${style.name}?`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        await deleteStylePreset(style.id);
        await loadAdminExtras();
        notify('Đã xóa style.', 'success');
      },
    });

  const setPricingDraft = (row: TstPricingRow, value: string) => {
    setPricingDrafts((current) => ({ ...current, [`${row.modelId}|${row.configKey}`]: value }));
  };

  const getPricingValue = (row: TstPricingRow) => {
    const key = `${row.modelId}|${row.configKey}`;
    return pricingDrafts[key] ?? String(pricingByKey.get(key)?.audition_price_vcoin ?? row.defaultAuditionVcoin ?? row.vcoin);
  };

  const savePricingRow = async (row: TstPricingRow) => {
    const key = `${row.modelId}|${row.configKey}`;
    const price = Number(getPricingValue(row));
    if (!Number.isFinite(price) || price <= 0) {
      notify('Giá Vcoin phải lớn hơn 0.', 'error');
      return;
    }
    setSavingExtras(true);
    const existing = pricingByKey.get(key);
    const result = await saveModelPricing({
      id: existing?.id || `${row.modelId}_${row.configKey}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
      model_id: row.modelId,
      option_id: row.configKey,
      tst_price_credits: row.credits,
      audition_price_vcoin: price,
      updated_at: existing?.updated_at || new Date().toISOString(),
    });
    setSavingExtras(false);
    if (!result.success) {
      notify(result.error || 'Không thể lưu bảng giá.', 'error');
      return;
    }
    setPricingDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    await loadAdminExtras();
    notify('Đã lưu giá model.', 'success');
  };

  const saveSystemSettings = async () => {
    setSavingExtras(true);
    const [gatewayResult, announcementResult, promoResult, tutorialResult, guideResult] = await Promise.all([
      savePaymentGatewayConfig(paymentGateway),
      saveSystemAnnouncementConfig(systemAnnouncement),
      saveGiftcodePromoConfig(giftcodePromo.text, giftcodePromo.isActive),
      saveTutorialVideo(tutorialVideo.url, tutorialVideo.isActive),
      saveGenerationGuideImages(guideImages.characterUrl, guideImages.sampleUrl),
    ]);
    setSavingExtras(false);
    const failed = [gatewayResult, announcementResult, promoResult, tutorialResult, guideResult].find((result) => !result.success);
    if (failed) {
      notify(failed.error || 'Không thể lưu cấu hình hệ thống.', 'error');
      return;
    }
    await loadAdminExtras();
    notify('Đã lưu cấu hình hệ thống.', 'success');
  };

  return (
    <div className="min-h-screen bg-[#F6F6F8] pb-10 dark:bg-[#09090B]">
      <div className="sticky top-0 z-40 border-b border-gray-100 bg-[#F6F6F8]/95 px-4 pb-4 pt-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-[#09090B]/95">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => navigate('/profile')}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => void refreshAll()}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-white"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-amber-400 via-pink-500 to-fuchsia-600 text-white shadow-lg shadow-pink-500/20">
              <Shield className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-pink-500">Quản trị mobile</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Trung tâm quản trị</h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                Quản trị nhanh cho {user?.username || user?.email || 'admin'} ngay trong app.
              </p>
            </div>
          </div>

          <div className="grid grid-flow-col auto-cols-max gap-2 overflow-x-auto no-scrollbar">
            {([
              ['overview', 'Tổng quan', Activity],
              ['queue', 'Queue', SlidersHorizontal],
              ['transactions', 'Giao dịch', Wallet],
              ['users', 'User', Users],
              ['packages', 'Gói nạp', Package],
              ['marketing', 'Sự kiện', Gift],
              ['pricing', 'Bảng giá', Coins],
              ['styles', 'Style', Palette],
              ['system', 'Hệ thống', Server],
            ] as Array<[AdminTab, string, typeof Activity]>).map(([tab, label, Icon]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`inline-flex items-center gap-1.5 ${pillButtonClass(activeTab === tab)}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4 px-4 py-4">
        {activeTab === 'overview' && (
          loadingStats ? (
            <div className="flex justify-center py-20"><Loader className="h-8 w-8 animate-spin text-gray-300" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-500">Người dùng</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.usersTotal || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500">Mới hôm nay</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.newUsersToday || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-500">Ảnh/video</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.imagesTotal || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500">Chờ nạp tiền</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{pendingTransactions.length}</div></Card>
              </div>

              <Card>
                <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Activity className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Cần xử lý ngay</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Nạp tiền chờ duyệt và queue đang gặp vấn đề</p></div></div>
                <div className="space-y-3">
                  <button onClick={() => setActiveTab('transactions')} className="flex w-full items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 text-left dark:bg-zinc-800/80"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Nạp tiền</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pendingTransactions.length} giao dịch đang chờ duyệt</div></div><Wallet className="h-4 w-4 text-gray-400" /></button>
                  <button onClick={() => setActiveTab('queue')} className="flex w-full items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 text-left dark:bg-zinc-800/80"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Hàng đợi</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{queueSummary.failed} lỗi, {queueSummary.processing + queueSummary.queued} job đang chạy</div></div><AlertTriangle className="h-4 w-4 text-gray-400" /></button>
                </div>
              </Card>

              <Card>
                <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Coins className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Thống kê sử dụng</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Top công cụ được sử dụng nhiều nhất</p></div></div>
                <div className="space-y-3">{aiUsageRows.length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-5 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Chưa có dữ liệu sử dụng.</div> : aiUsageRows.map((row) => <div key={row.feature} className="flex items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80"><div className="min-w-0"><div className="truncate text-sm font-bold text-gray-900 dark:text-white">{row.feature}</div><div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{row.count} lượt</div></div><div className="text-right"><div className="text-sm font-black text-pink-500">{row.vcoins} VC</div><div className="text-[11px] text-emerald-500">{new Intl.NumberFormat('vi-VN').format(row.revenue)}đ</div></div></div>)}</div>
              </Card>

              <Card>
                <div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Settings2 className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Bảo trì hệ thống</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Bật tắt maintenance và sửa thông báo</p></div></div><button onClick={() => setMaintenance((m) => ({ ...m, isActive: !m.isActive }))} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${maintenance.isActive ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{maintenance.isActive ? 'Đang bật' : 'Đang tắt'}</button></div>
                <textarea value={maintenance.message} onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))} rows={4} className="w-full rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-800 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" placeholder="Nhập thông báo bảo trì..." />
                <button onClick={() => void saveMaintenance()} disabled={savingMaintenance} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[24px] bg-gray-900 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{savingMaintenance ? <Loader className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}Lưu bảo trì</button>
              </Card>

              <Card>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-500/10">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-gray-900 dark:text-white">Bảo trì chức năng</h2>
                      <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Khóa từng công cụ cho user, admin vẫn dùng bình thường.</p>
                    </div>
                  </div>
                </div>
                <input
                  value={featureMaintenance.message || ''}
                  onChange={(event) => setFeatureMaintenance((current) => ({ ...current, message: event.target.value }))}
                  className="mb-3 w-full rounded-[22px] border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  placeholder="Tính năng đang bảo trì. Vui lòng quay lại sau."
                />
                <div className="space-y-2">
                  {APP_CONFIG.main_features.map((feature) => {
                    const locked = featureMaintenance.disabledFeatureIds?.includes(feature.id);
                    return (
                      <button
                        key={feature.id}
                        onClick={() => toggleFeatureMaintenance(feature.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-[22px] px-4 py-3 text-left ${
                          locked
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'
                            : 'bg-gray-50 text-gray-700 dark:bg-zinc-800/80 dark:text-zinc-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black">{feature.name.vi}</div>
                          <div className="mt-0.5 truncate text-[10px] opacity-60">{feature.id}</div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${locked ? 'bg-amber-400 text-black' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                          {locked ? 'Bảo trì' : 'Mở'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => void saveFeatureMaintenance()} disabled={savingFeatureMaintenance} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[24px] bg-amber-500 px-4 py-3.5 text-sm font-bold text-black disabled:opacity-60">
                  {savingFeatureMaintenance ? <Loader className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}Lưu bảo trì chức năng
                </button>
              </Card>
            </>
          )
        )}

        {activeTab === 'queue' && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800">
                  <Activity className="h-5 w-5 text-gray-700 dark:text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900 dark:text-white">Theo dõi hàng đợi</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Tìm job theo email hoặc job id, mở chi tiết và xử lý ngay trên mobile.</p>
                </div>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2">
              {[
                ['Đang chạy', queueSummary.processing + queueSummary.queued],
                ['Lỗi', queueSummary.failed],
                ['Xong', queueSummary.completed],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[22px] bg-gray-50 px-3 py-3 dark:bg-zinc-800/80">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">{label}</div>
                  <div className="mt-1 text-xl font-black text-gray-900 dark:text-white">{value}</div>
                </div>
              ))}
            </div>

            <div className="mb-3 flex items-center gap-3 rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
              <Search className="h-4 w-4 text-gray-400 dark:text-zinc-500" />
              <input
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Tìm theo email hoặc job id"
                className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-zinc-500"
              />
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
              {(['today', 'all'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setQueueTimeScope(key)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueTimeScope === key ? (key === 'today' ? 'bg-cyan-500 text-white' : 'bg-pink-500 text-white') : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
                >
                  {key === 'today' ? 'Job hôm nay' : 'Tất cả job'}
                </button>
              ))}
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
              {(['all', 'processing', 'failed', 'completed'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setQueueStatusFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueStatusFilter === key ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
                >
                  {key === 'all' ? 'Tất cả' : key === 'processing' ? 'Đang chạy' : key === 'failed' ? 'Lỗi' : 'Hoàn thành'}
                </button>
              ))}
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
              {(['all', 'image', 'video'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setQueueAssetFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueAssetFilter === key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
                >
                  {key === 'image' ? 'Ảnh' : key === 'video' ? 'Video' : 'Tất cả'}
                </button>
              ))}
              <button
                onClick={() => setQueueStuckOnly((current) => !current)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueStuckOnly ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
              >
                {queueStuckOnly ? 'Chỉ job kẹt' : 'Hiện cả job thường'}
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => void loadQueue()}
                disabled={loadingQueue}
                className="flex items-center justify-center gap-2 rounded-[22px] bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 disabled:opacity-60 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {loadingQueue ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Làm mới
              </button>
              <button
                onClick={reconcileQueue}
                disabled={reconciling}
                className="flex items-center justify-center gap-2 rounded-[22px] bg-pink-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {reconciling ? <Loader className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Reconcile
              </button>
            </div>

            {loadingQueue ? (
              <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div>
            ) : queueJobs.length === 0 ? (
              <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Không có queue job phù hợp.</div>
            ) : (
              <div className="space-y-3">
                {queueJobs.map((job) => {
                  const status = getQueueStatus(job);
                  const canStop = ['queued', 'processing', 'rescuing'].includes(status);
                  const lastLogMessage = job.lastLogMessage || (job.queueLogs && job.queueLogs.length > 0 ? job.queueLogs[job.queueLogs.length - 1]?.message : '') || job.error || formatDateTime(job.updatedAt);
                  return (
                    <div key={job.id} className="rounded-[24px] bg-gray-50 p-4 dark:bg-zinc-800/80">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-gray-900 dark:text-white">{job.userName || job.userEmail || 'Người dùng không xác định'}</div>
                          <div className="mt-1 truncate text-[11px] text-gray-500 dark:text-zinc-400">{job.userEmail || job.userId}</div>
                        </div>
                        <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getQueueStatusTone(status)}`}>{getQueueStatusLabel(status)}</div>
                      </div>

                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {job.assetType === 'video' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-600 dark:bg-purple-500/10 dark:text-purple-300"><Video className="h-3 w-3" />Video</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><ImageIcon className="h-3 w-3" />Ảnh</span>
                        )}
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-600 dark:bg-zinc-900 dark:text-zinc-300">{getQueuePlatformLabel(job.clientPlatform)}</span>
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400">{Math.round(job.progress || 0)}%</span>
                        {job.isStuck ? <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{job.health?.label || 'STUCK'}</span> : null}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-gray-400 dark:text-zinc-500">Job</div>
                          <div className="mt-1 font-mono text-sm text-gray-900 dark:text-white">{job.id.slice(0, 12)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 dark:text-zinc-500">Stage</div>
                          <div className="mt-1 text-sm text-gray-900 dark:text-white">{getQueueStageLabel(job.queueStage)}</div>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-gray-700 dark:text-zinc-200">{job.toolName || (job.assetType === 'video' ? 'Video' : 'Ảnh')}</div>
                      {job.health ? (
                        <div className={`mt-3 rounded-2xl border px-3 py-3 text-xs ${getQueueHealthTone(job.health.severity)}`}>
                          <div className="font-black">{job.health.label}</div>
                          <div className="mt-1 leading-relaxed opacity-90">{job.health.detail}</div>
                          <div className="mt-2 font-bold">Hành động: {job.health.action}</div>
                          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                            <span className="rounded-full bg-white/40 px-2 py-0.5 dark:bg-black/20">lease: {job.health.leaseState || '-'}</span>
                            {typeof job.health.recoveries === 'number' ? <span className="rounded-full bg-white/40 px-2 py-0.5 dark:bg-black/20">recoveries: {job.health.recoveries}</span> : null}
                            {job.health.providerRisk ? <span className="rounded-full bg-white/40 px-2 py-0.5 dark:bg-black/20">provider-risk</span> : null}
                            {job.health.safeToRequeue ? <span className="rounded-full bg-white/40 px-2 py-0.5 dark:bg-black/20">safe-requeue</span> : null}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">{lastLogMessage}</div>

                      <div className="mt-4 flex gap-2">
                        <button onClick={() => void openQueueDetail(job.id)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 text-sm font-bold text-white dark:bg-white dark:text-black">
                          Xem chi tiết
                        </button>
                        {canStop ? (
                          <button
                            onClick={() => stopQueueJob(job)}
                            disabled={stoppingQueueJobId === job.id}
                            className="flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                          >
                            {stoppingQueueJobId === job.id ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Dừng
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'transactions' && (
          <Card>
            <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Wallet className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Giao dịch nạp tiền</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Duyệt giao dịch chờ ngay trên mobile</p></div></div>
            {loadingStats ? <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div> : (stats?.transactions || []).length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Chưa có giao dịch nào.</div> : <div className="space-y-3">{((stats?.transactions || []) as Transaction[]).slice(0, 20).map((tx: Transaction) => <div key={tx.id} className="rounded-[24px] bg-gray-50 p-4 dark:bg-zinc-800/80"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{tx.userName || tx.userEmail || 'Người dùng không xác định'}</div><div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{tx.userEmail || tx.userId}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tx.status === 'pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : tx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'}`}>{getPaymentStatusLabel(tx.status)}</div></div><div className="grid grid-cols-2 gap-3 text-xs"><div><div className="text-gray-400 dark:text-zinc-500">Số tiền</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('vi-VN').format(Number(tx.amount || 0))}đ</div></div><div><div className="text-gray-400 dark:text-zinc-500">Vcoin</div><div className="mt-1 text-sm font-bold text-pink-500">{tx.vcoin_received} VC</div></div></div><div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">{formatDateTime(tx.createdAt)}{tx.order_code ? ` • ${tx.order_code}` : ''}</div>{tx.status === 'pending' ? <div className="mt-4 flex gap-2"><button onClick={() => approveTransaction(tx)} disabled={actingTransactionId === tx.id} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{actingTransactionId === tx.id ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Duyệt</button><button onClick={() => rejectTransaction(tx)} disabled={actingTransactionId === tx.id} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{actingTransactionId === tx.id ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Từ chối</button></div> : null}</div>)}</div>}
          </Card>
        )}

        {activeTab === 'users' && (
          <Card>
            <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Users className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Người dùng</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Tìm người dùng, xem số dư, vai trò và hoạt động</p></div></div>
            <div className="mb-4 flex items-center gap-3 rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"><Search className="h-4 w-4 text-gray-400 dark:text-zinc-500" /><input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Tìm theo tên hoặc email" className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-zinc-500" /></div>
            {loadingStats ? <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div> : filteredUsers.length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Không tìm thấy người dùng.</div> : <div className="space-y-3">{filteredUsers.map((entry: AdminUserRow) => <div key={entry.id} className="w-full rounded-[24px] bg-gray-50 p-4 text-left dark:bg-zinc-800/80"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{entry.username || entry.email}</div><div className="mt-1 truncate text-[11px] text-gray-500 dark:text-zinc-400">{entry.email}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${entry.role === 'admin' ? 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300' : 'bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-zinc-200'}`}>{getRoleLabel(entry.role)}</div></div><div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900"><div className="text-gray-400 dark:text-zinc-500">Số dư</div><div className="mt-1 text-sm font-bold text-amber-600 dark:text-amber-300">{Number(entry.vcoin_balance || 0).toLocaleString()} VC</div></div><div className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900"><div className="text-gray-400 dark:text-zinc-500">Lượt dùng</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{entry.usageCount || 0}</div></div></div><div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">Hoạt động gần nhất: {getUserLastSeen(entry)}</div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => void openUserLedger(entry)} className="rounded-2xl bg-pink-500 px-3 py-2.5 text-xs font-bold text-white">Lịch sử</button><button onClick={() => openEditUser(entry)} className="rounded-2xl bg-cyan-500 px-3 py-2.5 text-xs font-bold text-white">Sửa user</button></div></div>)}</div>}
          </Card>
        )}

        {activeTab === 'packages' && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Package className="h-5 w-5 text-gray-700 dark:text-white" /></div>
                <div><h2 className="text-base font-black text-gray-900 dark:text-white">Gói nạp</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Tạo, sửa, bật tắt và đổi thứ tự gói Vcoin.</p></div>
              </div>
              <button onClick={() => setEditingPackage(newCreditPackage())} className="rounded-full bg-gray-900 p-2.5 text-white dark:bg-white dark:text-black"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {packages.map((pkg, index) => (
                <div key={pkg.id} className={compactPanelClass}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{pkg.name}</div><div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{pkg.transferContent || 'Chưa có cú pháp CK'}</div></div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${pkg.isActive === false ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{pkg.isActive === false ? 'Ẩn' : 'Hiện'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-2xl bg-white px-3 py-2.5 dark:bg-zinc-900"><div className="text-gray-400">Giá</div><div className="mt-1 font-black text-gray-900 dark:text-white">{Number(pkg.price || 0).toLocaleString('vi-VN')}đ</div></div>
                    <div className="rounded-2xl bg-white px-3 py-2.5 dark:bg-zinc-900"><div className="text-gray-400">Vcoin</div><div className="mt-1 font-black text-pink-500">{Number(pkg.vcoin || 0).toLocaleString('vi-VN')} VC</div></div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <button onClick={() => void movePackage(index, -1)} disabled={index === 0} className="rounded-2xl bg-white py-2 text-gray-600 disabled:opacity-30 dark:bg-zinc-900 dark:text-zinc-200"><ChevronUp className="mx-auto h-4 w-4" /></button>
                    <button onClick={() => void movePackage(index, 1)} disabled={index === packages.length - 1} className="rounded-2xl bg-white py-2 text-gray-600 disabled:opacity-30 dark:bg-zinc-900 dark:text-zinc-200"><ChevronDown className="mx-auto h-4 w-4" /></button>
                    <button onClick={() => setEditingPackage(pkg)} className="rounded-2xl bg-blue-500 py-2 text-white"><Pencil className="mx-auto h-4 w-4" /></button>
                    <button onClick={() => removePackage(pkg)} className="rounded-2xl bg-red-500 py-2 text-white"><Trash2 className="mx-auto h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeTab === 'marketing' && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Megaphone className="h-5 w-5 text-gray-700 dark:text-white" /></div>
                <div><h2 className="text-base font-black text-gray-900 dark:text-white">Sự kiện & Giftcode</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Quản lý khuyến mãi nạp và mã thưởng.</p></div>
              </div>
              <button onClick={() => setEditingGiftcode(newGiftcode())} className="rounded-full bg-gray-900 p-2.5 text-white dark:bg-white dark:text-black"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="mb-4 flex items-center gap-3 rounded-[18px] border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"><Search className="h-4 w-4 text-gray-400" /><input value={marketingSearch} onChange={(e) => setMarketingSearch(e.target.value)} placeholder="Tìm code hoặc chiến dịch" className="w-full bg-transparent text-sm outline-none dark:text-white" /></div>
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-gray-900 dark:text-white">Chiến dịch bonus</h3><button onClick={() => setEditingPromotion(newPromotion())} className="text-xs font-bold text-pink-500">Thêm</button></div>
              <div className="space-y-2">
                {promotions.length === 0 ? <div className={compactPanelClass}>Chưa có chiến dịch.</div> : promotions.map((promo) => (
                  <div key={promo.id} className={compactPanelClass}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{promo.name}</div><div className="mt-1 text-xs font-bold text-pink-500">+{promo.bonusPercent}% Vcoin</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${promo.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'}`}>{promo.isActive ? 'ON' : 'OFF'}</span></div>
                    <div className="mt-2 text-[11px] text-gray-500 dark:text-zinc-400">{formatDateTime(promo.startTime)} - {formatDateTime(promo.endTime)}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setEditingPromotion(promo)} className="rounded-2xl bg-blue-500 py-2 text-xs font-bold text-white">Sửa</button><button onClick={() => removePromotion(promo)} className="rounded-2xl bg-red-500 py-2 text-xs font-bold text-white">Xóa</button></div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-black text-gray-900 dark:text-white">Giftcode</h3>
              <div className="space-y-2">
                {filteredMarketingGiftcodes.map((code) => {
                  const progress = code.totalLimit > 0 ? Math.min(100, (Number(code.usedCount || 0) / Number(code.totalLimit)) * 100) : 0;
                  return (
                    <div key={code.id} className={compactPanelClass}>
                      <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-sm font-black text-gray-900 dark:text-white">{code.code}</div><div className="mt-1 text-xs font-bold text-amber-600 dark:text-amber-300">+{code.reward} VC</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${code.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'}`}>{code.isActive ? 'ACTIVE' : 'OFF'}</span></div>
                      <div className="mt-3 flex justify-between text-[11px] text-gray-500"><span>{code.campaignKey || code.code}</span><span>{code.usedCount}/{code.totalLimit}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-zinc-900"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
                      <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setEditingGiftcode(code)} className="rounded-2xl bg-blue-500 py-2 text-xs font-bold text-white">Sửa</button><button onClick={() => removeGiftcode(code)} className="rounded-2xl bg-red-500 py-2 text-xs font-bold text-white">Xóa</button></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'pricing' && (
          <Card>
            <div className="mb-4 flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Coins className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Bảng giá AI</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Sửa giá Vcoin theo model, server, độ phân giải và duration.</p></div></div>
            <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
              <div className={compactPanelClass}><div className="text-gray-400">Rows</div><div className="mt-1 text-lg font-black dark:text-white">{pricingRows.length}</div></div>
              <div className={compactPanelClass}><div className="text-gray-400">Model</div><div className="mt-1 text-lg font-black text-cyan-500">{new Set(pricingRows.map((row) => row.modelId)).size}</div></div>
              <div className={compactPanelClass}><div className="text-gray-400">Đã lưu</div><div className="mt-1 text-lg font-black text-pink-500">{modelPricing.length}</div></div>
            </div>
            <div className="mb-4 flex items-center gap-3 rounded-[18px] border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"><Search className="h-4 w-4 text-gray-400" /><input value={pricingSearch} onChange={(e) => setPricingSearch(e.target.value)} placeholder="Tìm model, server, duration" className="w-full bg-transparent text-sm outline-none dark:text-white" /></div>
            <div className="space-y-2">
              {filteredPricingRows.slice(0, 80).map((row) => {
                const saved = pricingByKey.get(`${row.modelId}|${row.configKey}`);
                return (
                  <div key={`${row.modelId}-${row.configKey}-${row.server}`} className={compactPanelClass}>
                    <div className="mb-2 flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{row.modelName}</div><div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{row.type} · {row.server || 'default'} · {row.resolution || '-'} · {row.duration || row.quality || row.speed || '-'}</div></div><span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-bold text-gray-700 dark:bg-zinc-900 dark:text-zinc-300">{row.billingUnit === 'second' ? '/giây' : 'flat'}</span></div>
                    <div className="grid grid-cols-[1fr_auto] gap-2"><input type="number" value={getPricingValue(row)} onChange={(e) => setPricingDraft(row, e.target.value)} className={fieldClass} /><button onClick={() => void savePricingRow(row)} disabled={savingExtras} className="rounded-2xl bg-gray-900 px-3 text-white disabled:opacity-60 dark:bg-white dark:text-black"><Save className="h-4 w-4" /></button></div>
                    <div className="mt-2 text-[11px] text-gray-500 dark:text-zinc-400">TST: {row.credits} credits · Gợi ý: {row.defaultAuditionVcoin ?? row.vcoin} VC{saved ? ` · Đang lưu: ${saved.audition_price_vcoin} VC` : ''}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {activeTab === 'styles' && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Palette className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Style mẫu</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Quản lý ảnh reference và trigger prompt.</p></div></div><button onClick={() => setEditingStyle(newStylePreset())} className="rounded-full bg-gray-900 p-2.5 text-white dark:bg-white dark:text-black"><Plus className="h-4 w-4" /></button></div>
            <div className="mb-4 flex items-center gap-3 rounded-[18px] border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800"><Search className="h-4 w-4 text-gray-400" /><input value={styleSearch} onChange={(e) => setStyleSearch(e.target.value)} placeholder="Tìm style" className="w-full bg-transparent text-sm outline-none dark:text-white" /></div>
            <div className="grid grid-cols-2 gap-3">
              {filteredStyles.map((style) => (
                <div key={style.id} className="overflow-hidden rounded-[18px] bg-gray-50 dark:bg-zinc-800/80">
                  <div className="aspect-[4/5] bg-gray-200 dark:bg-zinc-900">{style.image_url ? <img src={style.image_url} alt={style.name} className="h-full w-full object-cover" /> : null}</div>
                  <div className="p-3"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{style.name}</div><div className="mt-1 text-[10px] text-gray-500">{style.is_default ? 'Mặc định · ' : ''}{style.is_active ? 'Đang bật' : 'Đang tắt'}</div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setEditingStyle(style)} className="rounded-xl bg-blue-500 py-2 text-xs font-bold text-white">Sửa</button><button onClick={() => removeStyle(style)} className="rounded-xl bg-red-500 py-2 text-xs font-bold text-white">Xóa</button></div></div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeTab === 'system' && (
          <Card>
            <div className="mb-4 flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Server className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Hệ thống</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Payment gateway, thông báo, banner code, hướng dẫn và API keys.</p></div></div>
            <div className="space-y-3">
              <div className={compactPanelClass}><div className="mb-2 flex items-center gap-2 text-sm font-black text-gray-900 dark:text-white"><CreditCard className="h-4 w-4" />Cổng thanh toán</div><select value={paymentGateway} onChange={(e) => setPaymentGateway(e.target.value as PaymentGateway)} className={fieldClass}><option value="sepay">SePay</option></select></div>
              <div className={compactPanelClass}><div className="mb-2 text-sm font-black text-gray-900 dark:text-white">Thông báo hệ thống</div><div className="mb-2 flex gap-2">{(['info', 'promo', 'warning'] as const).map((variant) => <button key={variant} onClick={() => setSystemAnnouncement((current) => ({ ...current, variant }))} className={pillButtonClass(systemAnnouncement.variant === variant)}>{variant}</button>)}</div><input value={systemAnnouncement.title} onChange={(e) => setSystemAnnouncement((current) => ({ ...current, title: e.target.value }))} className={`${fieldClass} mb-2`} placeholder="Tiêu đề" /><textarea value={systemAnnouncement.message} onChange={(e) => setSystemAnnouncement((current) => ({ ...current, message: e.target.value }))} className={fieldClass} rows={3} placeholder="Nội dung" /><button onClick={() => setSystemAnnouncement((current) => ({ ...current, isActive: !current.isActive }))} className={`mt-2 ${pillButtonClass(systemAnnouncement.isActive, 'bg-pink-500 text-white')}`}>{systemAnnouncement.isActive ? 'Đang bật' : 'Đang tắt'}</button></div>
              <div className={compactPanelClass}><div className="mb-2 text-sm font-black text-gray-900 dark:text-white">Banner giftcode</div><input value={giftcodePromo.text} onChange={(e) => setGiftcodePromo((current) => ({ ...current, text: e.target.value }))} className={fieldClass} /><button onClick={() => setGiftcodePromo((current) => ({ ...current, isActive: !current.isActive }))} className={`mt-2 ${pillButtonClass(giftcodePromo.isActive, 'bg-emerald-500 text-white')}`}>{giftcodePromo.isActive ? 'Đang bật' : 'Đang tắt'}</button></div>
              <div className={compactPanelClass}><div className="mb-2 text-sm font-black text-gray-900 dark:text-white">Video hướng dẫn</div><input value={tutorialVideo.url} onChange={(e) => setTutorialVideo((current) => ({ ...current, url: e.target.value }))} className={fieldClass} placeholder="YouTube URL" /><button onClick={() => setTutorialVideo((current) => ({ ...current, isActive: !current.isActive }))} className={`mt-2 ${pillButtonClass(tutorialVideo.isActive, 'bg-cyan-500 text-white')}`}>{tutorialVideo.isActive ? 'Đang bật' : 'Đang tắt'}</button></div>
              <div className={compactPanelClass}><div className="mb-2 text-sm font-black text-gray-900 dark:text-white">Ảnh guide tạo nhân vật</div><input value={guideImages.characterUrl} onChange={(e) => setGuideImages((current) => ({ ...current, characterUrl: e.target.value }))} className={`${fieldClass} mb-2`} placeholder="Character image URL" /><input value={guideImages.sampleUrl} onChange={(e) => setGuideImages((current) => ({ ...current, sampleUrl: e.target.value }))} className={fieldClass} placeholder="Sample image URL" /></div>
              <button onClick={() => void saveSystemSettings()} disabled={savingExtras} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gray-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{savingExtras ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu cấu hình hệ thống</button>
              <div className={compactPanelClass}><div className="mb-2 flex items-center gap-2 text-sm font-black text-gray-900 dark:text-white"><KeyRound className="h-4 w-4" />API keys</div><div className="space-y-2">{apiKeys.length === 0 ? <div className="text-xs text-gray-500">Chưa có key.</div> : apiKeys.map((key) => <div key={key.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-zinc-900"><div className="min-w-0"><div className="truncate text-xs font-bold text-gray-900 dark:text-white">{key.name || key.id}</div><div className="text-[10px] text-gray-500">{key.status || 'unknown'} · {key.last_used_at || key.created_at || ''}</div></div><button onClick={async () => { await deleteApiKey(key.id); await loadAdminExtras(); notify('Đã xóa API key.', 'success'); }} className="rounded-xl bg-red-500 p-2 text-white"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div></div>
            </div>
          </Card>
        )}

        {viewingUser ? (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-[28px] bg-white p-4 dark:bg-[#18181B]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black text-gray-900 dark:text-white">{viewingUser.username || viewingUser.email}</h3>
                  <div className="mt-1 truncate text-xs text-gray-500 dark:text-zinc-400">{viewingUser.email}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{Number(viewingUser.vcoin_balance || 0).toLocaleString('vi-VN')} VC</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">{userHistory.length} giao dịch</span>
                  </div>
                </div>
                <button onClick={() => setViewingUser(null)} className="rounded-full bg-gray-100 p-2 dark:bg-zinc-800"><XCircle className="h-5 w-5" /></button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                {loadingUserDetails ? (
                  <div className="flex justify-center py-14"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div>
                ) : (
                  <div className="space-y-4">
                    {userLedgerSections.map((section) => {
                      const SectionIcon = section.icon;
                      const sectionLimit = userLedgerSectionLimits[section.id] || 10;
                      const visibleItems = section.items.slice(0, sectionLimit);
                      const sectionTotal = section.items.reduce((sum, item) => sum + Number(item.vcoinChange || 0), 0);
                      return (
                        <div key={section.id} className="rounded-[24px] bg-gray-50 p-3 dark:bg-zinc-800/80">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900"><SectionIcon className="h-4 w-4 text-cyan-500" /></div>
                              <div>
                                <div className="text-sm font-black text-gray-900 dark:text-white">{section.title}</div>
                                <div className="text-[10px] text-gray-500 dark:text-zinc-400">{section.items.length} giao dịch</div>
                              </div>
                            </div>
                            <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${sectionTotal >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-300'}`}>
                              {sectionTotal > 0 ? '+' : ''}{formatVcoin(sectionTotal)}
                            </div>
                          </div>
                          {visibleItems.length === 0 ? (
                            <div className="rounded-2xl bg-white px-3 py-5 text-sm text-gray-400 dark:bg-zinc-900 dark:text-zinc-500">Không có dữ liệu.</div>
                          ) : (
                            <div className="space-y-2">
                              {visibleItems.map((item) => {
                                const asset = getHistoryAsset(item);
                                const isVideo = asset ? asset.assetType === 'video' || String(asset.queueKind || '').includes('video') || String(asset.queueKind || '').includes('motion') : false;
                                return (
                                  <div key={item.id} className="rounded-2xl bg-white p-3 dark:bg-zinc-900">
                                    <div className="flex gap-3">
                                      {asset?.url ? (
                                        <button onClick={() => window.open(asset.url, '_blank')} className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gray-100 dark:bg-black">
                                          {isVideo ? <video src={asset.url} className="h-full w-full object-cover" muted playsInline /> : <img src={asset.url} className="h-full w-full object-cover" alt={asset.toolName || item.description} />}
                                        </button>
                                      ) : null}
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="truncate text-sm font-black text-gray-900 dark:text-white">{item.description}</div>
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${historyStatusTone(item)}`}>{historyStatusLabel(item)}</span>
                                          {(item.category === 'admin_transaction' || item.type === 'admin_adjustment') ? (
                                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">Admin Transaction</span>
                                          ) : null}
                                        </div>
                                        <div className="mt-1 truncate text-[10px] text-gray-500 dark:text-zinc-400">ID: {item.referenceId || item.id}</div>
                                        <div className="mt-2 flex items-center justify-between gap-3">
                                          <div className={`text-sm font-black ${item.vcoinChange > 0 ? 'text-emerald-600 dark:text-emerald-300' : item.vcoinChange < 0 ? 'text-pink-500' : 'text-gray-500'}`}>{item.vcoinChange > 0 ? '+' : ''}{formatVcoin(item.vcoinChange)}</div>
                                          <div className="text-xs font-bold text-amber-600 dark:text-amber-300">Sau: {formatVcoin(item.balanceAfter)}</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {section.items.length > sectionLimit ? (
                                <button onClick={() => showMoreUserLedgerSection(section.id)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-bold text-cyan-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-cyan-300">
                                  Xem thêm 10 giao dịch ({section.items.length - sectionLimit} còn lại)
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {editingUser ? (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[24px] bg-white p-4 dark:bg-[#18181B]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-gray-900 dark:text-white">Sửa người dùng</h3>
                  <div className="mt-1 truncate text-xs text-gray-500 dark:text-zinc-400">{editingUser.email}</div>
                </div>
                <button
                  onClick={() => {
                    setEditingUser(null);
                    setEditingUserOriginalBalance(null);
                    setAdminUserAdjustmentReason('');
                  }}
                  className="rounded-full bg-gray-100 p-2 dark:bg-zinc-800"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3">
                <input value={editingUser.username || ''} onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })} className={fieldClass} placeholder="Tên hiển thị" />
                <input type="number" value={editingUser.vcoin_balance || 0} onChange={(e) => setEditingUser({ ...editingUser, vcoin_balance: Number(e.target.value) })} className={fieldClass} placeholder="Số dư VCoin" />
                <textarea
                  value={adminUserAdjustmentReason}
                  onChange={(e) => setAdminUserAdjustmentReason(e.target.value)}
                  rows={3}
                  className={`${fieldClass} min-h-[96px] resize-none`}
                  placeholder="Nội dung giao dịch sửa VCoin"
                />
                <input value={editingUser.avatar || ''} onChange={(e) => setEditingUser({ ...editingUser, avatar: e.target.value })} className={fieldClass} placeholder="Avatar URL" />
                <div className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  Khi số dư VCoin thay đổi, nội dung giao dịch là bắt buộc và sẽ hiện trong lịch sử với tag Admin Transaction.
                </div>
                <button onClick={() => void saveUserEdit()} disabled={savingUserEdit} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gray-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">
                  {savingUserEdit ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu người dùng
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {editingPackage ? (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[24px] bg-white p-4 dark:bg-[#18181B]">
              <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-gray-900 dark:text-white">Gói nạp</h3><button onClick={() => setEditingPackage(null)} className="rounded-full bg-gray-100 p-2 dark:bg-zinc-800"><XCircle className="h-5 w-5" /></button></div>
              <div className="space-y-3">
                <input value={editingPackage.name} onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })} className={fieldClass} placeholder="Tên gói" />
                <div className="grid grid-cols-2 gap-2"><input type="number" value={editingPackage.price} onChange={(e) => setEditingPackage({ ...editingPackage, price: Number(e.target.value) })} className={fieldClass} placeholder="Giá VND" /><input type="number" value={editingPackage.vcoin} onChange={(e) => setEditingPackage({ ...editingPackage, vcoin: Number(e.target.value) })} className={fieldClass} placeholder="Vcoin" /></div>
                <div className="grid grid-cols-2 gap-2"><input value={editingPackage.bonusText || ''} onChange={(e) => setEditingPackage({ ...editingPackage, bonusText: e.target.value })} className={fieldClass} placeholder="Tag" /><input type="number" value={editingPackage.bonusPercent || 0} onChange={(e) => setEditingPackage({ ...editingPackage, bonusPercent: Number(e.target.value) })} className={fieldClass} placeholder="% Bonus" /></div>
                <input value={editingPackage.transferContent || ''} onChange={(e) => setEditingPackage({ ...editingPackage, transferContent: e.target.value })} className={fieldClass} placeholder="Cú pháp chuyển khoản" />
                <div className="grid grid-cols-2 gap-2"><button onClick={() => setEditingPackage({ ...editingPackage, isActive: !editingPackage.isActive })} className={pillButtonClass(editingPackage.isActive !== false, 'bg-emerald-500 text-white')}>{editingPackage.isActive === false ? 'Đang ẩn' : 'Đang hiện'}</button><button onClick={() => setEditingPackage({ ...editingPackage, isPopular: !editingPackage.isPopular })} className={pillButtonClass(!!editingPackage.isPopular, 'bg-pink-500 text-white')}>{editingPackage.isPopular ? 'Popular' : 'Không popular'}</button></div>
                <button onClick={() => void savePackageForm()} disabled={savingExtras} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gray-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{savingExtras ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu gói</button>
              </div>
            </div>
          </div>
        ) : null}

        {editingPromotion ? (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[24px] bg-white p-4 dark:bg-[#18181B]">
              <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-gray-900 dark:text-white">Chiến dịch</h3><button onClick={() => setEditingPromotion(null)} className="rounded-full bg-gray-100 p-2 dark:bg-zinc-800"><XCircle className="h-5 w-5" /></button></div>
              <div className="space-y-3">
                <input value={editingPromotion.name} onChange={(e) => setEditingPromotion({ ...editingPromotion, name: e.target.value })} className={fieldClass} placeholder="Tên chiến dịch" />
                <input value={editingPromotion.marqueeText} onChange={(e) => setEditingPromotion({ ...editingPromotion, marqueeText: e.target.value })} className={fieldClass} placeholder="Thông báo chạy" />
                <input type="number" value={editingPromotion.bonusPercent} onChange={(e) => setEditingPromotion({ ...editingPromotion, bonusPercent: Number(e.target.value) })} className={fieldClass} placeholder="% Bonus" />
                <div className="grid grid-cols-2 gap-2"><input type="datetime-local" value={formatVietnamDateTimeLocal(editingPromotion.startTime)} onChange={(e) => setEditingPromotion({ ...editingPromotion, startTime: parseVietnamDateTimeLocalToIso(e.target.value, editingPromotion.startTime) })} className={fieldClass} /><input type="datetime-local" value={formatVietnamDateTimeLocal(editingPromotion.endTime)} onChange={(e) => setEditingPromotion({ ...editingPromotion, endTime: parseVietnamDateTimeLocalToIso(e.target.value, editingPromotion.endTime) })} className={fieldClass} /></div>
                <div className="text-[11px] font-bold text-cyan-500 dark:text-cyan-300">Múi giờ: Việt Nam (UTC+7)</div>
                <button onClick={() => setEditingPromotion({ ...editingPromotion, isActive: !editingPromotion.isActive })} className={pillButtonClass(editingPromotion.isActive, 'bg-emerald-500 text-white')}>{editingPromotion.isActive ? 'Đang bật' : 'Đang tắt'}</button>
                <button onClick={() => void savePromotionForm()} disabled={savingExtras} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gray-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{savingExtras ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu chiến dịch</button>
              </div>
            </div>
          </div>
        ) : null}

        {editingGiftcode ? (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[24px] bg-white p-4 dark:bg-[#18181B]">
              <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-gray-900 dark:text-white">Giftcode</h3><button onClick={() => setEditingGiftcode(null)} className="rounded-full bg-gray-100 p-2 dark:bg-zinc-800"><XCircle className="h-5 w-5" /></button></div>
              <div className="space-y-3">
                <input value={editingGiftcode.code} onChange={(e) => setEditingGiftcode({ ...editingGiftcode, code: e.target.value.toUpperCase() })} className={`${fieldClass} font-mono font-bold`} placeholder="Mã code" />
                <input value={editingGiftcode.campaignKey || ''} onChange={(e) => setEditingGiftcode({ ...editingGiftcode, campaignKey: e.target.value.toUpperCase() })} className={`${fieldClass} font-mono font-bold`} placeholder="Mã chiến dịch" />
                <div className="grid grid-cols-3 gap-2"><input type="number" value={editingGiftcode.reward} onChange={(e) => setEditingGiftcode({ ...editingGiftcode, reward: Number(e.target.value) })} className={fieldClass} placeholder="Vcoin" /><input type="number" value={editingGiftcode.totalLimit} onChange={(e) => setEditingGiftcode({ ...editingGiftcode, totalLimit: Number(e.target.value) })} className={fieldClass} placeholder="Tổng" /><input type="number" value={editingGiftcode.maxPerUser} onChange={(e) => setEditingGiftcode({ ...editingGiftcode, maxPerUser: Number(e.target.value) })} className={fieldClass} placeholder="Max/user" /></div>
                <button onClick={() => setEditingGiftcode({ ...editingGiftcode, isActive: !editingGiftcode.isActive })} className={pillButtonClass(editingGiftcode.isActive, 'bg-emerald-500 text-white')}>{editingGiftcode.isActive ? 'Đang bật' : 'Đang tắt'}</button>
                <button onClick={() => void saveGiftcodeForm()} disabled={savingExtras} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gray-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{savingExtras ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu giftcode</button>
              </div>
            </div>
          </div>
        ) : null}

        {editingStyle ? (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[24px] bg-white p-4 dark:bg-[#18181B]">
              <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-gray-900 dark:text-white">Style mẫu</h3><button onClick={() => setEditingStyle(null)} className="rounded-full bg-gray-100 p-2 dark:bg-zinc-800"><XCircle className="h-5 w-5" /></button></div>
              <div className="space-y-3">
                <input value={editingStyle.name} onChange={(e) => setEditingStyle({ ...editingStyle, name: e.target.value })} className={fieldClass} placeholder="Tên style" />
                <input value={editingStyle.image_url} onChange={(e) => setEditingStyle({ ...editingStyle, image_url: e.target.value })} className={fieldClass} placeholder="URL ảnh mẫu" />
                {editingStyle.image_url ? <img src={editingStyle.image_url} alt={editingStyle.name} className="max-h-64 w-full rounded-[18px] bg-gray-100 object-contain dark:bg-zinc-900" /> : null}
                <textarea value={editingStyle.trigger_prompt || ''} onChange={(e) => setEditingStyle({ ...editingStyle, trigger_prompt: e.target.value })} className={fieldClass} rows={4} placeholder="Trigger prompt" />
                <div className="grid grid-cols-2 gap-2"><button onClick={() => setEditingStyle({ ...editingStyle, is_active: !editingStyle.is_active })} className={pillButtonClass(editingStyle.is_active, 'bg-emerald-500 text-white')}>{editingStyle.is_active ? 'Đang bật' : 'Đang tắt'}</button><button onClick={() => setEditingStyle({ ...editingStyle, is_default: !editingStyle.is_default })} className={pillButtonClass(editingStyle.is_default, 'bg-pink-500 text-white')}>{editingStyle.is_default ? 'Mặc định' : 'Không mặc định'}</button></div>
                <button onClick={() => void saveStyleForm()} disabled={savingExtras} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gray-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{savingExtras ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu style</button>
              </div>
            </div>
          </div>
        ) : null}

        {selectedQueueJobId ? (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
            <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-[32px] bg-white dark:bg-[#18181B]">
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 dark:border-zinc-800">
                <div>
                  <div className="text-base font-black text-gray-900 dark:text-white">Chi tiết Queue Job</div>
                  <div className="mt-1 text-[11px] font-mono text-gray-500 dark:text-zinc-400">{selectedQueueJobId}</div>
                </div>
                <button onClick={closeQueueDetail} className="rounded-full bg-gray-100 p-2 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[calc(88vh-84px)] overflow-y-auto px-4 py-4">
                {loadingQueueDetail ? (
                  <div className="flex justify-center py-16"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div>
                ) : !selectedQueueJobDetail ? (
                  <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Không thể tải chi tiết queue job.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Trạng thái</div>
                        <div className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold ${getQueueStatusTone(getQueueStatus(selectedQueueJobDetail.job))}`}>{getQueueStatusLabel(getQueueStatus(selectedQueueJobDetail.job))}</div>
                        <div className="mt-2 text-sm text-gray-900 dark:text-white">{getQueueStageLabel(selectedQueueJobDetail.job.queueStage)}</div>
                      </div>
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Tiến trình</div>
                        <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{Math.round(selectedQueueJobDetail.job.progress || 0)}%</div>
                        <div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-zinc-900">
                          <div className={`h-full rounded-full ${getQueueStatus(selectedQueueJobDetail.job) === 'failed' ? 'bg-red-500' : getQueueStatus(selectedQueueJobDetail.job) === 'completed' ? 'bg-emerald-500' : 'bg-cyan-500'}`} style={{ width: `${Math.max(0, Math.min(100, selectedQueueJobDetail.job.progress || 0))}%` }} />
                        </div>
                      </div>
                    </div>

                    {selectedQueueJobDetail.job.health ? (
                      <div className={`rounded-[24px] border px-4 py-4 text-sm ${getQueueHealthTone(selectedQueueJobDetail.job.health.severity)}`}>
                        <div className="font-black">{selectedQueueJobDetail.job.health.label}</div>
                        <div className="mt-2 leading-relaxed opacity-90">{selectedQueueJobDetail.job.health.detail}</div>
                        <div className="mt-2 font-bold">Hành động: {selectedQueueJobDetail.job.health.action}</div>
                        <div className="mt-3 flex flex-wrap gap-1 text-[10px]">
                          <span className="rounded-full bg-white/40 px-2 py-0.5 dark:bg-black/20">lease: {selectedQueueJobDetail.job.health.leaseState || '-'}</span>
                          {typeof selectedQueueJobDetail.job.health.recoveries === 'number' ? <span className="rounded-full bg-white/40 px-2 py-0.5 dark:bg-black/20">recoveries: {selectedQueueJobDetail.job.health.recoveries}</span> : null}
                          {selectedQueueJobDetail.job.health.providerRisk ? <span className="rounded-full bg-white/40 px-2 py-0.5 dark:bg-black/20">provider-risk</span> : null}
                          {selectedQueueJobDetail.job.health.safeToRequeue ? <span className="rounded-full bg-white/40 px-2 py-0.5 dark:bg-black/20">safe-requeue</span> : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-gray-900 dark:text-white">Prompt</div>
                          <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{selectedQueuePrompt.length.toLocaleString('vi-VN')} ký tự</div>
                        </div>
                        {selectedQueuePrompt.length > 220 ? (
                          <button onClick={() => setQueuePromptExpanded((current) => !current)} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 dark:bg-zinc-900 dark:text-zinc-200">
                            {queuePromptExpanded ? 'Thu gọn' : 'Xem hết'}
                          </button>
                        ) : null}
                      </div>
                      <div className={`whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-zinc-200 ${queuePromptExpanded ? '' : 'line-clamp-4'}`}>{selectedQueuePrompt}</div>
                    </div>

                    <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                      <div className="mb-3 text-sm font-black text-gray-900 dark:text-white">Tóm tắt nhanh</div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {[
                          ['User', selectedQueueJobDetail.job.userName || 'Unknown'],
                          ['Email', selectedQueueJobDetail.job.userEmail || '-'],
                          ['Thiết bị', getQueuePlatformLabel(selectedQueueJobDetail.job.clientPlatform)],
                          ['Asset', selectedQueueJobDetail.job.assetType],
                          ['Queue Kind', selectedQueueJobDetail.job.queueKind || '-'],
                          ['Provider Job', selectedQueueJobDetail.job.jobId || '-'],
                          ['Error Type', selectedQueueJobDetail.job.errorCategory || '-'],
                          ['Cập nhật', formatDateTime(selectedQueueJobDetail.job.updatedAt)],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900">
                            <div className="text-gray-400 dark:text-zinc-500">{label}</div>
                            <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white break-words">{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedQueueJobDetail.runtimeConfig ? (
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="mb-3 text-sm font-black text-gray-900 dark:text-white">Cấu hình chạy</div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {[
                            ['Chế độ tạo', selectedQueueJobDetail.runtimeConfig.generationMode || '-'],
                            ['Model UI', selectedQueueJobDetail.runtimeConfig.modelMode || '-'],
                            ['Model ID', selectedQueueJobDetail.runtimeConfig.modelId || '-'],
                            ['Tốc độ', selectedQueueJobDetail.runtimeConfig.speedMode || '-'],
                            ['Speed Key', selectedQueueJobDetail.runtimeConfig.speedKey || '-'],
                            ['Server', selectedQueueJobDetail.runtimeConfig.serverId || '-'],
                            ['Độ phân giải', selectedQueueJobDetail.runtimeConfig.resolution || '-'],
                            ['Tỷ lệ', selectedQueueJobDetail.runtimeConfig.aspectRatio || '-'],
                          ].map(([label, value]) => (
                            <div key={String(label)} className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900">
                              <div className="text-gray-400 dark:text-zinc-500">{label}</div>
                              <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white break-words">{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {orderedQueueMediaSections.length > 0 ? orderedQueueMediaSections.map((section) => (
                      <div key={section.key} className={`rounded-[24px] border bg-gray-50 px-4 py-4 dark:bg-zinc-800/80 ${getQueueMediaSectionTone(section.key)}`}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-gray-900 dark:text-white">{section.label}</div>
                            {section.description ? <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{section.description}</div> : null}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-zinc-400">{section.items.length} mục</div>
                        </div>
                        <div className="space-y-3">
                          {section.items.map((media, index) => (
                            <div key={`${section.key}-${media.role}-${index}`} className="rounded-2xl bg-white p-3 dark:bg-zinc-900">
                              <div className="mb-2">
                                <div className="text-sm font-bold text-gray-900 dark:text-white">{media.label}</div>
                                <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{getQueueMediaMeta(media)}</div>
                              </div>
                              {media.url ? (
                                media.kind === 'video' ? (
                                  <video src={media.url} controls className="max-h-72 w-full rounded-2xl bg-black" />
                                ) : (
                                  <img src={media.url} alt={media.label} className="max-h-72 w-full rounded-2xl bg-black object-contain" />
                                )
                              ) : (
                                <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-3 text-xs text-yellow-700 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-300">
                                  {media.note || 'Media quá lớn hoặc không thể render trực tiếp.'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )) : null}

                    {(selectedQueueJobDetail.job.vertexDiagnostics || []).length > 0 ? (
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-gray-900 dark:text-white">Chẩn đoán Vertex AI</div>
                            <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">promptFeedback, finishReason, credential và project của từng lần Vertex chạy</div>
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-zinc-400">{selectedQueueJobDetail.job.vertexDiagnostics?.length || 0} dòng</div>
                        </div>
                        <div className="space-y-3">
                          {(selectedQueueJobDetail.job.vertexDiagnostics || []).map((entry, index) => (
                            <div key={`${entry.at}-${index}`} className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-bold text-gray-900 dark:text-white">{getVertexTaskLabel(entry.task)}</div>
                                  <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{formatDateTime(entry.at)}</div>
                                </div>
                                <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getVertexStatusTone(entry.status)}`}>{entry.status?.toUpperCase?.() || 'INFO'}</div>
                              </div>
                              <div className="mt-3 text-sm text-gray-700 dark:text-zinc-200">{entry.message}</div>
                              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                {[
                                  ['Credential', entry.credentialName || '-'],
                                  ['Project', entry.projectId || '-'],
                                  ['Model', entry.model || '-'],
                                  ['Finish', entry.finishReasons && entry.finishReasons.length > 0 ? entry.finishReasons.join(', ') : '-'],
                                  ['Prompt Block', entry.promptFeedback?.blockReason || '-'],
                                  ['Prompt Msg', entry.promptFeedback?.blockReasonMessage || '-'],
                                  ['Safety', entry.safetyRatings && entry.safetyRatings.length > 0 ? entry.safetyRatings.join(', ') : '-'],
                                ].map(([label, value]) => (
                                  <div key={`${entry.at}-${String(label)}`} className="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-[#18181B]">
                                    <div className="text-gray-400 dark:text-zinc-500">{label}</div>
                                    <div className="mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {(selectedQueueJobDetail.job.error || selectedQueueJobDetail.job.errorRaw) ? (
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="text-sm font-black text-gray-900 dark:text-white">Phân tích lỗi</div>
                        {selectedQueueJobDetail.job.error ? <div className="mt-3 text-sm text-red-500 dark:text-red-300">{selectedQueueJobDetail.job.error}</div> : null}
                        {selectedQueueJobDetail.job.errorRaw && selectedQueueJobDetail.job.errorRaw !== selectedQueueJobDetail.job.error ? <div className="mt-3 break-all text-xs text-gray-500 dark:text-zinc-400">{selectedQueueJobDetail.job.errorRaw}</div> : null}
                      </div>
                    ) : null}

                    <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                      <div className="mb-3 text-sm font-black text-gray-900 dark:text-white">Log tiến trình</div>
                      <div className="space-y-3">
                        {(selectedQueueJobDetail.job.queueLogs || []).length === 0 ? (
                          <div className="text-sm text-gray-500 dark:text-zinc-400">Chưa có log cho job này.</div>
                        ) : (
                          (selectedQueueJobDetail.job.queueLogs || []).map((log, index) => (
                            <div key={`${log.at}-${index}`} className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">{getQueueStageLabel(log.stage)}</div>
                                <div className="text-[11px] text-gray-400 dark:text-zinc-500">{formatDateTime(log.at)}</div>
                              </div>
                              <div className="mt-2 text-sm text-gray-700 dark:text-zinc-200">{log.message}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <details className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                      <summary className="cursor-pointer text-sm font-black text-gray-900 dark:text-white">Payload preview</summary>
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-white p-3 text-[11px] text-gray-700 dark:bg-zinc-900 dark:text-zinc-200">
{JSON.stringify(selectedQueueJobDetail.queuePayloadPreview || {}, null, 2)}
                      </pre>
                    </details>

                    {['queued', 'processing', 'rescuing'].includes(getQueueStatus(selectedQueueJobDetail.job)) ? (
                      <button
                        onClick={() => stopQueueJob(selectedQueueJobDetail.job)}
                        disabled={stoppingQueueJobId === selectedQueueJobDetail.job.id}
                        className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-red-500 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {stoppingQueueJobId === selectedQueueJobDetail.job.id ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        Dừng tiến trình
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
