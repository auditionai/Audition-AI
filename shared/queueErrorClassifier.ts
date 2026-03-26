import { repairVietnameseMojibake } from './queueLogText';
import type { QueueProgressLogEntry } from './queueRecipes';

export type QueueErrorCategory = 'input' | 'queue' | 'provider' | 'config' | 'unknown';

export type QueueErrorInfo = {
  rawMessage?: string;
  displayMessage?: string;
  category: QueueErrorCategory;
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

  if (latestFailedLog?.message && (latestFailedLog.message.toLowerCase().includes('rescue tst') || isTerminalRescueFailureMessage(latestFailedLog.message))) {
    return latestFailedLog.message;
  }

  return errorMessage || '';
};

export const classifyQueueError = (message?: string | null): QueueErrorInfo => {
  const rawMessage = normalizeErrorText(message);
  const lower = rawMessage.toLowerCase();

  if (!rawMessage) {
    return {
      rawMessage: undefined,
      displayMessage: undefined,
      category: 'unknown',
    };
  }

  if (
    lower.includes('missing tst_api_key') ||
    lower.includes('tst_unavailable') ||
    lower.includes('invalid_tst_config') ||
    lower.includes('không còn khả dụng trên tst') ||
    lower.includes('selected configuration is not available on tst')
  ) {
    return {
      rawMessage,
      displayMessage: 'Cấu hình hoặc kết nối TST đang lỗi. Job thất bại do môi trường hệ thống, không phải do input của user.',
      category: 'config',
    };
  }

  if (
    lower.includes('queue preparation timed out before') ||
    lower.includes('quá thời gian chuẩn bị') ||
    lower.includes('tam hoan va xep lai hang doi') ||
    lower.includes('tạm hoãn và xếp lại hàng đợi')
  ) {
    return {
      rawMessage,
      displayMessage: 'Queue bị kẹt hoặc chuẩn bị payload quá lâu trước khi gửi sang TST. Đây là lỗi pipeline nội bộ, không phải lỗi input.',
      category: 'queue',
    };
  }

  if (
    /^524\b/.test(lower) ||
    lower.includes('524 <none>') ||
    lower.includes('gateway timeout') ||
    lower.includes('upstream request timeout') ||
    lower.includes('job set not found') ||
    lower.includes('job not found') ||
    lower.includes('provider đang xử lý') ||
    lower.includes('provider job failed')
  ) {
    return {
      rawMessage,
      displayMessage: 'TST hoặc lớp proxy upstream bị timeout / mất dấu job. Input có thể vẫn hợp lệ, nhưng lần chạy này thất bại do provider.',
      category: 'provider',
    };
  }

  if (
    lower.includes('prompt hoặc ảnh vi phạm') ||
    lower.includes('change prompt or input and try again') ||
    lower.includes('không duyệt video') ||
    lower.includes('không duyệt motion control') ||
    lower.includes('khong duyet video') ||
    lower.includes('khong duyet motion control')
  ) {
    return {
      rawMessage,
      displayMessage: 'Provider hoặc lớp kiểm duyệt đầu vào đã từ chối prompt / ảnh / video của job này.',
      category: 'input',
    };
  }

  return {
    rawMessage,
    displayMessage: rawMessage,
    category: 'unknown',
  };
};

export const normalizeQueueErrorMessage = (message?: string | null) => {
  const info = classifyQueueError(message);
  return info.displayMessage || info.rawMessage || '';
};
