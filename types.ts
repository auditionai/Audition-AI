import React from 'react';

// From Supabase Auth + custom table
export interface User {
  id: string;
  email: string;
  display_name: string;
  photo_url: string;
  diamonds: number;
  xp: number;
  is_admin?: boolean;
  last_check_in?: string;
  streak?: number;
}

// For Leaderboard
export interface LeaderboardUser extends Omit<User, 'email' | 'is_admin' | 'last_check_in' | 'streak'> {
  rank: number;
  creations_count: number;
  level: number; // calculated from xp
}


// For Landing Page Sections
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

// For Image Gallery
export interface GalleryImageCreator {
    display_name: string;
    photo_url: string;
    level: number;
}

export interface GalleryImage {
  id: string;
  title: string;
  image_url: string;
  user_id: string;
  prompt: string;
  model_used: string;
  created_at: string;
  creator: GalleryImageCreator;
}

// For Ranks/Levels
export interface Rank {
  levelThreshold: number;
  title: string;
  icon: React.ReactNode;
  color: string;
}


// For AI Tool
export interface AIModel {
  id: string;
  name: string;
  description: string;
  apiModel: string;
  tags: { text: string; color: string }[];
  details: string[];
  recommended?: boolean;
  supportedModes: ('image-to-image' | 'text-to-image')[];
}

export interface StylePreset {
  id: string;
  name: string;
}

// For TopUp/Payments
export interface CreditPackage {
  id: string;
  name: string;
  description: string;
  price: number;
  credits_amount: number;
  bonus_credits: number;
  is_best_value: boolean;
}
