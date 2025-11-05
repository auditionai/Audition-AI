import React from 'react';

// Core user and authentication types
export interface User {
  id: string;
  email: string;
  display_name: string;
  photo_url: string;
  diamonds: number;
  xp: number;
  level: number;
  is_admin?: boolean;
}

// For admin user management, can be an alias for User
export type AdminManagedUser = User;

// Type for leaderboard entries
export interface LeaderboardUser {
    id: string;
    rank: number;
    display_name: string;
    photo_url: string;
    xp: number;
    level: number; // Derived from xp
    creations_count: number;
}


// Gallery and Image types
export interface Creator {
  display_name: string;
  photo_url: string;
  level: number;
}

export interface GalleryImage {
  id: string;
  title: string;
  image_url: string;
  prompt: string;
  user_id: string;
  model_used: string;
  created_at: string; // ISO date string
  creator: Creator;
}

// Landing page content types
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

// AI Tool types
export interface AIModel {
  id: string;
  name: string;
  description: string;
  apiModel: string;
  tags: Array<{ text: string; color: string }>;
  details: string[];
  recommended?: boolean;
  supportedModes: Array<'image-to-image' | 'text-to-image'>;
}

export interface StylePreset {
  id: string;
  name: string;
}

// Ranking system types
export interface Rank {
  levelThreshold: number;
  title: string;
  icon: React.ReactNode;
  color: string;
}

// Admin panel and billing types
export interface ApiKey {
  id: string;
  name: string;
  key_value: string;
  usage_count: number;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface CreditPackage {
    id: string;
    credits_amount: number;
    bonus_credits: number;
    price_vnd: number;
    is_flash_sale: boolean;
    is_active: boolean;
    display_order: number;
}
