import { AIModel, StylePreset } from '../types';

export const DETAILED_AI_MODELS: AIModel[] = [
  {
    id: 'audition-ai-pro-v3',
    name: 'Nano Banana Pro (Gemini 3)',
    description: 'Mô hình AI mạnh mẽ nhất. Hỗ trợ độ phân giải 4K, chi tiết siêu thực và hiểu prompt sâu sắc.',
    apiModel: 'gemini-3-pro-image-preview',
    tags: [{ text: 'NEW', color: 'red' }, { text: '4K ULTRA', color: 'yellow' }, { text: 'BEST', color: 'cyan' }],
    details: [
      'Công nghệ: Google Gemini 3 Pro Vision',
      'Độ phân giải: Native 4K (Siêu nét)',
      'Hiểu ngữ cảnh và ánh sáng phức tạp.',
      'Chi phí: 2 Kim Cương / ảnh',
    ],
    recommended: true,
    supportedModes: ['image-to-image', 'text-to-image'],
  },
  {
    id: 'audition-ai-v4',
    name: 'Nano Banana (Flash)',
    description: 'Mô hình tiêu chuẩn. Tốc độ nhanh, chất lượng tốt cho ảnh mạng xã hội.',
    apiModel: 'gemini-2.5-flash-image',
    tags: [{ text: 'FAST', color: 'blue' }, { text: 'ECONOMY', color: 'green' }],
    details: [
      'Công nghệ: Google Gemini 2.5 Flash',
      'Tốc độ tạo ảnh cực nhanh.',
      'Phù hợp thử nghiệm ý tưởng.',
      'Chi phí: 1 Kim Cương / ảnh',
    ],
    supportedModes: ['image-to-image', 'text-to-image'],
  },
  {
    id: 'imagen-3-fast',
    name: 'Imagen 3 Fast',
    description: 'Dòng model Imagen, chỉ hỗ trợ tạo từ văn bản.',
    apiModel: 'imagen-3.0-generate-002', // Fallback mapping
    tags: [{ text: 'Legacy', color: 'gray' }],
    details: [
       'Chỉ hỗ trợ Text-to-Image.',
       'Chi phí: 1 Kim Cương / ảnh'
    ],
    supportedModes: ['text-to-image'],
  }
];

export const STYLE_PRESETS_NEW: StylePreset[] = [
    { id: 'none', name: 'modals.styles.none' },
    { id: 'cinematic', name: 'modals.styles.cinematic' },
    { id: 'photographic', name: 'modals.styles.photographic' },
    { id: 'anime', name: 'modals.styles.anime' },
    { id: 'fantasy', name: 'modals.styles.fantasy' },
    { id: '3d_model', name: 'modals.styles.3d_model' },
    { id: 'dival_art', name: 'modals.styles.dival_art' },
    { id: 'pixel_art', name: 'modals.styles.pixel_art' },
];