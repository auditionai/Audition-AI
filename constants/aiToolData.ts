// Fix: Add .ts extension to module import.
import { AIModel, StylePreset } from '../types.ts';

export const DETAILED_AI_MODELS: AIModel[] = [
  {
    id: 'audition-ai-v4',
    name: 'AUDITION AI V4 (Flash)',
    description: 'Mô hình cân bằng, tốc độ nhanh, chất lượng tốt.',
    apiModel: 'gemini-2.5-flash-image',
    tags: [{ text: 'Recommended', color: 'red' }, { text: 'Fast', color: 'blue' }],
    details: [
      'Sử dụng AI: Gemini 2.5 Flash Image',
      'Tối ưu cho việc tạo ảnh nhanh và đẹp.',
      'Hỗ trợ ảnh-qua-ảnh và ảnh mẫu.',
      'Phù hợp cho hầu hết các tác vụ sáng tạo.',
    ],
    recommended: true,
    supportedModes: ['image-to-image', 'text-to-image'],
  },
  {
    id: 'audition-ai-fast',
    name: 'AUDITION AI FAST (Mới)',
    description: 'Tốc độ tạo ảnh nhanh hơn PRO, chất lượng cao.',
    apiModel: 'imagen-4.0-generate-001',
    tags: [{ text: 'New', color: 'cyan' }, { text: 'Fast', color: 'blue' }, { text: 'High Quality', color: 'yellow' }],
    details: [
      'Sử dụng AI: Imagen 4 Fast',
      'Tối ưu hóa tốc độ so với các mô hình Imagen khác.',
      'Chất lượng cao hơn V4, nhanh hơn PRO.',
      'Lưu ý: Chỉ hỗ trợ tạo ảnh từ văn bản.',
    ],
    supportedModes: ['text-to-image'],
  },
    {
    id: 'audition-ai-pro',
    name: 'AUDITION AI PRO (Imagen 4)',
    description: 'Mô hình cao cấp, chi tiết và chân thực vượt trội.',
    apiModel: 'imagen-4.0-generate-001',
    tags: [{ text: 'Highest Quality', color: 'yellow' }],
    details: [
      'Sử dụng AI: Imagen 4',
      'Chất lượng hình ảnh cao nhất, siêu thực.',
      'Tạo ra các chi tiết phức tạp và tinh xảo.',
      'Lưu ý: Chỉ hỗ trợ tạo ảnh từ văn bản.',
    ],
    supportedModes: ['text-to-image'],
  },
  {
    id: 'audition-ai-ultra',
    name: 'AUDITION AI ULTRA (Mới)',
    description: 'Chất lượng ảnh và khả năng hiển thị văn bản hàng đầu.',
    apiModel: 'imagen-4.0-generate-001',
    tags: [{ text: 'New', color: 'cyan' }, { text: 'Ultra Quality', color: 'yellow' }],
    details: [
      'Sử dụng AI: Imagen 4 Ultra',
      'Chất lượng hình ảnh và văn bản vượt trội nhất.',
      'Lựa chọn tốt nhất cho các tác phẩm nghệ thuật phức tạp.',
      'Lưu ý: Chỉ hỗ trợ tạo ảnh từ văn bản.',
    ],
    supportedModes: ['text-to-image'],
  }
];

export const STYLE_PRESETS_NEW: StylePreset[] = [
    { id: 'none', name: 'Không có' },
    { id: 'cinematic', name: 'Điện ảnh' },
    { id: 'photographic', name: 'Nhiếp ảnh' },
    { id: 'anime', name: 'Anime' },
    { id: 'fantasy', name: 'Kỳ ảo' },
    { id: '3d_model', name: '3D Model' },
    { id: 'dival_art', name: 'Dival Art' },
    { id: 'pixel_art', name: 'Pixel Art' },
];