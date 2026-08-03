type VideoModelIdentity = { id?: string; name?: string };

export type VideoModelPresentation = {
  description: string;
  tags: string[];
};

const KLING_PRESENTATIONS: Record<string, VideoModelPresentation> = {
  'kling-2.5-turbo': {
    description: 'Bản Turbo ưu tiên tốc độ và chi phí; phù hợp tạo nhanh clip chuyển động ngắn, thử prompt hoặc làm nhiều biến thể.',
    tags: ['#NHANH', '#TIẾT_KIỆM'],
  },
  'kling-2.6': {
    description: 'Cân bằng chất lượng và độ ổn định; nổi bật ở chuyển động tự nhiên, bám prompt tốt và hỗ trợ âm thanh gốc khi cấu hình cho phép.',
    tags: ['#CÂN_BẰNG', '#NATIVE_AUDIO'],
  },
  'kling-3.0-video': {
    description: 'Thế hệ mới cho cảnh nhiều phân đoạn; giữ nhân vật ổn định hơn, hiểu diễn biến và hỗ trợ âm thanh–hình ảnh đồng bộ khi cấu hình cho phép.',
    tags: ['#MULTI_SHOT', '#NHẤT_QUÁN'],
  },
  'kling-o1-video': {
    description: 'Dòng Omni thiên về khả năng kiểm soát và hiểu nhiều loại tham chiếu; phù hợp cảnh phức tạp cần bám chủ thể, bố cục và prompt chặt chẽ.',
    tags: ['#OMNI_CONTROL', '#BÁM_PROMPT'],
  },
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

export const getVideoModelPresentation = (model: VideoModelIdentity): VideoModelPresentation | null => {
  const id = normalize(model.id);
  if (KLING_PRESENTATIONS[id]) return KLING_PRESENTATIONS[id];

  const identity = `${id} ${normalize(model.name)}`;
  if (identity.includes('kling 2.5') || identity.includes('kling-2.5')) return KLING_PRESENTATIONS['kling-2.5-turbo'];
  if (identity.includes('kling 2.6') || identity.includes('kling-2.6')) return KLING_PRESENTATIONS['kling-2.6'];
  if (identity.includes('kling 3.0') || identity.includes('kling-3.0')) return KLING_PRESENTATIONS['kling-3.0-video'];
  if (identity.includes('kling o1') || identity.includes('kling-o1')) return KLING_PRESENTATIONS['kling-o1-video'];
  return null;
};
