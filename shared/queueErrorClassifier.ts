import { repairVietnameseMojibake } from './queueLogText';
import type { QueueProgressLogEntry } from './queueRecipes';

export type QueueErrorCategory = 'input' | 'queue' | 'provider' | 'config' | 'unknown';

export type QueueErrorInfo = {
  rawMessage?: string;
  displayMessage?: string;
  category: QueueErrorCategory;
};

const normalizeErrorText = (message?: string | null) => repairVietnameseMojibake(message || '').trim();

const withRawDetail = (message: string, rawMessage: string) => {
  if (!rawMessage || message.includes(rawMessage)) {
    return message;
  }
  return `${message}\nChi tiet TST: ${rawMessage}`;
};

const buildSuggestedFailureMessage = (rawMessage: string, lower: string) => {
  const isPromptLengthError =
    lower.includes('prompt') &&
    (lower.includes('3500') ||
      lower.includes('too long') ||
      lower.includes('length') ||
      lower.includes('characters') ||
      lower.includes('maximum') ||
      lower.includes('max ') ||
      lower.includes('vuot gioi han') ||
      lower.includes('qua dai'));

  if (isPromptLengthError) {
    return withRawDetail(
      'Prompt vuot gioi han cua model/server. Goi y: rut gon phan lap lai, giu y chinh o dau prompt, hoac doi sang server/model co gioi han prompt cao hon.',
      rawMessage,
    );
  }

  const isConnectionDrop =
    lower.includes('curl: (56)') ||
    lower.includes('connection closed abruptly') ||
    lower.includes('failed to perform') ||
    lower.includes('libcurl') ||
    lower.includes('connection closed') ||
    lower.includes('connection reset') ||
    lower.includes('socket hang up');

  if (isConnectionDrop) {
    return withRawDetail(
      'Ket noi toi TST/provider bi dong giua chung. Goi y: thu lai sau vai phut; neu dang tao video bang Grok, hay thu Seedance hoac Kling vi day thuong la loi provider/upstream, khong phai loi anh hay prompt.',
      rawMessage,
    );
  }

  const isTimeout =
    lower.includes('timeout') ||
    lower.includes('gateway timeout') ||
    lower.includes('upstream request timeout') ||
    /^524\b/.test(lower) ||
    lower.includes('524 <none>');

  if (isTimeout) {
    return withRawDetail(
      'TST/provider xu ly qua lau hoac gateway timeout. Goi y: thu lai sau, doi server/model, giam so anh tham chieu hoac rut gon prompt neu prompt qua dai.',
      rawMessage,
    );
  }

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
      lower.includes('fetch'));

  if (isMediaError) {
    return withRawDetail(
      'TST khong doc duoc media dau vao. Goi y: tai lai anh/video ro net, dung dinh dang JPG/PNG/MP4, tranh file qua nang; voi Motion Control nen dung video mau duoi 30 giay.',
      rawMessage,
    );
  }

  const isModerationOrInputRejected =
    lower.includes('moderation') ||
    lower.includes('safety') ||
    lower.includes('prohibited') ||
    lower.includes('vi pham') ||
    lower.includes('change prompt or input and try again') ||
    lower.includes('not pass moderation');

  if (isModerationOrInputRejected) {
    return withRawDetail(
      'TST/provider tu choi input theo bo loc dau vao. Goi y: doi cach viet prompt, tranh tu khoa nhay cam, hoac thay anh/video dau vao roi tao lai.',
      rawMessage,
    );
  }

  return withRawDetail(
    'TST/provider bao loi khi tao ket qua. Goi y: thu lai sau, doi server/model, hoac kiem tra lai prompt va media dau vao neu loi lap lai.',
    rawMessage,
  );
};

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
      displayMessage: withRawDetail(
        'May chu Audition AI dang thieu TST_API_KEY. Day la loi cau hinh server cua app, khong phai loi input cua user.',
        rawMessage,
      ),
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
      displayMessage: withRawDetail(
        'Cau hinh TST ma app dang chon khong con hop le. Goi y: doi server/model khac hoac bao admin dong bo lai bang gia TST.',
        rawMessage,
      ),
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
      displayMessage: buildSuggestedFailureMessage(rawMessage, lower),
      category: 'config',
    };
  }

  if (
    lower.includes('admin manually stopped this job') ||
    lower.includes('quan tri vien da dung job') ||
    lower.includes('da dung thu cong')
  ) {
    return {
      rawMessage,
      displayMessage: 'Job da duoc quan tri vien dung thu cong, nen queue se khong tiep tuc xu ly hay rescue lai nua.',
      category: 'queue',
    };
  }

  if (
    lower.includes('queue preparation timed out before') ||
    lower.includes('qua thoi gian chuan bi') ||
    lower.includes('tam hoan va xep lai hang doi')
  ) {
    return {
      rawMessage,
      displayMessage: withRawDetail(
        'Queue bi ket hoac chuan bi payload qua lau truoc khi gui sang TST. Day la loi pipeline noi bo, khong phai loi input.',
        rawMessage,
      ),
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
    lower.includes('curl: (56)') ||
    lower.includes('failed to connect to') ||
    lower.includes('failed to perform') ||
    lower.includes('could not connect to server') ||
    lower.includes('libcurl') ||
    lower.includes('connection closed abruptly') ||
    lower.includes('job set not found') ||
    lower.includes('job not found') ||
    lower.includes('provider dang xu ly') ||
    lower.includes('provider job failed')
  ) {
    return {
      rawMessage,
      displayMessage: buildSuggestedFailureMessage(rawMessage, lower),
      category: 'provider',
    };
  }

  if (
    (lower.includes('prompt') &&
      (lower.includes('3500') ||
        lower.includes('too long') ||
        lower.includes('length') ||
        lower.includes('characters') ||
        lower.includes('maximum') ||
        lower.includes('max ') ||
        lower.includes('vuot gioi han') ||
        lower.includes('qua dai'))) ||
    lower.includes('prompt hoac anh vi pham') ||
    lower.includes('change prompt or input and try again') ||
    lower.includes('not pass moderation') ||
    lower.includes('moderation') ||
    lower.includes('safety') ||
    lower.includes('prohibited') ||
    lower.includes('khong duyet video') ||
    lower.includes('khong duyet motion control') ||
    lower.includes('identity guard failed') ||
    lower.includes('hau kiem ket qua ai') ||
    (lower.includes('retry limit reached') && lower.includes('identity guard'))
  ) {
    return {
      rawMessage,
      displayMessage: lower.includes('identity guard failed')
        ? withRawDetail(
            'Ket qua AI khong vuot qua buoc hau kiem identity/consistency, nen job duoc danh dau that bai.',
            rawMessage,
          )
        : buildSuggestedFailureMessage(rawMessage, lower),
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
