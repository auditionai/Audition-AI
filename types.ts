
export type Language = 'vi' | 'en';
export type Theme = 'light' | 'dark';
export type ViewId = 'home' | 'tools' | 'gallery' | 'admin' | 'guide' | 'about' | 'tool_workspace' | 'support' | 'settings' | 'topup' | 'payment_gateway';

export interface LocalizedString {
  vi: string;
  en: string;
}

export type FeatureType = 'generation' | 'editing';

export interface Feature {
  id: string;
  name: LocalizedString;
  description: LocalizedString;
  engine: string;
  preview_image: string;
  toolType: FeatureType;
  defaultPrompt?: string;
  category?: 'generation' | 'editing' | 'style' | 'professional' | 'art';
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
  timestamp: number;
  toolId: string;
  toolName: string;
  engine: string;
  isShared?: boolean; // New: Status for Showcase
  userName?: string;  // New: Author name
}

// --- NEW ECONOMY & USER TYPES ---

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar: string;
  balance: number;
  role: 'user' | 'admin';
  isVip: boolean;
  streak: number;
  lastCheckin: string | null; // ISO Date string
  checkinHistory: string[]; // Array of 'YYYY-MM-DD' strings
  password?: string; // Mock password field for admin editing
  usedGiftcodes?: string[]; // Track used codes
}

export interface CreditPackage {
  id: string;
  name: string;
  coin: number;
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
  amount: number;
  coins: number;
  status: TransactionStatus;
  createdAt: string;
  paymentMethod: 'payos' | 'manual';
  code: string; // Order Code
  checkoutUrl?: string; // URL thanh toán PayOS
}

export interface DiamondLog {
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
    amountVnd?: number;
    type: 'topup' | 'usage' | 'reward' | 'giftcode' | 'refund' | 'pending_topup' | 'admin_adjustment';
    status: 'success' | 'pending' | 'failed';
    code?: string;
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

export type PromotionConfig = PromotionCampaign;
