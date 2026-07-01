import type { QueueProgressLogEntry, QueueVertexDiagnosticEntry } from './shared/queueRecipes';
import type { QueueErrorCategory } from './shared/queueErrorClassifier';

export type Language = 'vi' | 'en';
export type Theme = 'light' | 'dark';
export type ViewId = 'home' | 'tools' | 'gallery' | 'admin' | 'guide' | 'about' | 'tool_workspace' | 'support' | 'settings' | 'topup' | 'payment_gateway';
export type QueueClientPlatform = 'mobile' | 'desktop' | 'unknown';

declare global {
  interface Window {
    aistudio: any;
  }
}

export interface LocalizedString {
  vi: string;
  en: string;
}

export type FeatureType = 'generation' | 'editing' | 'video';

export interface Feature {
  id: string;
  name: LocalizedString;
  description: LocalizedString;
  engine: string;
  preview_image: string;
  toolType: FeatureType;
  defaultPrompt?: string;
  category?: 'generation' | 'editing' | 'style' | 'professional' | 'art' | 'video';
  supportsStyleReference?: boolean;
  isPremium?: boolean;
  tag?: string;
}

export interface StylePreset {
    id: string;
    name: string;
    image_url: string; // The visual anchor
    trigger_prompt: string; // Extra keywords (e.g. "3D render, Audition style")
    is_active: boolean;
    is_default: boolean;
}

export interface MenuItem {
  id: ViewId;
  label: LocalizedString;
  icon: string;
}

export interface AppConfig {
  app: {
    name: string;
    version: string;
    copyright: string;
  };
  ui: {
    menu: MenuItem[];
    default_language: Language;
  };
  main_features: Feature[];
  branding: {
    theme_color: string;
    tagline: LocalizedString;
  };
}

export interface GeneratedImage {
  id: string;
  url: string; // Base64 data or Public URL
  prompt: string;
  userPrompt?: string;
  providerPrompt?: string;
  timestamp: number;
  updatedAt?: number;
  assetType?: 'image' | 'video';
  queueKind?: string;
  showInGenerationHistory?: boolean;
  toolId: string;
  toolName: string;
  engine: string;
  isShared?: boolean; // New: Status for Showcase
  userName?: string;  // New: Author name
  userId?: string; // New: User ID for storage organization
  status?: 'processing' | 'queued' | 'completed' | 'failed';
  displayStatus?: 'processing' | 'queued' | 'completed' | 'failed' | 'rescuing';
  jobId?: string;
  progress?: number;
  queueStage?: string;
  queueLogs?: QueueProgressLogEntry[];
  vertexDiagnostics?: QueueVertexDiagnosticEntry[];
  error?: string;
  errorCategory?: QueueErrorCategory;
  errorRaw?: string;
  cost?: number; // Keep track of cost for refunds
}

export interface AdminQueueJob {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  clientPlatform?: QueueClientPlatform;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  displayStatus?: 'queued' | 'processing' | 'completed' | 'failed' | 'rescuing';
  assetType: 'image' | 'video';
  queueKind?: string;
  toolName?: string;
  prompt?: string;
  jobId?: string;
  resultUrl?: string;
  progress?: number;
  queueStage?: string;
  lastLogMessage?: string;
  lastLogAt?: string;
  queueLogs?: QueueProgressLogEntry[];
  vertexDiagnostics?: QueueVertexDiagnosticEntry[];
  error?: string;
  errorCategory?: QueueErrorCategory;
  errorRaw?: string;
  createdAt?: string;
  updatedAt?: string;
  nextPollAt?: string;
  processingStartedAt?: string;
  leaseExpiresAt?: string;
  isStuck?: boolean;
  health?: {
    code:
      | 'healthy'
      | 'queued_stale'
      | 'pre_dispatch_waiting_lease'
      | 'pre_dispatch_safe_requeue_due'
      | 'pre_dispatch_provider_risk'
      | 'poll_overdue'
      | 'rescuing_failed_provider'
      | 'completed'
      | 'failed'
      | 'unknown';
    label: string;
    detail: string;
    action: string;
    severity: 'ok' | 'info' | 'warning' | 'critical';
    providerRisk?: boolean;
    safeToRequeue?: boolean;
    watchdogDue?: boolean;
    leaseState?: 'none' | 'active' | 'expired';
    secondsUntilWatchdogDue?: number;
    secondsSinceUpdated?: number;
    secondsSinceLeaseExpired?: number;
    recoveries?: number;
  };
}

export interface AdminQueueSummaryCounts {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  overduePolls: number;
  untouchedQueued: number;
  stalledPreDispatch: number;
}

export interface AdminQueueSummary extends AdminQueueSummaryCounts {}

export interface AdminQueueRescueResult {
  success: boolean;
  checked: number;
  rescued: number;
  revived: number;
  totalCandidates: number;
  results: Array<{
    id: string;
    providerJobId: string;
    action: 'rescued' | 'revived' | 'no_result' | 'poll_error' | string;
    detail?: string;
  }>;
}

export interface AdminQueueHealthSnapshot {
  generatedAt?: string;
  scanned?: number;
  counts?: Partial<Record<NonNullable<AdminQueueJob['health']>['code'], number>>;
  watchdogDue?: number;
  examples?: Array<{
    id: string;
    userId?: string;
    status?: string;
    stage?: string;
    code?: NonNullable<AdminQueueJob['health']>['code'];
    ageSeconds?: number;
    leaseState?: NonNullable<AdminQueueJob['health']>['leaseState'];
    providerRisk?: boolean;
  }>;
}

export interface AdminQueueHealthReport {
  lastWatchdogReport?: {
    generatedAt?: string;
    summary?: {
      scanned?: number;
      queuedStale?: number;
      requeuedPreDispatch?: number;
      failedPreDispatch?: number;
      nudgedPolls?: number;
      staleDispatchHeartbeat?: boolean;
      alertsSent?: number;
      healthBefore?: AdminQueueHealthSnapshot;
      healthAfter?: AdminQueueHealthSnapshot;
      sepayReconcileError?: string;
    };
  } | null;
  lastWatchdogReportUpdatedAt?: string | null;
  liveDbReport?: AdminQueueHealthSnapshot | { error?: string; code?: string } | null;
}

export interface AdminQueueInputMedia {
  label: string;
  role: string;
  kind: 'image' | 'video';
  url?: string;
  sourceType: 'http' | 'data' | 'base64' | 'unknown';
  note?: string;
  userProvided?: boolean;
}

export interface AdminQueueMediaSection {
  key: 'reference' | 'sample' | 'result';
  label: string;
  description?: string;
  items: AdminQueueInputMedia[];
}

export interface AdminQueueJobDetail {
  job: AdminQueueJob;
  prompt?: string;
  queuePayloadPreview?: Record<string, unknown>;
  inputMedia: AdminQueueInputMedia[];
  mediaSections: AdminQueueMediaSection[];
  runtimeConfig?: {
    generationMode?: string;
    modelMode?: string;
    modelId?: string;
    speedMode?: string;
    speedKey?: string;
    serverId?: string;
    resolution?: string;
    aspectRatio?: string;
    configKey?: string;
    characterCount?: number;
  };
}

// --- NEW ECONOMY & USER TYPES ---

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar: string;
  vcoin_balance: number;
  role: 'user' | 'admin';
  isVip: boolean;
  streak: number;
  lastCheckin: string | null; // ISO Date string
  checkinHistory: string[]; // Array of 'YYYY-MM-DD' strings
  password?: string; // Mock password field for admin editing
  usedGiftcodes?: string[]; // Track used codes
  lastActive?: string; // New: Last active timestamp
  usageCount?: number; // New: Total AI generations/usages
  accountStatus?: 'active' | 'locked' | string;
  accountWarning?: string | null;
  accountWarningAt?: string | null;
  lockedAt?: string | null;
  lockReason?: string | null;
}

export interface CreditPackage {
  id: string;
  name: string;
  vcoin: number;
  price: number;
  currency: string;
  bonusText: string; // Visual tag like "Best Seller"
  bonusPercent: number; // Specific bonus % for this package (e.g. 10 for 10%)
  isPopular?: boolean;
  isActive?: boolean; // New field for visibility control
  displayOrder?: number; // New field for sorting
  colorTheme: string;
  transferContent: string; // Custom transfer syntax
}

export interface Giftcode {
    id: string;
    code: string;
    campaignKey?: string;
    reward: number; // Amount of Vcoin
    totalLimit: number; // Total usages allowed (e.g., 100 people)
    usedCount: number;
    maxPerUser: number; // Usually 1
    expiresAt?: string; // ISO Date
    isActive: boolean;
}

export type TransactionStatus = 'pending' | 'paid' | 'cancelled' | 'failed';

export interface Transaction {
  id: string;
  userId: string;
  // --- New User Details for Admin UI ---
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  // -------------------------------------
  packageId: string;
  amount?: number;
  price?: number;
  vcoin_received: number;
  status: TransactionStatus;
  createdAt: string;
  paymentMethod: 'sepay' | 'manual';
  code?: string; // Order Code
  order_code?: string; // New field
  checkoutUrl?: string; // URL thanh toan SePay
}

export interface VcoinLog {
  id: string;
  userId: string;
  amount: number; // Positive for topup/reward, negative for usage
  reason: string;
  type: 'topup' | 'usage' | 'reward' | 'refund' | 'admin_adjustment' | 'giftcode';
  createdAt: string;
}

export interface HistoryItem {
    id: string;
    createdAt: string;
    description: string;
    vcoinChange: number;
    balanceAfter?: number | null;
    amountVnd?: number;
    type: 'topup' | 'usage' | 'reward' | 'giftcode' | 'refund' | 'pending_topup' | 'admin_adjustment';
    category?: 'image' | 'video' | 'checkin' | 'topup' | 'giftcode' | 'admin_transaction' | 'other';
    referenceType?: string | null;
    referenceId?: string | null;
    code?: string;
    statusLabel?: string;
    toolName?: string | null;
    assetType?: 'image' | 'video' | null;
    queueKind?: string | null;
    jobStatus?: string | null;
    metadata?: Record<string, unknown> | null;
    status: 'success' | 'pending' | 'failed';
}
export interface CheckinConfig {
  day: number;
  reward: number;
  isMilestone?: boolean;
}

export interface PromotionCampaign {
    id: string;
    name: string; // Internal Campaign Name
    marqueeText: string;
    bonusPercent: number; 
    startTime: string; // ISO Date String
    endTime: string; // ISO Date String
    isActive: boolean; // Manual Kill Switch
}

export type PromotionConfig = Promotion;
export interface Promotion { 
    id: string; 
    name: string; 
    bonus_percent: number; 
    status: 'active' | 'inactive'; 
    created_at: string; 
    isActive?: boolean;
    marqueeText?: string;
}
export interface DailyCheckin { user_id: string; last_checkin: string; streak: number; }
export interface SystemSettings { id: string; maintenance_mode: boolean; announcement: string; min_topup: number; support_email: string; version: string; pricing_config?: any; giftcode_promo_config?: any; }
export interface ApiKey { id: string; key: string; name: string; tier: 'flash' | 'pro'; status: 'active' | 'inactive' | 'error'; last_used?: string; created_at: string; }
