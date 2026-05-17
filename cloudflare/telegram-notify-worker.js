const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MAX_TELEGRAM_MEDIA_BYTES = 5 * 1024 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });

const escapeHtml = (value) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const truncate = (value, maxLength = 360) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const isVideoUrl = (value) =>
  /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(String(value || '')) ||
  /\/video\//i.test(String(value || ''));

const isImageUrl = (value) =>
  /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(String(value || '')) ||
  /\/image\//i.test(String(value || ''));

const normalizeUrls = (values) => {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isHttpUrl).map((value) => value.trim()))];
};

const getThreadId = (env) => {
  const raw = String(env.TELEGRAM_MESSAGE_THREAD_ID || '').trim();
  return raw ? raw : null;
};

const displayValue = (value, fallback = 'N/A') => {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized ? normalized : fallback;
};

const formatIso = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
};

const formatBytes = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return 'unknown';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const getPromptMeta = (payload) => {
  const prompt = String(payload?.job?.prompt || '').trim();
  return {
    text: prompt,
    length: prompt.length,
  };
};

const getEventLabel = (eventType) => {
  switch (String(eventType || '').toLowerCase()) {
    case 'completed':
      return 'THÀNH CÔNG';
    case 'failed':
      return 'THẤT BẠI';
    case 'queue_alert':
      return 'CANH BAO HE THONG';
    default:
      return 'ĐANG XỬ LÝ';
  }
};

const buildHeader = (appName, eventType) => {
  const eventLabel = getEventLabel(eventType);
  return `<b>${escapeHtml(appName)} | ${escapeHtml(eventLabel)}</b>`;
};

const getRoleLabel = (role) => {
  switch (role) {
    case 'character':
      return 'Nhân vật';
    case 'sample':
      return 'Mẫu pose';
    case 'source':
      return 'Ảnh gốc';
    case 'keyframe':
      return 'Keyframe';
    case 'motion':
      return 'Motion';
    case 'reference':
      return 'Tham chiếu';
    case 'style':
      return 'Style';
    default:
      return 'Input';
  }
};

const getShortId = (value) => {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, 8) : 'N/A';
};

const normalizeInputMediaEntries = (payload) => {
  const inputMedia = Array.isArray(payload?.media?.inputMedia) ? payload.media.inputMedia : [];
  const normalized = [];
  const seen = new Set();

  for (const entry of inputMedia) {
    if (!entry || typeof entry !== 'object') continue;
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (!isHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    normalized.push({
      url,
      role: typeof entry.role === 'string' ? entry.role : 'reference',
      kind: entry.kind === 'video' ? 'video' : 'image',
      userProvided: entry.userProvided !== false,
    });
  }

  if (normalized.length > 0) {
    return normalized;
  }

  return normalizeUrls(payload?.media?.inputUrls).map((url) => ({
    url,
    role: 'reference',
    kind: isVideoUrl(url) ? 'video' : 'image',
    userProvided: true,
  }));
};

const buildSummaryLines = (payload) => {
  const job = payload?.job || {};
  const config = job?.config || {};
  const promptMeta = getPromptMeta(payload);
  const lines = [
    buildHeader(payload?.app || 'App', payload?.eventType || 'queued'),
    '',
    `• Công cụ: <b>${escapeHtml(displayValue(job?.toolName || job?.queueKind))}</b>`,
    `• Người dùng: ${escapeHtml(displayValue(job?.displayName, 'Unknown'))} | ${escapeHtml(displayValue(job?.costVcoin ?? 0, '0'))} VC`,
    `• Model: ${escapeHtml(displayValue(config?.modelId || job?.engine))}`,
    `• Chế độ: ${escapeHtml(displayValue(config?.mode))} | ${escapeHtml(displayValue(job?.assetType, 'image'))}`,
    `• Cấu hình: ${escapeHtml(displayValue(config?.resolution))} | ${escapeHtml(displayValue(config?.speed))}`,
    `• App Job ID: <code>${escapeHtml(getShortId(job?.id))}</code>`,
    `• Prompt: đã ẩn (${escapeHtml(String(promptMeta.length))} ký tự)`,
  ];

  if (job?.providerJobId) {
    lines.splice(lines.length - 1, 0, `• Provider ID: <code>${escapeHtml(getShortId(job?.providerJobId))}</code>`);
  }

  if (payload?.eventType === 'completed') {
    lines.push(`• Hoàn tất: ${escapeHtml(formatIso(job?.finishedAt))}`);
  } else if (payload?.eventType === 'failed') {
    lines.push(`• Lỗi: ${escapeHtml(truncate(job?.errorMessage || 'Không có chi tiết lỗi.', 220))}`);
  } else {
    lines.push(`• Tạo lúc: ${escapeHtml(formatIso(job?.createdAt))}`);
  }

  return lines;
};

const buildTextMessage = (payload, extraLines = []) => {
  return [...buildSummaryLines(payload), ...(extraLines.length > 0 ? ['', ...extraLines] : [])].join('\n');
};

const formatAlertDetailValue = (value) => {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'object') {
    try {
      return truncate(JSON.stringify(value), 260);
    } catch {
      return '[object]';
    }
  }
  return truncate(String(value), 260);
};

const buildAlertMessage = (payload) => {
  const alert = payload?.alert || {};
  const details = alert?.details && typeof alert.details === 'object' ? alert.details : {};
  const lines = [
    buildHeader(payload?.app || 'App', payload?.eventType || 'queue_alert'),
    '',
    `- Tieu de: <b>${escapeHtml(displayValue(alert?.title, 'Operational alert'))}</b>`,
    `- Muc do: ${escapeHtml(displayValue(alert?.severity, 'warning'))}`,
    `- Key: <code>${escapeHtml(displayValue(alert?.key, 'N/A'))}</code>`,
    `- Tao luc: ${escapeHtml(formatIso(alert?.createdAt))}`,
  ];

  for (const [key, value] of Object.entries(details).slice(0, 12)) {
    lines.push(`- ${escapeHtml(key)}: ${escapeHtml(formatAlertDetailValue(value))}`);
  }

  return lines.join('\n');
};

const buildMediaCaption = (payload) =>
  truncate(
    [
      buildHeader(payload?.app || 'App', payload?.eventType || 'queued').replace(/<\/?b>/g, ''),
      `${getEventLabel(payload?.eventType)} | ${displayValue(payload?.job?.toolName || payload?.job?.queueKind)}`,
      `${displayValue(payload?.job?.displayName, 'Unknown')} | ${displayValue(payload?.job?.costVcoin ?? 0, '0')} VC`,
      `Model: ${displayValue(payload?.job?.config?.modelId || payload?.job?.engine)}`,
      `App Job: ${getShortId(payload?.job?.id)}`,
      ...(payload?.job?.providerJobId ? [`Provider: ${getShortId(payload?.job?.providerJobId)}`] : []),
    ].join('\n'),
    900,
  );

const rolePriority = {
  source: 0,
  character: 1,
  sample: 2,
  keyframe: 3,
  motion: 4,
  reference: 5,
  style: 9,
};

const collectCandidateMedia = (payload) => {
  const candidates = [];
  const outputUrl = isHttpUrl(payload?.media?.outputUrl) ? payload.media.outputUrl.trim() : null;
  const inputMedia = normalizeInputMediaEntries(payload)
    .filter((entry) => entry.userProvided !== false && entry.role !== 'style')
    .sort((a, b) => (rolePriority[a.role] ?? 50) - (rolePriority[b.role] ?? 50));

  if (payload?.eventType === 'completed' && outputUrl) {
    candidates.push({
      url: outputUrl,
      role: 'output',
      kind: isVideoUrl(outputUrl) ? 'video' : 'image',
      primary: true,
    });
  }

  const maxInputPreviews = payload?.eventType === 'completed' ? 2 : 3;
  for (const entry of inputMedia.slice(0, maxInputPreviews)) {
    candidates.push({
      url: entry.url,
      role: entry.role,
      kind: entry.kind,
      primary: false,
    });
  }

  return candidates;
};

const buildMediaLinks = (payload, shownUrls = []) => {
  const shown = new Set(shownUrls);
  const lines = [];
  const inputMedia = normalizeInputMediaEntries(payload);
  const outputUrl = isHttpUrl(payload?.media?.outputUrl) ? payload.media.outputUrl.trim() : null;

  if (outputUrl && !shown.has(outputUrl)) {
    lines.push(`• Kết quả: <a href="${escapeHtml(outputUrl)}">mở</a>`);
  }

  for (const entry of inputMedia) {
    if (shown.has(entry.url)) continue;
    if (entry.userProvided === false && entry.role === 'style') continue;
    lines.push(`• ${getRoleLabel(entry.role)}: <a href="${escapeHtml(entry.url)}">mở</a>`);
    if (lines.length >= 4) break;
  }

  return lines;
};

const telegramUrl = (env, method) => `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

async function sendTelegramRequest(env, method, body) {
  const response = await fetch(telegramUrl(env, method), {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Telegram ${method} failed: ${response.status} ${text || response.statusText}`);
  }

  return response.json();
}

async function sendText(env, text) {
  const body = new URLSearchParams();
  body.set('chat_id', env.TELEGRAM_CHAT_ID);
  body.set('parse_mode', 'HTML');
  body.set('disable_web_page_preview', 'true');
  body.set('text', text);

  const threadId = getThreadId(env);
  if (threadId) body.set('message_thread_id', threadId);

  return sendTelegramRequest(env, 'sendMessage', body);
}

async function probeMedia(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { ok: false, sizeBytes: null, contentType: null };
    }

    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    return {
      ok: true,
      sizeBytes: contentLength ? Number(contentLength) : null,
      contentType: contentType || null,
    };
  } catch {
    return { ok: false, sizeBytes: null, contentType: null };
  }
}

const isVideoByContentType = (contentType) => /^video\//i.test(String(contentType || '').trim());
const isImageByContentType = (contentType) => /^image\//i.test(String(contentType || '').trim());

const getTelegramMediaType = (url, mediaInfo, fallbackKind = 'image') => {
  if (fallbackKind === 'video' || isVideoUrl(url) || isVideoByContentType(mediaInfo?.contentType)) {
    return 'video';
  }
  return 'photo';
};

async function sendMedia(env, item, caption = '') {
  const method = item.type === 'video' ? 'sendVideo' : 'sendPhoto';
  const mediaField = method === 'sendVideo' ? 'video' : 'photo';
  const body = new URLSearchParams();

  body.set('chat_id', env.TELEGRAM_CHAT_ID);
  body.set(mediaField, item.url);
  if (caption) body.set('caption', truncate(caption, 900));
  body.set('parse_mode', 'HTML');

  const threadId = getThreadId(env);
  if (threadId) body.set('message_thread_id', threadId);

  try {
    return await sendTelegramRequest(env, method, body);
  } catch (error) {
    await sendText(env, buildTextMessage(item.payload, [`• Không gửi được media trực tiếp: <a href="${escapeHtml(item.url)}">mở</a>`]));
    return { ok: false, fallback: true, error: String(error) };
  }
}

async function sendMediaGroup(env, mediaItems) {
  const body = new URLSearchParams();
  body.set('chat_id', env.TELEGRAM_CHAT_ID);
  body.set('media', JSON.stringify(mediaItems));

  const threadId = getThreadId(env);
  if (threadId) body.set('message_thread_id', threadId);

  return sendTelegramRequest(env, 'sendMediaGroup', body);
}

async function sendSingleJobMessage(env, payload) {
  const candidates = collectCandidateMedia(payload);
  const inspected = [];

  for (const candidate of candidates) {
    const mediaInfo = await probeMedia(candidate.url);
    const sizeBytes = mediaInfo?.sizeBytes;
    inspected.push({
      ...candidate,
      mediaInfo,
      sizeBytes,
      type: getTelegramMediaType(candidate.url, mediaInfo, candidate.kind),
      tooLarge: Number.isFinite(sizeBytes) && sizeBytes > MAX_TELEGRAM_MEDIA_BYTES,
      payload,
    });
  }

  const eligibleMedia = inspected.filter((item) => {
    if (item.tooLarge) return false;
    if (item.type === 'photo') {
      return isImageUrl(item.url) || isImageByContentType(item.mediaInfo?.contentType);
    }
    return isVideoUrl(item.url) || isVideoByContentType(item.mediaInfo?.contentType);
  });

  const shownUrls = eligibleMedia.map((item) => item.url);
  const extraLinks = buildMediaLinks(payload, shownUrls);

  if (eligibleMedia.length >= 2) {
    const mediaItems = eligibleMedia.slice(0, 4).map((item, index) => ({
      type: item.type,
      media: item.url,
      ...(index === 0 ? { caption: buildMediaCaption(payload), parse_mode: 'HTML' } : {}),
    }));

    await sendMediaGroup(env, mediaItems);

    if (extraLinks.length > 0) {
      await sendText(env, buildTextMessage(payload, extraLinks));
    }
    return;
  }

  if (eligibleMedia.length === 1) {
    await sendMedia(env, eligibleMedia[0], buildMediaCaption(payload));

    if (extraLinks.length > 0) {
      await sendText(env, buildTextMessage(payload, extraLinks));
    }
    return;
  }

  await sendText(env, buildTextMessage(payload, extraLinks));
}

async function handleNotification(env, payload) {
  if (String(payload?.eventType || '').toLowerCase() === 'queued') {
    return;
  }

  if (String(payload?.eventType || '').toLowerCase() === 'queue_alert') {
    await sendText(env, buildAlertMessage(payload));
    return;
  }

  await sendSingleJobMessage(env, payload);
}

export default {
  async fetch(request, env) {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !env.TELEGRAM_WEBHOOK_SECRET) {
      return json(
        {
          ok: false,
          error: 'Missing TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, or TELEGRAM_WEBHOOK_SECRET',
        },
        500,
      );
    }

    if (request.method === 'GET') {
      return json({
        ok: true,
        service: 'telegram-notify-worker',
      });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method Not Allowed' }, 405);
    }

    const incomingSecret = request.headers.get('x-notify-secret') || '';
    if (incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    try {
      const payload = await request.json();
      await handleNotification(env, payload);
      return json({ ok: true });
    } catch (error) {
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown worker error',
        },
        500,
      );
    }
  },
};
