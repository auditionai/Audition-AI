import React from 'react';

export interface Stats {
  users: number;
  visits: number;
  images: number;
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