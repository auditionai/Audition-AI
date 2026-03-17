
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
      name: {vi: "Tạo Ảnh Đơn (3D Character)", en: "Single 3D Character"},
      description: {
        vi: "Tạo nhân vật game 3D siêu thực từ ảnh của bạn.",
        en: "Generate hyper-realistic 3D game character from your photo."
      },
      engine: "Gemini 3.0 Pro Vision",
      preview_image: "https://picsum.photos/400/301?grayscale",
      toolType: 'generation',
      defaultPrompt: "A stunning 3D game character render, semi-realistic anime style, blind box aesthetics, unreal engine 5, octane render, smooth texture, detailed clothing: ",
      category: 'generation',
      supportsStyleReference: true,
      tag: "HOT"
    },
    {
      id: "couple_photo_gen",
      name: {vi: "Tạo Ảnh Đôi (Couple Mode)", en: "Couple 3D Mode"},
      description: {
        vi: "Tạo ảnh đôi phong cách game Audition lãng mạn.",
        en: "Generate romantic Audition-style couple photos."
      },
      engine: "Gemini 3.0 Pro Vision",
      preview_image: "https://picsum.photos/400/302?grayscale",
      toolType: 'generation',
      defaultPrompt: "A romantic 3D render of a couple in a game world, interaction, semi-realistic style, detailed faces, vibrant lighting, 8k resolution: ",
      category: 'generation',
      supportsStyleReference: true,
      tag: "HOT"
    },
    {
      id: "group_3_gen",
      name: {vi: "Team 3 Người (Squad)", en: "Squad of 3"},
      description: {
        vi: "Tạo ảnh nhóm 3 nhân vật game với bố cục chuẩn.",
        en: "Generate a squad of 3 game characters with perfect composition."
      },
      engine: "Gemini 3.0 Pro Vision",
      preview_image: "https://picsum.photos/400/303?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality 3D render of a squad of 3 game characters, standing together, cool poses, detailed faces, game asset style, 8k: ",
      category: 'generation',
      supportsStyleReference: true
    },
    {
      id: "group_4_gen",
      name: {vi: "Team 4 Người (Clan)", en: "Clan of 4"},
      description: {
        vi: "Tạo ảnh Clan 4 thành viên phong cách Audition.",
        en: "Generate a Clan photo of 4 members in Audition style."
      },
      engine: "Gemini 3.0 Pro Vision",
      preview_image: "https://picsum.photos/400/304?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality 3D render of a group of 4 game characters, family or clan, standing together, vivid colors, unreal engine 5: ",
      category: 'generation',
      supportsStyleReference: true
    },

    // --- EDITING TOOLS (Chỉnh sửa) ---
    {
      id: "magic_editor_pro",
      name: {vi: "Chỉnh Sửa Ảnh (AI)", en: "Photo Editor AI"},
      description: {
        vi: "Thay đổi trang phục, bối cảnh, tư thế hoặc thêm chi tiết vào ảnh theo yêu cầu.",
        en: "Change outfits, background, pose or add details using text prompts."
      },
      engine: "Gemini 3.0 Pro Image",
      preview_image: "https://picsum.photos/400/307?grayscale",
      toolType: 'editing',
      defaultPrompt: "", // Dynamic prompt
      category: 'editing',
      tag: "NEW",
      isPremium: true
    },
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
      name: {vi: "Làm Nét Ảnh (4K)", en: "Upscale to 4K"},
      description: {
        vi: "Tăng độ nét, khử nhiễu và nâng cao chất lượng ảnh.",
        en: "Enhance sharpness, denoise and improve image quality."
      },
      engine: "Gemini 3.0 Pro",
      preview_image: "https://picsum.photos/400/306?grayscale",
      toolType: 'editing',
      defaultPrompt: "Upscale this image to high resolution 4K, sharpen details, improve clarity, de-noise, maintain original content and colors. Make it look professional.",
      category: 'editing'
    }
  ]
};
