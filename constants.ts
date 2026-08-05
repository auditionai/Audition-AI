import { AppConfig } from './types';
import { SHARPEN_UPSCALE_CHARACTER_LOCK_PROMPT } from './shared/imageEditPrompts';

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
      {id: "gallery", label: {vi: "Lịch sử", en: "History"}, icon: "Image"},
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
    // --- 1. GENERATION TOOLS (Tạo ảnh) ---
    {
      id: "single_photo_gen",
      name: {vi: "Tạo Ảnh Đơn (3D Character)", en: "Single 3D Character"},
      description: {
        vi: "Tạo nhân vật game 3D siêu thực từ ảnh của bạn.",
        en: "Generate hyper-realistic 3D game character from your photo."
      },
      engine: "Giá 5 Vcoin / ảnh",
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
      engine: "Giá 10 Vcoin / ảnh",
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
      engine: "Giá từ 15 Vcoin / nhóm",
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
      engine: "Giá từ 20 Vcoin / nhóm",
      preview_image: "https://picsum.photos/400/304?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality 3D render of a group of 4 game characters, family or clan, standing together, vivid colors, unreal engine 5: ",
      category: 'generation',
      supportsStyleReference: true
    },
    {
      id: "group_5_gen",
      name: {vi: "Team 5 Người", en: "Group of 5"},
      description: {
        vi: "Tạo ảnh nhóm 5 nhân vật với đầy đủ ảnh tham chiếu.",
        en: "Generate a group photo with 5 referenced characters."
      },
      engine: "Giá từ 25 Vcoin / nhóm",
      preview_image: "https://picsum.photos/400/305?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality 3D render of a group of 5 game characters, standing together in a balanced composition, vivid colors, unreal engine 5: ",
      category: 'generation',
      supportsStyleReference: true
    },
    {
      id: "group_6_gen",
      name: {vi: "Team 6 Người", en: "Group of 6"},
      description: {vi: "Tạo ảnh nhóm 6 nhân vật bằng luồng Gommo nhiều ảnh tham chiếu.", en: "Generate six referenced characters through Gommo."},
      engine: "Gommo · 6 nhân vật",
      preview_image: "https://picsum.photos/400/306?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality 3D render of exactly 6 game characters in one balanced group composition: ",
      category: 'generation',
      supportsStyleReference: true
    },
    {
      id: "group_7_gen",
      name: {vi: "Team 7 Người", en: "Group of 7"},
      description: {vi: "Tạo ảnh nhóm 7 nhân vật bằng luồng Gommo nhiều ảnh tham chiếu.", en: "Generate seven referenced characters through Gommo."},
      engine: "Gommo · 7 nhân vật",
      preview_image: "https://picsum.photos/400/307?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality 3D render of exactly 7 game characters in one balanced group composition: ",
      category: 'generation',
      supportsStyleReference: true
    },
    {
      id: "group_8_gen",
      name: {vi: "Team 8 Người", en: "Group of 8"},
      description: {vi: "Tạo ảnh nhóm 8 nhân vật qua Gommo, không sử dụng ảnh mẫu bố cục.", en: "Generate eight referenced characters through Gommo without a sample image."},
      engine: "Gommo · 8 nhân vật",
      preview_image: "https://picsum.photos/400/309?grayscale",
      toolType: 'generation',
      defaultPrompt: "A high quality 3D render of exactly 8 game characters in one balanced group composition without a sample scene image: ",
      category: 'generation',
      supportsStyleReference: false
    },
    {
      id: "ai_image_tool",
      name: {vi: "Tạo Ảnh AI", en: "AI Image Creator"},
      description: {
        vi: "Tạo ảnh thuần từ prompt và tối đa 5 ảnh tham chiếu, không dùng prompt hệ thống Audition.",
        en: "Create prompt-only images with up to 5 references, without Audition system prompts."
      },
      engine: "Giá chỉ từ 5 Vcoin",
      preview_image: "https://picsum.photos/400/308?grayscale",
      toolType: 'generation',
      defaultPrompt: "",
      category: 'generation'
    },

    // --- 2. VIDEO LAB (Tạo Video) ---
    {
      id: "video_ai_gen",
      name: {vi: "Tạo Video AI", en: "AI Video Generation"},
      description: {
        vi: "Tạo video từ prompt hoặc ảnh keyframe với các model AI Motion đỉnh cao.",
        en: "Generate video from prompt or keyframe image with top AI Motion models."
      },
      engine: "Giá chỉ từ 15 Vcoin",
      preview_image: "https://picsum.photos/400/310?grayscale",
      toolType: 'video',
      category: 'video',
      tag: "HOT"
    },
    {
      id: "motion_control_gen",
      name: {vi: "Motion Control", en: "Motion Control"},
      description: {
        vi: "Upload ảnh nhân vật và video chuyển động để render video Motion Control.",
        en: "Upload character image and motion video to render Motion Control video."
      },
      engine: "Giá chỉ từ 25 Vcoin",
      preview_image: "https://picsum.photos/400/311?grayscale",
      toolType: 'video',
      category: 'video'
    },

    // --- 3. EDITING TOOLS (Chỉnh sửa) ---
    {
      id: "magic_editor_pro",
      name: {vi: "Chỉnh Sửa Ảnh (AI)", en: "Photo Editor AI"},
      description: {
        vi: "Thay đổi trang phục, bối cảnh, tư thế hoặc thêm chi tiết vào ảnh theo yêu cầu.",
        en: "Change outfits, background, pose or add details using text prompts."
      },
      engine: "Giá chỉ từ 5 Vcoin",
      preview_image: "https://picsum.photos/400/307?grayscale",
      toolType: 'editing',
      defaultPrompt: "",
      category: 'editing'
    },
    {
      id: "remove_bg_pro",
      name: {vi: "Tách Nền Ảnh", en: "Remove Background"},
      description: {
        vi: "Xóa phông nền tự động, tách chủ thể chính xác.",
        en: "Automatically remove background, isolate subject accurately."
      },
      engine: "Giá 3 Vcoin / lần",
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
      engine: "Giá 3 Vcoin / lần",
      preview_image: "https://picsum.photos/400/306?grayscale",
      toolType: 'editing',
      defaultPrompt: SHARPEN_UPSCALE_CHARACTER_LOCK_PROMPT,
      category: 'editing'
    }
  ]
};
