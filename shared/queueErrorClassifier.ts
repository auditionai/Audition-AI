import { repairVietnameseMojibake } from './queueLogText';
import type { QueueProgressLogEntry } from './queueRecipes';

export type QueueErrorCategory = 'input' | 'queue' | 'provider' | 'config' | 'unknown';

export type QueueErrorInfo = {
  rawMessage?: string;
  displayMessage?: string;
  category: QueueErrorCategory;
};

export type UserFriendlyErrorInfo = {
  title: string;
  reason: string;
  resolution: string;
  summary: string;
  category: QueueErrorCategory;
  isAdminNote?: boolean;
  rawMessage?: string;
};

const normalizeErrorText = (message?: string | null) => repairVietnameseMojibake(message || '').trim();

export const isTerminalRescueFailureMessage = (message?: string | null) => {
  const lower = normalizeErrorText(message).toLowerCase();
  return lower.includes('job set not found') || lower.includes('job not found');
};

export const pickQueueFailureMessage = (
  errorMessage?: string | null,
  queueLogs?: QueueProgressLogEntry[] | null,
) => {
  const logs = queueLogs || [];
  const latestFailedLog = [...logs]
    .reverse()
    .find((entry) => entry && typeof entry.message === 'string' && entry.stage === 'failed');

  if (latestFailedLog?.message) {
    return latestFailedLog.message;
  }

  return errorMessage || '';
};

export const getUserFriendlyErrorInfo = (
  message?: string | null,
  customAdminNote?: string | null,
): UserFriendlyErrorInfo => {
  const cleanRaw = normalizeErrorText(message);
  const cleanAdminNote = normalizeErrorText(customAdminNote);

  // 1. Explicit admin custom note or prefixed [ADMIN]: note
  if (cleanAdminNote) {
    return {
      title: 'Lưu ý từ Quản trị viên',
      reason: cleanAdminNote,
      resolution: 'Hệ thống đã tự động hoàn lại chi phí Vcoin. Vui lòng đọc lưu ý trên của quản trị viên trước khi thực hiện lại.',
      summary: cleanAdminNote,
      category: 'unknown',
      isAdminNote: true,
      rawMessage: cleanRaw || undefined,
    };
  }

  if (cleanRaw.startsWith('[ADMIN]:')) {
    const extractedNote = cleanRaw.replace(/^\[ADMIN\]:\s*/i, '').trim();
    return {
      title: 'Lưu ý từ Quản trị viên',
      reason: extractedNote || 'Quản trị viên đã kiểm tra và gửi lưu ý về tác vụ này.',
      resolution: 'Hệ thống đã tự động hoàn lại chi phí Vcoin. Bạn có thể kiểm tra lại thông số theo lưu ý trên.',
      summary: extractedNote || 'Có lưu ý từ Quản trị viên.',
      category: 'unknown',
      isAdminNote: true,
      rawMessage: cleanRaw,
    };
  }

  if (!cleanRaw) {
    return {
      title: 'Tiến trình chưa hoàn tất',
      reason: 'Tác vụ chưa có thông tin lỗi chi tiết từ hệ thống.',
      resolution: 'Nếu tác vụ bị gián đoạn, chi phí Vcoin đã được hoàn lại tự động. Bạn vui lòng thử lại sau.',
      summary: 'Chưa có thông tin lỗi chi tiết (Đã hoàn Vcoin)',
      category: 'unknown',
      isAdminNote: false,
      rawMessage: undefined,
    };
  }

  const lower = cleanRaw.toLowerCase();

  // 2. Admin manually stopped
  if (
    lower.includes('admin manually stopped') ||
    lower.includes('quan tri vien da dung') ||
    lower.includes('da dung thu cong')
  ) {
    return {
      title: 'Tác vụ đã dừng bởi Quản trị viên',
      reason: 'Quản trị viên hệ thống đã dừng tác vụ này.',
      resolution: 'Số Vcoin đã được hoàn lại đầy đủ vào tài khoản của bạn. Bạn có thể gửi yêu cầu tạo mới bất cứ lúc nào.',
      summary: 'Tác vụ đã được quản trị viên dừng thủ công (Đã hoàn Vcoin)',
      category: 'queue',
      isAdminNote: true,
      rawMessage: cleanRaw,
    };
  }

  // 3. Upstream Gateway / Network Drop / 502 / 504 / 520-526 / GPT12_ERROR / GOMMO_ERROR
  const isUpstreamOrNetwork =
    lower.includes('gpt12_error') ||
    lower.includes('gommo_error') ||
    lower.includes('gommo_model_unavailable') ||
    lower.includes('gommo_unsupported_model') ||
    lower.includes('502') ||
    lower.includes('bad gateway') ||
    lower.includes('504') ||
    lower.includes('gateway timeout') ||
    lower.includes('upstream request timeout') ||
    /^52[0-6]\b/.test(lower) ||
    lower.includes('520') ||
    lower.includes('521') ||
    lower.includes('522') ||
    lower.includes('524') ||
    lower.includes('525') ||
    lower.includes('curl: (56)') ||
    lower.includes('curl: (7)') ||
    lower.includes('connection closed') ||
    lower.includes('connection reset') ||
    lower.includes('socket hang up') ||
    lower.includes('failed to connect') ||
    lower.includes('failed to perform') ||
    lower.includes('could not connect') ||
    lower.includes('libcurl') ||
    lower.includes('job set not found') ||
    lower.includes('job not found') ||
    lower.includes('provider dang xu ly') ||
    lower.includes('provider job failed');

  if (isUpstreamOrNetwork) {
    return {
      title: 'Máy chủ AI quá tải hoặc gián đoạn kết nối',
      reason: 'Hệ thống máy chủ AI từ nhà cung cấp đang quá tải hoặc gặp gián đoạn kết nối mạng tạm thời (502 / Timeout) trong lúc kết xuất.',
      resolution: 'Số Vcoin của bạn đã được hoàn lại 100% tự động. Vui lòng bấm thử lại sau 1-2 phút hoặc chọn máy chủ AI khác.',
      summary: 'Máy chủ AI quá tải hoặc gián đoạn kết nối (Đã hoàn Vcoin)',
      category: 'provider',
      isAdminNote: false,
      rawMessage: cleanRaw,
    };
  }

  // 4. Face / Character / Identity Guard
  const isFaceOrIdentity =
    lower.includes('identity guard failed') ||
    lower.includes('identity guard') ||
    lower.includes('no face') ||
    lower.includes('face not found') ||
    lower.includes('face not detected') ||
    lower.includes('khong tim thay khuon mat') ||
    lower.includes('khong the nhan dien khuon mat') ||
    lower.includes('khuon mat khong hop le') ||
    lower.includes('khong duyet video') ||
    lower.includes('khong duyet motion control') ||
    lower.includes('hau kiem ket qua ai');

  if (isFaceOrIdentity) {
    return {
      title: 'Không nhận diện được khuôn mặt / Nhân vật',
      reason: 'Ảnh mẫu khuôn mặt quá mờ, góc chụp nghiêng quá mức, bị che khuất (kính đen, khẩu trang, tóc) hoặc không rõ đường nét nhận diện.',
      resolution: 'Vui lòng chọn ảnh chân dung chất lượng cao, góc nhìn thẳng hoặc hơi nghiêng, đủ sáng và không bị che mặt để tạo lại.',
      summary: 'Ảnh mẫu không rõ khuôn mặt hoặc không đạt chuẩn nhận diện.',
      category: 'input',
      isAdminNote: false,
      rawMessage: cleanRaw,
    };
  }

  // 5. Prompt too long
  const isPromptLength =
    lower.includes('prompt') &&
    (lower.includes('3500') ||
      lower.includes('too long') ||
      lower.includes('length') ||
      lower.includes('characters') ||
      lower.includes('maximum') ||
      lower.includes('max ') ||
      lower.includes('vuot gioi han') ||
      lower.includes('qua dai'));

  if (isPromptLength) {
    return {
      title: 'Mô tả (Prompt) vượt quá giới hạn',
      reason: 'Độ dài câu lệnh mô tả dài hơn số lượng ký tự tối đa mà mô hình AI hỗ trợ.',
      resolution: 'Vui lòng rút ngắn câu lệnh mô tả, lược bớt các đoạn lặp lại và giữ từ khóa quan trọng ở đầu prompt.',
      summary: 'Câu lệnh mô tả vượt quá số ký tự cho phép của mô hình.',
      category: 'input',
      isAdminNote: false,
      rawMessage: cleanRaw,
    };
  }

  // 6. Moderation / Safety
  const isModeration =
    lower.includes('moderation') ||
    lower.includes('safety') ||
    lower.includes('prohibited') ||
    lower.includes('vi pham') ||
    lower.includes('change prompt or input and try again') ||
    lower.includes('not pass moderation');

  if (isModeration) {
    return {
      title: 'Nội dung bị bộ lọc an toàn từ chối',
      reason: 'Mô tả hoặc hình ảnh gửi lên bị bộ lọc an toàn của mô hình AI từ chối (chứa từ khóa nhạy cảm, bạo lực hoặc vi phạm tiêu chuẩn).',
      resolution: 'Vui lòng chỉnh sửa lại câu lệnh mô tả, tránh các từ ngữ nhạy cảm hoặc thay thế ảnh mẫu phù hợp.',
      summary: 'Nội dung hoặc ảnh mẫu không vượt qua bộ lọc an toàn AI.',
      category: 'input',
      isAdminNote: false,
      rawMessage: cleanRaw,
    };
  }

  // 7. Media input invalid / cannot download / format
  const isMediaError =
    (lower.includes('image') ||
      lower.includes('img_url') ||
      lower.includes('input_image') ||
      lower.includes('media') ||
      lower.includes('video') ||
      lower.includes('file')) &&
    (lower.includes('missing') ||
      lower.includes('invalid') ||
      lower.includes('unsupported') ||
      lower.includes('not found') ||
      lower.includes('download') ||
      lower.includes('fetch') ||
      lower.includes('corrupt'));

  if (isMediaError) {
    return {
      title: 'Tệp ảnh / Video đầu vào không hợp lệ',
      reason: 'Hệ thống AI không thể tải hoặc xử lý tệp ảnh/video đầu vào (định dạng không hỗ trợ, tệp hỏng hoặc liên kết bị chặn).',
      resolution: 'Vui lòng tải lại ảnh chuẩn JPG/PNG hoặc video MP4 dưới 30 giây (dung lượng dưới 10MB) rồi thử lại.',
      summary: 'Tệp hình ảnh hoặc video đầu vào không đọc được.',
      category: 'input',
      isAdminNote: false,
      rawMessage: cleanRaw,
    };
  }

  // 8. Timeout
  if (lower.includes('timeout') || lower.includes('qua thoi gian')) {
    return {
      title: 'Quá thời gian xử lý (Timeout)',
      reason: 'Thời gian tạo vượt quá giới hạn chờ của hệ thống do mô hình đang có hàng đợi xử lý quá tải.',
      resolution: 'Số Vcoin đã được hoàn lại đầy đủ. Bạn vui lòng tạo lại với mô hình khác hoặc giảm độ phức tạp của yêu cầu.',
      summary: 'Quá thời gian xử lý do máy chủ bận (Đã hoàn Vcoin)',
      category: 'provider',
      isAdminNote: false,
      rawMessage: cleanRaw,
    };
  }

  // 9. Config / Maintenance
  const isConfig =
    lower.includes('missing tst_api_key') ||
    lower.includes('missing gommo_access_token') ||
    lower.includes('invalid_tst_config') ||
    lower.includes('tst_unavailable') ||
    lower.includes('khong the ket noi tst') ||
    lower.includes('khong con kha dung tren tst') ||
    lower.includes('selected configuration is not available') ||
    lower.includes('queue preparation timed out') ||
    lower.includes('chuan bi payload qua lau');

  if (isConfig) {
    return {
      title: 'Máy chủ đang đồng bộ bảo trì',
      reason: 'Kết nối cấu hình giữa ứng dụng và máy chủ AI đang được bảo trì hoặc cập nhật thông số.',
      resolution: 'Số Vcoin đã được hoàn lại. Bạn vui lòng thử lại sau vài phút hoặc chọn máy chủ AI khác.',
      summary: 'Máy chủ đang đồng bộ cấu hình, vui lòng thử lại sau (Đã hoàn Vcoin)',
      category: 'config',
      isAdminNote: false,
      rawMessage: cleanRaw,
    };
  }

  // 10. Generic Fallback
  return {
    title: 'Tạo thất bại do máy chủ AI',
    reason: 'Hệ thống máy chủ AI gặp sự cố trong quá trình xử lý tác vụ.',
    resolution: 'Hệ thống đã tự động hoàn lại Vcoin. Vui lòng bấm thử lại hoặc chọn mẫu/máy chủ khác.',
    summary: 'Tiến trình tạo gặp sự cố từ máy chủ AI (Đã hoàn Vcoin)',
    category: 'unknown',
    isAdminNote: false,
    rawMessage: cleanRaw,
  };
};

export const classifyQueueError = (message?: string | null): QueueErrorInfo => {
  const rawMessage = normalizeErrorText(message);
  if (!rawMessage) {
    return {
      rawMessage: undefined,
      displayMessage: undefined,
      category: 'unknown',
    };
  }

  const info = getUserFriendlyErrorInfo(rawMessage);
  return {
    rawMessage,
    displayMessage: info.summary,
    category: info.category,
  };
};

export const normalizeQueueErrorMessage = (message?: string | null) => {
  if (!message) return '';
  const info = getUserFriendlyErrorInfo(message);
  return info.summary || info.reason || '';
};

