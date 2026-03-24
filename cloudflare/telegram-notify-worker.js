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
  if (Number.isNaN(date.getTime())) {
    return displayValue(value);
  }

  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
};

const formatBytes = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return 'unknown';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const buildHeader = (appName, eventType) => {
  switch (String(eventType || '').toLowerCase()) {
    case 'completed':
      return `<b>${escapeHtml(appName)} | THÀNH CÔNG</b>`;
    case 'failed':
      return `<b>${escapeHtml(appName)} | THẤT BẠI</b>`;
    default:
      return `<b>${escapeHtml(appName)} | JOB MỚI</b>`;
  }
};

const buildMediaLinks = (payload, labelPrefix = '') => {
  const inputUrls = normalizeUrls(payload?.media?.inputUrls);
  const outputUrl = isHttpUrl(payload?.media?.outputUrl) ? payload.media.outputUrl.trim() : null;
  const lines = [];
  const prefix = labelPrefix ? `${labelPrefix} ` : '';

  if (inputUrls.length > 0) {
    lines.push(`- ${prefix}Input: <a href="${escapeHtml(inputUrls[0])}">open</a>`);
  }

  if (outputUrl) {
    lines.push(`- ${prefix}Output: <a href="${escapeHtml(outputUrl)}">open</a>`);
  }

  return lines;
};

const getEventLabel = (eventType) => {
  switch (String(eventType || '').toLowerCase()) {
    case 'completed':
      return 'THÀNH CÔNG';
    case 'failed':
      return 'THẤT BẠI';
    default:
      return 'JOB MỚI';
  }
};

const getPromptMeta = (payload) => {
  const prompt = String(payload?.job?.prompt || '').trim();
  return {
    text: prompt,
    length: prompt.length,
  };
};

const buildEventSummary = (payload) => {
  const eventType = String(payload?.eventType || 'queued').toLowerCase();
  const job = payload?.job || {};
  const config = job?.config || {};
  const promptMeta = getPromptMeta(payload);
  const eventLabel = getEventLabel(eventType);

  if (eventType === 'completed') {
    return [
      buildHeader(payload?.app || 'App', eventType),
      `<b>${eventLabel}</b> | ${escapeHtml(displayValue(job?.toolName || job?.queueKind))}`,
      `Người dùng: ${escapeHtml(displayValue(job?.displayName, 'Unknown'))} | Vcoin: ${escapeHtml(displayValue(job?.costVcoin ?? 0, '0'))}`,
      `Model: ${escapeHtml(displayValue(config?.modelId || job?.engine))}`,
      `Độ phân giải/Tốc độ: ${escapeHtml(displayValue(config?.resolution))} | ${escapeHtml(displayValue(config?.speed))}`,
      `Server: ${escapeHtml(displayValue(config?.serverId))}`,
      `Hoàn tất lúc: ${escapeHtml(formatIso(job?.finishedAt))}`,
      `Prompt: đã ẩn (${escapeHtml(String(promptMeta.length))} ký tự)`,
    ].filter(Boolean);
  }

  if (eventType === 'failed') {
    return [
      buildHeader(payload?.app || 'App', eventType),
      `<b>${eventLabel}</b> | ${escapeHtml(displayValue(job?.toolName || job?.queueKind))}`,
      `Người dùng: ${escapeHtml(displayValue(job?.displayName, 'Unknown'))} | Vcoin: ${escapeHtml(displayValue(job?.costVcoin ?? 0, '0'))}`,
      `Chế độ: ${escapeHtml(displayValue(config?.mode))} | Model: ${escapeHtml(displayValue(config?.modelId || job?.engine))}`,
      `Tạo lúc: ${escapeHtml(formatIso(job?.createdAt))}`,
      job?.errorMessage ? `Lỗi: ${escapeHtml(truncate(job.errorMessage, 220))}` : '',
      `Prompt: đã ẩn (${escapeHtml(String(promptMeta.length))} ký tự)`,
    ].filter(Boolean);
  }

  return [
    buildHeader(payload?.app || 'App', eventType),
    `<b>${eventLabel}</b> | ${escapeHtml(displayValue(job?.toolName || job?.queueKind))}`,
    `Người dùng: ${escapeHtml(displayValue(job?.displayName, 'Unknown'))} | Vcoin: ${escapeHtml(displayValue(job?.costVcoin ?? 0, '0'))}`,
    `Chế độ: ${escapeHtml(displayValue(config?.mode))} | Loại: ${escapeHtml(displayValue(job?.assetType, 'image'))}`,
    `Model: ${escapeHtml(displayValue(config?.modelId || job?.engine))}`,
    `Độ phân giải/Tốc độ: ${escapeHtml(displayValue(config?.resolution))} | ${escapeHtml(displayValue(config?.speed))}`,
    `Server: ${escapeHtml(displayValue(config?.serverId))}`,
    `Tạo lúc: ${escapeHtml(formatIso(job?.createdAt))}`,
    `Prompt: đã ẩn (${escapeHtml(String(promptMeta.length))} ký tự)`,
  ].filter(Boolean);
};

const buildTextMessage = (payload) => {
  const eventType = String(payload?.eventType || 'queued').toLowerCase();
  const job = payload?.job || {};
  const media = payload?.media || {};
  const config = job?.config || {};
  const promptMeta = getPromptMeta(payload);
  const inputCount = normalizeUrls(media?.inputUrls).length;
  const lines = [
    buildHeader(payload?.app || 'App', eventType),
    '',
    `<b>Tóm tắt</b>`,
    ...buildEventSummary(payload).slice(1).map((line) => `- ${line.replace(/<[^>]+>/g, '')}`),
    '',
    `<b>Người dùng</b>`,
    `- Tên: ${escapeHtml(displayValue(job?.displayName, 'Unknown'))}`,
    `- Email: ${escapeHtml(displayValue(job?.email))}`,
    `- User ID: <code>${escapeHtml(displayValue(job?.userId, '-'))}</code>`,
    '',
    `<b>Job</b>`,
    `- Trạng thái: <b>${escapeHtml(displayValue(job?.status || eventType).toUpperCase())}</b>`,
    `- Tính năng: ${escapeHtml(displayValue(job?.toolName || job?.queueKind))}`,
    `- Loại nội dung: ${escapeHtml(displayValue(job?.assetType, 'image'))}`,
    `- Vcoin: ${escapeHtml(displayValue(job?.costVcoin ?? 0, '0'))}`,
    `- Job ID: <code>${escapeHtml(displayValue(job?.id, '-'))}</code>`,
    '',
    `<b>Cấu hình</b>`,
    `- Chế độ: ${escapeHtml(displayValue(config?.mode))}`,
    `- Model: ${escapeHtml(displayValue(config?.modelId || job?.engine))}`,
    `- Độ phân giải: ${escapeHtml(displayValue(config?.resolution))} | Tốc độ: ${escapeHtml(displayValue(config?.speed))}`,
    `- Server: ${escapeHtml(displayValue(config?.serverId))} | Tỷ lệ: ${escapeHtml(displayValue(config?.aspectRatio))}`,
    `- Thời lượng: ${escapeHtml(displayValue(config?.duration))} | Âm thanh: ${escapeHtml(config?.audio === true ? 'bật' : config?.audio === false ? 'tắt' : 'N/A')}`,
    `- Số nhân vật: ${escapeHtml(displayValue(config?.characterCount))}`,
    '',
    `<b>Thời gian</b>`,
    `- Tạo lúc: ${escapeHtml(formatIso(job?.createdAt))}`,
    `- Hoàn tất lúc: ${escapeHtml(formatIso(job?.finishedAt))}`,
    '',
    `<b>Media</b>`,
    `- Số ảnh input: ${escapeHtml(displayValue(inputCount, '0'))}`,
    `- Kết quả: ${isHttpUrl(media?.outputUrl) ? 'có link bên dưới' : 'N/A'}`,
  ];

  const mediaLinks = buildMediaLinks(payload);
  if (mediaLinks.length > 0) {
    lines.push(...mediaLinks);
  }

  lines.push('', `<b>Prompt</b>`, `- Đã ẩn | độ dài: ${escapeHtml(String(promptMeta.length))} ký tự`);

  if (job?.errorMessage) {
    lines.push('', `<b>Lỗi</b>`, `<pre>${escapeHtml(truncate(job.errorMessage, 500))}</pre>`);
  }

  return lines.join('\n');
};

const buildMediaCaption = (payload) => {
  const lines = buildEventSummary(payload);
  const links = buildMediaLinks(payload);
  if (links.length > 0) {
    lines.push(...links);
  }
  return truncate(lines.join('\n'), 900);
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
      return {
        ok: false,
        sizeBytes: null,
        contentType: null,
      };
    }

    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');

    return {
      ok: true,
      sizeBytes: contentLength ? Number(contentLength) : null,
      contentType: contentType || null,
    };
  } catch {
    return {
      ok: false,
      sizeBytes: null,
      contentType: null,
    };
  }
}

const isVideoByContentType = (contentType) => /^video\//i.test(String(contentType || '').trim());
const isImageByContentType = (contentType) => /^image\//i.test(String(contentType || '').trim());

const getTelegramMediaType = (url, mediaInfo) => {
  if (isVideoUrl(url) || isVideoByContentType(mediaInfo?.contentType)) {
    return 'video';
  }
  return 'photo';
};

async function sendMedia(env, url, caption = '') {
  const method = isVideoUrl(url) ? 'sendVideo' : 'sendPhoto';
  const mediaField = method === 'sendVideo' ? 'video' : 'photo';
  const body = new URLSearchParams();

  body.set('chat_id', env.TELEGRAM_CHAT_ID);
  body.set(mediaField, url);
  if (caption) {
    body.set('caption', truncate(caption, 900));
  }
  body.set('parse_mode', 'HTML');

  const threadId = getThreadId(env);
  if (threadId) body.set('message_thread_id', threadId);

  try {
    return await sendTelegramRequest(env, method, body);
  } catch (error) {
    await sendText(env, `<b>Không gửi được media trực tiếp</b>\n${escapeHtml(url)}`);
    return { ok: false, fallback: true, error: String(error) };
  }
}

const collectCandidateMedia = (payload) => {
  const inputUrls = normalizeUrls(payload?.media?.inputUrls);
  return inputUrls.slice(0, 6);
};

async function sendMediaGroup(env, mediaItems) {
  const body = new URLSearchParams();
  body.set('chat_id', env.TELEGRAM_CHAT_ID);
  body.set('media', JSON.stringify(mediaItems));

  const threadId = getThreadId(env);
  if (threadId) body.set('message_thread_id', threadId);

  return sendTelegramRequest(env, 'sendMediaGroup', body);
}

async function sendSingleJobMessage(env, payload) {
  const candidateUrls = collectCandidateMedia(payload);
  const inspected = [];

  for (const url of candidateUrls) {
    const mediaInfo = await probeMedia(url);
    const sizeBytes = mediaInfo?.sizeBytes;
    const tooLarge = Number.isFinite(sizeBytes) && sizeBytes > MAX_TELEGRAM_MEDIA_BYTES;

    inspected.push({
      url,
      mediaInfo,
      sizeBytes,
      tooLarge,
      type: getTelegramMediaType(url, mediaInfo),
    });
  }

  const eligibleMedia = inspected.filter(
    (item) =>
      !item.tooLarge &&
      item.type === 'photo' &&
      (isImageUrl(item.url) || isImageByContentType(item.mediaInfo?.contentType)),
  );
  const overflowLinks = inspected.filter((item) => item.tooLarge);
  const outputUrl = isHttpUrl(payload?.media?.outputUrl) ? payload.media.outputUrl.trim() : null;
  const extraLinks = [
    ...(outputUrl ? [`- Output: <a href="${escapeHtml(outputUrl)}">open</a>`] : []),
    ...overflowLinks.map(
      (item, index) => `- Input ${index + 1}: <a href="${escapeHtml(item.url)}">open</a> (${escapeHtml(formatBytes(item.sizeBytes))})`,
    ),
  ];

  if (eligibleMedia.length >= 2) {
    const mediaItems = eligibleMedia.slice(0, 4).map((item, index) => ({
      type: item.type,
      media: item.url,
      ...(index === 0
        ? {
            caption: buildMediaCaption(payload),
            parse_mode: 'HTML',
          }
        : {}),
    }));

    await sendMediaGroup(env, mediaItems);

    if (extraLinks.length > 0) {
      const extraText = [
        `<b>Link media</b>`,
        ...extraLinks,
      ].join('\n');
      await sendText(env, extraText);
    }
    return;
  }

  if (eligibleMedia.length === 1) {
    await sendMedia(env, eligibleMedia[0].url, buildMediaCaption(payload));

    if (extraLinks.length > 0) {
      await sendText(env, [`<b>Link media</b>`, ...extraLinks].join('\n'));
    }
    return;
  }

  const fallbackText = [
    buildTextMessage(payload),
    ...(extraLinks.length > 0
      ? [
          '',
          `<b>Link media</b>`,
          ...extraLinks,
        ]
      : []),
  ].join('\n');

  await sendText(env, fallbackText);
}

async function handleNotification(env, payload) {
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
