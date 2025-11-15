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
}

export interface AdminManagedUser extends User {
    created_at: string;
    last_check_in_at?: string;
    consecutive_check_in_days?: number;
}


export interface Rank {
  levelThreshold: number;
  title: string;
  icon: React.ReactNode;
  color: string; // e.g., 'text-yellow-400'
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

// FIX: Add missing GiftCode type definition
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