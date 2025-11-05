import React from 'react';
// Fix: Add .ts extension to module import.
import { Feature, HowItWorksStep, PricingPlan, FaqItem, GalleryImage } from '../types.ts';

// Icons for features
// Fix: Use React.createElement to avoid JSX syntax in a .ts file, which was causing parsing errors.
// The icon definitions are now React elements, not components.
const FeatureIcon1 = React.createElement('i', { className: "ph-fill ph-shooting-star text-4xl" });
const FeatureIcon2 = React.createElement('i', { className: "ph-fill ph-palette text-4xl" });
const FeatureIcon3 = React.createElement('i', { className: "ph-fill ph-face-mask text-4xl" });
const FeatureIcon4 = React.createElement('i', { className: "ph-fill ph-rocket-launch text-4xl" });

export const FEATURES: Feature[] = [
  {
    icon: FeatureIcon1,
    title: 'AI Hàng Đầu',
    description: 'Sử dụng mô hình AI tạo ảnh mới nhất của Google để cho ra chất lượng ảnh vượt trội.',
  },
  {
    icon: FeatureIcon2,
    title: 'Đậm Chất Audition',
    description: 'AI được huấn luyện đặc biệt để hiểu rõ phong cách Audition, từ quần áo đến biểu cảm.',
  },
  {
    icon: FeatureIcon3,
    title: 'Giữ Nguyên Gương Mặt',
    description: 'Công nghệ nhận diện và giữ lại những đường nét đặc trưng trên gương mặt của bạn.',
  },
  {
    icon: FeatureIcon4,
    title: 'Tốc Độ Tên Lửa',
    description: 'Chỉ mất vài giây để AI xử lý và tạo ra một bức ảnh 3D Audition hoàn chỉnh cho bạn.',
  },
];

// Icons for how it works
// Fix: Use React.createElement to avoid JSX syntax in a .ts file, which was causing parsing errors.
// The icon definitions are now React elements, not components.
const StepIcon1 = React.createElement('i', { className: "ph-fill ph-upload-simple text-3xl" });
const StepIcon2 = React.createElement('i', { className: "ph-fill ph-pencil-line text-3xl" });
const StepIcon3 = React.createElement('i', { className: "ph-fill ph-swatches text-3xl" });
const StepIcon4 = React.createElement('i', { className: "ph-fill ph-sparkle text-3xl" });


export const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    step: 1,
    title: 'Tải Ảnh Gốc',
    description: 'Chọn một bức ảnh chân dung rõ mặt, chất lượng cao để AI có thể nhận diện tốt nhất.',
    icon: StepIcon1,
  },
  {
    step: 2,
    title: 'Nhập Mô Tả (Prompt)',
    description: 'Mô tả chi tiết về bối cảnh, trang phục, hành động bạn muốn AI thực hiện. Càng chi tiết, ảnh càng đẹp.',
    icon: StepIcon2,
  },
  {
    step: 3,
    title: 'Chọn Phong Cách',
    description: 'Lựa chọn từ các phong cách Audition có sẵn hoặc để AI tự do sáng tạo theo mô tả của bạn.',
    icon: StepIcon3,
  },
  {
    step: 4,
    title: 'Nhận Ảnh & Tỏa Sáng',
    description: 'Nhấn nút "Tạo ảnh", chờ trong giây lát và nhận về tác phẩm nghệ thuật AI độc đáo của riêng bạn.',
    icon: StepIcon4,
  },
];

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Gói Dùng Thử',
    price: '20.000đ',
    diamonds: 20,
  },
  {
    name: 'Gói Sáng Tạo',
    price: '50.000đ',
    diamonds: 55, // 10% bonus
    bestValue: true,
  },
  {
    name: 'Gói Pro',
    price: '100.000đ',
    diamonds: 120, // 20% bonus
  },
];

export const FAQ_DATA: FaqItem[] = [
  {
    question: 'Audition AI là gì?',
    answer: 'Audition AI là một công cụ sử dụng trí tuệ nhân tạo của Google để biến ảnh chân dung của bạn thành các nhân vật 3D mang đậm phong cách game Audition huyền thoại. Bạn có thể tùy chỉnh trang phục, bối cảnh và hành động.',
  },
  {
    question: 'Làm thế nào để có kết quả tốt nhất?',
    answer: 'Để có ảnh đẹp nhất, hãy sử dụng ảnh gốc rõ mặt, không bị che khuất, ánh sáng tốt. Khi viết mô tả (prompt), hãy cố gắng càng chi tiết càng tốt về quần áo, màu sắc, bối cảnh và cảm xúc bạn mong muốn.',
  },
  {
    question: 'Chi phí sử dụng là bao nhiêu?',
    answer: 'Mỗi lần tạo ảnh sẽ tốn 1 kim cương. Chi phí cho một kim cương là 1.000đ. Bạn có thể nạp kim cương theo các gói để có giá tốt hơn, ví dụ gói 50.000đ sẽ nhận được 55 kim cương.',
  },
  {
    question: 'Mất bao lâu để tạo một bức ảnh?',
    answer: 'Thời gian tạo ảnh trung bình chỉ khoảng 15-30 giây, tùy thuộc vào độ phức tạp của mô tả và tải của hệ thống tại thời điểm đó. Đây là bản DEMO nên tốc độ sẽ nhanh hơn thực tế.',
  },
  {
    question: 'Tôi có thể sử dụng ảnh đã tạo cho mục đích thương mại không?',
    answer: 'Người dùng chịu trách nhiệm về bản quyền của hình ảnh gốc bạn tải lên. Hình ảnh do AI tạo ra có thể được sử dụng cho mục đích cá nhân. Vui lòng đọc kỹ điều khoản sử dụng của chúng tôi để biết thêm chi tiết.',
  },
];

// Fix: Update mock data to conform to the `GalleryImage` type.
const now = new Date().toISOString();
export const GALLERY_IMAGES: GalleryImage[] = [
  { id: '1', title: "Vũ Điệu Neon", image_url: 'https://picsum.photos/seed/audition1/600/800', user_id: 'user-1', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'VũCôngCyber', photo_url: 'https://i.pravatar.cc/150?u=vcc', level: 55 }, prompt: 'A stylish girl in a neon-lit city, futuristic clothing, vibrant colors, dynamic pose.' },
  { id: '2', title: "Sàn Nhảy Rực Lửa", image_url: 'https://picsum.photos/seed/audition2/600/800', user_id: 'user-2', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'DJ_Beat', photo_url: 'https://i.pravatar.cc/150?u=djb', level: 35 }, prompt: 'A cool guy with headphones, DJ setup in the background, night club atmosphere.' },
  { id: '3', title: "Công Chúa Vườn Tiên", image_url: 'https://picsum.photos/seed/audition3/600/800', user_id: 'user-3', model_used: 'imagen-4', created_at: now, creator: { display_name: 'StarDancer', photo_url: 'https://i.pravatar.cc/150?u=sd', level: 42 }, prompt: 'Princess dress, sparkling, magical garden, fantasy style.' },
  { id: '4', title: "Idol Tỏa Sáng", image_url: 'https://picsum.photos/seed/audition4/600/800', user_id: 'user-4', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'Pixel_Queen', photo_url: 'https://i.pravatar.cc/150?u=pq', level: 48 }, prompt: 'K-pop idol fashion, on a vibrant stage, energetic dance move, cinematic lighting.' },
  { id: '5', title: "Chất Đường Phố", image_url: 'https://picsum.photos/seed/audition5/600/800', user_id: 'user-5', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'GrooveMaster', photo_url: 'https://i.pravatar.cc/150?u=gm', level: 28 }, prompt: 'Hip-hop style, graffiti wall background, confident look, urban setting.' },
  { id: '6', title: "Điệu Valse Đỏ", image_url: 'https://picsum.photos/seed/audition6/600/800', user_id: 'user-1', model_used: 'imagen-4', created_at: now, creator: { display_name: 'VũCôngCyber', photo_url: 'https://i.pravatar.cc/150?u=vcc', level: 55 }, prompt: 'A dancer in a flowing red dress, dramatic pose, black background, spotlight effect.' },
  { id: '7', title: "Thiên Thần Giữa Mây", image_url: 'https://picsum.photos/seed/audition7/600/800', user_id: 'user-3', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'StarDancer', photo_url: 'https://i.pravatar.cc/150?u=sd', level: 42 }, prompt: 'A character with angel wings, floating in the clouds, serene expression.' },
  { id: '8', title: "Rockstar Bùng Cháy", image_url: 'https://picsum.photos/seed/audition8/600/800', user_id: 'user-2', model_used: 'imagen-4', created_at: now, creator: { display_name: 'DJ_Beat', photo_url: 'https://i.pravatar.cc/150?u=djb', level: 35 }, prompt: 'A rocker with an electric guitar, on a concert stage with spotlights.' },
  { id: '9', title: "Chiều Thu Công Viên", image_url: 'https://picsum.photos/seed/audition9/600/800', user_id: 'user-4', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'Pixel_Queen', photo_url: 'https://i.pravatar.cc/150?u=pq', level: 48 }, prompt: 'Casual streetwear, sitting on a bench in a city park, autumn season.' },
  { id: '10', title: "Quý Ông Lịch Lãm", image_url: 'https://picsum.photos/seed/audition10/600/800', user_id: 'user-5', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'GrooveMaster', photo_url: 'https://i.pravatar.cc/150?u=gm', level: 28 }, prompt: 'An elegant dancer in a ballroom, wearing a tuxedo, classic dance pose.' },
  { id: '11', title: "Chiến Binh Tương Lai", image_url: 'https://picsum.photos/seed/audition11/600/800', user_id: 'user-1', model_used: 'imagen-4', created_at: now, creator: { display_name: 'VũCôngCyber', photo_url: 'https://i.pravatar.cc/150?u=vcc', level: 55 }, prompt: 'Sci-fi armor, standing on a futuristic cityscape, holding a laser sword.' },
  { id: '12', title: "Nữ Sinh Anh Đào", image_url: 'https://picsum.photos/seed/audition12/600/800', user_id: 'user-3', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'StarDancer', photo_url: 'https://i.pravatar.cc/150?u=sd', level: 42 }, prompt: 'A cute character in a school uniform, cherry blossom trees in the background.' },
];

export const USER_CREATED_IMAGES: GalleryImage[] = [
    { id: '101', title: "Cyberpunk Dancer", image_url: 'https://picsum.photos/seed/myimage1/600/800', user_id: 'user-pro', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'Creator Pro', photo_url: 'https://i.pravatar.cc/150?u=pro', level: 13 }, prompt: 'My first creation! A dancer in a cyberpunk city.' },
    { id: '102', title: "Forest Guardian", image_url: 'https://picsum.photos/seed/myimage2/600/800', user_id: 'user-pro', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'Creator Pro', photo_url: 'https://i.pravatar.cc/150?u=pro', level: 13 }, prompt: 'A magical guardian in an enchanted forest, with glowing runes.' },
    { id: '103', title: "Space Explorer", image_url: 'https://picsum.photos/seed/myimage3/600/800', user_id: 'user-pro', model_used: 'imagen-4', created_at: now, creator: { display_name: 'Creator Pro', photo_url: 'https://i.pravatar.cc/150?u=pro', level: 13 }, prompt: 'An astronaut looking out at a colorful nebula from their spaceship window.' },
    { id: '104', title: "Steampunk Inventor", image_url: 'https://picsum.photos/seed/myimage4/600/800', user_id: 'user-pro', model_used: 'gemini-flash', created_at: now, creator: { display_name: 'Creator Pro', photo_url: 'https://i.pravatar.cc/150?u=pro', level: 13 }, prompt: 'A character with goggles and gears, working on a complex machine.' },
];