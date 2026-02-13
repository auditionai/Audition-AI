
import { AppConfig } from './types';

export const APP_CONFIG: AppConfig = {
  app: {
    name: "AUDITION AI Studio 42.0",
    version: "42.0",
    copyright: "© 2025 AUDITION AI Team. All rights reserved."
  },
  ui: {
    default_language: "vi",
    menu: [
      {id: "home", label: {vi: "Trang chủ", en: "Dashboard"}, icon: "Home"},
      {id: "tools", label: {vi: "Công cụ", en: "Tools"}, icon: "Wand"},
      {id: "gallery", label: {vi: "Thư viện", en: "Gallery"}, icon: "Image"},
      {id: "support", label: {vi: "Hỗ trợ", en: "Support"}, icon: "Heart"},
      {id: "guide", label: {vi: "Hướng dẫn", en: "Guide"}, icon: "BookOpen"},
      {id: "about", label: {vi: "Giới thiệu", en: "About"}, icon: "Info"},
      {id: "admin", label: {vi: "Quản trị", en: "Admin"}, icon: "Shield"}
    ]
  },
  branding: {
    theme_color: "#FF0099",
    tagline: {
      vi: "Sàn diễn ánh sáng - Đánh thức đam mê Audition",
      en: "The Stage of Light - Awaken your Audition passion"
    }
  },
  main_features: [
    // --- GENERATION TOOLS (Tạo ảnh) ---
    {
      id: "single_photo_gen",
      name: {vi: "Tạo Ảnh Đơn", en: "Single Photo Gen"},
      description: {
        vi: "Tạo ảnh chân dung hoặc toàn thân chất lượng cao cho 1 người.",
        en: "Generate high-quality portrait or full-body photo for 1 person."
      },
      engine: "Gemini 3.0 Pro",
      preview_image: "https://picsum.photos/400/301?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality professional photo of a single person, detailed face, photorealistic, 8k resolution, cinematic lighting: ",
      category: 'generation',
      supportsStyleReference: true,
      tag: "HOT"
    },
    {
      id: "couple_photo_gen",
      name: {vi: "Tạo Ảnh Đôi", en: "Couple Photo Gen"},
      description: {
        vi: "Tạo ảnh đẹp cho cặp đôi hoặc 2 người bạn.",
        en: "Generate beautiful photos for couples or 2 friends."
      },
      engine: "Gemini 3.0 Pro",
      preview_image: "https://picsum.photos/400/302?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality photo of 2 people together, couple or friends, interaction, detailed faces, photorealistic, 8k resolution: ",
      category: 'generation',
      supportsStyleReference: true,
      tag: "HOT"
    },
    {
      id: "group_3_gen",
      name: {vi: "Tạo Ảnh Nhóm 3 Người", en: "Group of 3 Gen"},
      description: {
        vi: "Tạo ảnh nhóm 3 người với bố cục hài hòa.",
        en: "Generate a group photo of 3 people with balanced composition."
      },
      engine: "Gemini 3.0 Pro",
      preview_image: "https://picsum.photos/400/303?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality group photo of exactly 3 people, standing together, happy expression, detailed faces, photorealistic, 8k resolution: ",
      category: 'generation',
      supportsStyleReference: true
    },
    {
      id: "group_4_gen",
      name: {vi: "Tạo Ảnh Nhóm 4 Người", en: "Group of 4 Gen"},
      description: {
        vi: "Tạo ảnh nhóm 4 người, thích hợp cho gia đình hoặc bạn bè.",
        en: "Generate a group photo of 4 people, perfect for family or friends."
      },
      engine: "Gemini 3.0 Pro",
      preview_image: "https://picsum.photos/400/304?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality group photo of exactly 4 people, family or friends, standing together, detailed faces, photorealistic, 8k resolution: ",
      category: 'generation',
      supportsStyleReference: true
    },

    // --- EDITING TOOLS (Chỉnh sửa) ---
    {
      id: "remove_bg_pro",
      name: {vi: "Tách Nền Ảnh", en: "Remove Background"},
      description: {
        vi: "Xóa phông nền tự động, tách chủ thể chính xác.",
        en: "Automatically remove background, isolate subject accurately."
      },
      engine: "Gemini 3.0 Pro",
      preview_image: "https://picsum.photos/400/305?grayscale",
      toolType: 'editing',
      defaultPrompt: "Remove the background of this image, keeping the main subject isolated on a pure white background. Ensure clean edges.",
      category: 'editing'
    },
    {
      id: "sharpen_upscale",
      name: {vi: "Làm Nét Ảnh", en: "Sharpen Image"},
      description: {
        vi: "Tăng độ nét, khử nhiễu và nâng cao chất lượng ảnh.",
        en: "Enhance sharpness, denoise and improve image quality."
      },
      engine: "Gemini 3.0 Pro",
      preview_image: "https://picsum.photos/400/306?grayscale",
      toolType: 'editing',
      defaultPrompt: "Upscale this image to high resolution, sharpen details, improve clarity, de-noise, maintain original content and colors. Make it look professional.",
      category: 'editing'
    }
  ]
};
