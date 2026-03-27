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

  if (
    latestFailedLog?.message &&
    (latestFailedLog.message.toLowerCase().includes('rescue tst') || isTerminalRescueFailureMessage(latestFailedLog.message))
  ) {
    return latestFailedLog.message;
  }

  return errorMessage || '';
};

export const classifyQueueError = (message?: string | null): QueueErrorInfo => {
  const rawMessage = normalizeErrorText(message);
  const lower = rawMessage.toLowerCase();
  const isUpstreamGatewayError =
    /^52[0-6]\b/.test(lower) ||
    lower.includes('520 <none>') ||
    lower.includes('521 <none>') ||
    lower.includes('522 <none>') ||
    lower.includes('523 <none>') ||
    lower.includes('525 <none>') ||
    lower.includes('526 <none>');

  if (!rawMessage) {
    return {
      rawMessage: undefined,
      displayMessage: undefined,
      category: 'unknown',
    };
  }

  if (lower.includes('missing tst_api_key')) {
    return {
      rawMessage,
      displayMessage:
        'May chu Audition AI dang thieu TST_API_KEY. Day la loi cau hinh server cua app, khong phai TST ben ngoai bi down va khong phai do input cua user.',
      category: 'config',
    };
  }

  if (
    lower.includes('invalid_tst_config') ||
    lower.includes('khong con kha dung tren tst') ||
    lower.includes('selected configuration is not available on tst')
  ) {
    return {
      rawMessage,
      displayMessage:
        'Cau hinh TST ma app dang chon khong con hop le. Day la loi mapping/cau hinh he thong, khong phai do input cua user.',
      category: 'config',
    };
  }

  if (
    lower.includes('tst_unavailable') ||
    lower.includes('tst is unavailable') ||
    lower.includes('khong the ket noi tst')
  ) {
    return {
      rawMessage,
      displayMessage:
        'Ket noi tu may chu Audition AI toi TST dang gap loi hoac upstream tam thoi khong san sang. Day la loi he thong, khong phai do input cua user.',
      category: 'config',
    };
  }

  if (
    lower.includes('queue preparation timed out before') ||
    lower.includes('qua thoi gian chuan bi') ||
    lower.includes('tam hoan va xep lai hang doi')
  ) {
    return {
      rawMessage,
      displayMessage:
        'Queue bi ket hoac chuan bi payload qua lau truoc khi gui sang TST. Day la loi pipeline noi bo, khong phai loi input.',
      category: 'queue',
    };
  }

  if (
    isUpstreamGatewayError ||
    /^524\b/.test(lower) ||
    lower.includes('524 <none>') ||
    lower.includes('gateway timeout') ||
    lower.includes('upstream request timeout') ||
    lower.includes('curl: (7)') ||
    lower.includes('failed to connect to') ||
    lower.includes('could not connect to server') ||
    lower.includes('libcurl') ||
    lower.includes('job set not found') ||
    lower.includes('job not found') ||
    lower.includes('provider dang xu ly') ||
    lower.includes('provider job failed')
  ) {
    return {
      rawMessage,
      displayMessage:
        'TST hoặc lớp proxy upstream đang lỗi tạm thời (HTTP 52x / timeout / mất dấu job). Input có thể vẫn hợp lệ, nhưng lần chạy này thất bại do provider.',
      category: 'provider',
    };
  }

  if (
    lower.includes('prompt hoac anh vi pham') ||
    lower.includes('change prompt or input and try again') ||
    lower.includes('khong duyet video') ||
    lower.includes('khong duyet motion control') ||
    lower.includes('identity guard failed') ||
    lower.includes('hau kiem ket qua ai') ||
    lower.includes('retry limit reached') && lower.includes('identity guard')
  ) {
    return {
      rawMessage,
      displayMessage:
        lower.includes('identity guard failed')
          ? 'Ket qua AI khong vuot qua buoc hau kiem identity/consistency, nen job duoc danh dau that bai va khong nen tu dong rescue lai.'
          : 'Provider hoac lop kiem duyet dau vao da tu choi prompt / anh / video cua job nay.',
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
