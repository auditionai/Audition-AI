
import type React from 'react';

// NEW: Shared type for detailed dashboard statistics
export interface DashboardStats {
    visitsToday: number;
    totalVisits: number;
    newUsersToday: number;
    totalUsers: number;
    imagesToday: number;
    totalImages: number;
}


export interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export interface PricingPlan {
  name: string;
  price: string;
  diamonds: number;
  bestValue?: boolean;
}

export interface FaqItem {
  question: string;
  answer: string;
}

// Cập nhật để khớp với schema của Supabase
export interface User {
    id: string; // Trước đây là uid
    display_name: string; // snake_case
    email: string;
    photo_url: string; // snake_case
    diamonds: number;
    xp: number;
    level: number;
    is_admin?: boolean; // snake_case
    last_check_in_at?: string;
    consecutive_check_in_days?: number;
    last_announcement_seen_id?: number | null;
    // NEW: Cosmetics
    equipped_title_id?: string;
    equipped_frame_id?: string;
    // NEW: Lucky Wheel
    spin_tickets?: number;
    last_daily_spin_at?: string;
    last_share_app_at?: string; // NEW: Track daily share app task
    // NEW: Social Profile
    cover_url?: string | null;
    bio?: string;
    total_likes?: number;
    profile_views?: number;
    weekly_points?: number;
}

export interface AdminManagedUser extends User {
    created_at: string;
    last_check_in_at?: string;
    consecutive_check_in_days?: number;
}

// UPDATED: Rank interface for DB
export interface Rank {
  id?: string;
  levelThreshold: number;
  title: string;
  icon?: React.ReactNode | string; // URL or CSS class
  color: string; // CSS class or Hex
}


export interface AIModel {
  id: string;
  name:string;
  description: string;
  apiModel: string;
  tags: { text: string; color: string; }[];
  details: string[];
  recommended?: boolean;
  supportedModes: ('text-to-image' | 'image-to-image')[];
}

export interface StylePreset {
  id: string;
  name: string;
}

// Cập nhật để khớp với schema
export interface GalleryImage {
  id: string; // uuid
  user_id: string;
  prompt: string;
  image_url: string;
  model_used: string;
  created_at: string;
  is_public?: boolean;
  // Fix: Add optional `title` for demo data compatibility.
  title?: string;
  creator: { // Dữ liệu này sẽ được JOIN từ bảng users
    display_name: string;
    photo_url: string;
    level: number;
    // NEW: Cosmetics in gallery view
    equipped_frame_id?: string;
    equipped_title_id?: string;
  };
}


// Cập nhật để khớp với schema của Supabase
export interface ApiKey {
  id: string;
  name: string;
  key_value: string; // snake_case
  status: 'active' | 'inactive';
  usage_count: number; // snake_case
  created_at: string;
}

export interface LeaderboardUser {
    id: string;
    rank: number;
    display_name: string;
    photo_url: string;
    level: number;
    xp: number;
    // creations_count sẽ được tính toán
    creations_count: number;
    // NEW: Cosmetics
    equipped_title_id?: string;
    equipped_frame_id?: string;
}

// Dành cho các gói nạp kim cương
export interface CreditPackage {
    id: string;
    name: string;
    credits_amount: number;
    bonus_credits: number;
    price_vnd: number;
    is_flash_sale: boolean;
    is_active: boolean;
    display_order: number;
    created_at: string;
    tag?: string | null;
    is_featured: boolean;
}

// Dành cho lịch sử giao dịch
export interface Transaction {
    id: string;
    order_code: number;
    user_id: string;
    package_id: string;
    amount_vnd: number;
    diamonds_received: number;
    status: 'pending' | 'completed' | 'failed' | 'canceled' | 'rejected';
    created_at: string;
    updated_at: string;
}

// For admin panel, includes joined user data
export interface AdminTransaction extends Transaction {
    users: {
        display_name: string;
        email: string;
        photo_url: string;
    }
}


// For user transaction history
export interface TransactionLogEntry {
    id: string;
    user_id: string;
    amount: number; // Can be positive or negative
    transaction_type: string;
    description: string;
    created_at: string;
}

// For global announcements
export interface Announcement {
    id: number;
    title: string;
    content: string;
    is_active: boolean;
    created_at: string;
}

// For check-in rewards configuration
export interface CheckInReward {
    id: string;
    consecutive_days: number;
    diamond_reward: number;
    xp_reward: number;
    is_active: boolean;
    created_at: string;
}

// For Admin Gift Code Management
export interface GiftCode {
    id: string;
    code: string;
    diamond_reward: number;
    usage_limit: number;
    usage_count: number;
    is_active: boolean;
    created_at: string;
}

export interface PromptLibraryItem {
  image_url: string;
  prompt: string;
}

// NEW: Cosmetic Types
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface CosmeticItem {
    id: string;
    type: 'frame' | 'title';
    nameKey?: string; // Legacy Translation key
    name?: string; // DB Name
    rarity: CosmeticRarity;
    cssClass?: string; // CSS class for animation/style (legacy/optional)
    imageUrl?: string; // URL for uploaded image (Main Image/Background)
    iconUrl?: string; // NEW: URL for small icon (e.g., badge icon)
    unlockCondition?: {
        level?: number;
        vip?: boolean;
    };
    price?: number; // NEW: Price in diamonds
    owned?: boolean; // NEW: Helper flag for UI
    previewColor?: string;
    is_active?: boolean;
}

// NEW: Chat Types
export interface ChatMessage {
    id: string;
    user_id: string;
    content: string;
    type: 'text' | 'image' | 'sticker' | 'system';
    metadata: {
        sender_name?: string;
        sender_avatar?: string;
        sender_level?: number;
        sender_frame_id?: string;
        sender_title_id?: string;
        image_url?: string;
        sticker_id?: string;
        deleted_by?: string;
        deleted_at?: string;
    };
    created_at: string;
    is_deleted?: boolean; // Added for admin moderation
}

export interface ChatConfig {
    id?: number;
    forbidden_words: string[];
    rate_limit_ms: number;
}

export interface ChatBan {
    user_id: string;
    banned_until: string;
    reason?: string;
}

// NEW: Lucky Wheel Reward
export interface LuckyWheelReward {
    id: string;
    label: string;
    type: 'diamond' | 'xp' | 'ticket' | 'lucky';
    amount: number;
    probability: number; // Percentage 0-100
    color: string; // Hex code
    is_active: boolean;
    display_order: number;
}

// NEW: Social Feed Types
export interface Post {
    id: string;
    user_id: string;
    image_url: string;
    caption: string;
    created_at: string;
    likes_count: number;
    comments_count: number;
    is_pinned: boolean;
    user?: { // Joined info
        display_name: string;
        photo_url: string;
        level: number;
        equipped_frame_id?: string;
        equipped_title_id?: string;
    }
    // Helper for UI state (not in DB)
    is_liked_by_user?: boolean; 
}

export interface PostComment {
    id: string;
    post_id: string;
    user_id: string;
    content: string;
    created_at: string;
    user?: {
        display_name: string;
        photo_url: string;
        level: number;
        equipped_frame_id?: string;
        equipped_title_id?: string;
    }
}

// NEW: Messaging System Types
export interface Conversation {
    id: string;
    created_at: string;
    updated_at: string;
    participants: {
        user_id: string;
        user: {
            id: string;
            display_name: string;
            photo_url: string;
            is_online?: boolean; // Optional for future online status
        }
    }[];
    last_message?: {
        content: string;
        created_at: string;
        type: string;
        is_read: boolean;
        sender_id: string;
    };
}

export interface DirectMessage {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    type: 'text' | 'image';
    is_read: boolean;
    created_at: string;
}
