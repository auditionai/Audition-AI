const TELEGRAM_API_BASE = 'https://api.telegram.org';

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

const normalizeUrls = (values) => {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isHttpUrl).map((value) => value.trim()))];
};

const getThreadId = (env) => {
  const raw = String(env.TELEGRAM_MESSAGE_THREAD_ID || '').trim();
  return raw ? raw : null;
};

const buildTextMessage = (payload) => {
  const eventType = String(payload?.eventType || 'queued').toUpperCase();
  const job = payload?.job || {};
  const media = payload?.media || {};
  const config = job?.config || {};
  const prompt = truncate(job?.prompt || '', 500);
  const lines = [
    `<b>${escapeHtml(payload?.app || 'App')} | ${escapeHtml(eventType)}</b>`,
    '',
    `<b>User:</b> ${escapeHtml(job?.displayName || 'Unknown')}`,
    `<b>Email:</b> ${escapeHtml(job?.email || 'N/A')}`,
    `<b>User ID:</b> <code>${escapeHtml(job?.userId || '')}</code>`,
    `<b>Job ID:</b> <code>${escapeHtml(job?.id || '')}</code>`,
    `<b>Feature:</b> ${escapeHtml(job?.toolName || job?.queueKind || 'N/A')}`,
    `<b>Asset:</b> ${escapeHtml(job?.assetType || 'image')}`,
    `<b>Mode:</b> ${escapeHtml(config?.mode || 'N/A')}`,
    `<b>Model:</b> ${escapeHtml(config?.modelId || job?.engine || 'N/A')}`,
    `<b>Resolution:</b> ${escapeHtml(config?.resolution || 'N/A')}`,
    `<b>Speed:</b> ${escapeHtml(config?.speed || 'N/A')}`,
    `<b>Server:</b> ${escapeHtml(config?.serverId || 'N/A')}`,
    `<b>Duration:</b> ${escapeHtml(config?.duration || 'N/A')}`,
    `<b>Aspect Ratio:</b> ${escapeHtml(config?.aspectRatio || 'N/A')}`,
    `<b>Audio:</b> ${config?.audio === true ? 'on' : config?.audio === false ? 'off' : 'N/A'}`,
    `<b>Characters:</b> ${escapeHtml(config?.characterCount || 'N/A')}`,
    `<b>Vcoin:</b> ${escapeHtml(job?.costVcoin ?? 0)}`,
    `<b>Status:</b> ${escapeHtml(job?.status || payload?.eventType || 'N/A')}`,
    `<b>Created:</b> ${escapeHtml(job?.createdAt || 'N/A')}`,
    `<b>Finished:</b> ${escapeHtml(job?.finishedAt || 'N/A')}`,
    `<b>Input Media:</b> ${normalizeUrls(media?.inputUrls).length}`,
    `<b>Output:</b> ${isHttpUrl(media?.outputUrl) ? 'attached below' : 'N/A'}`,
  ];

  if (prompt) {
    lines.push('', `<b>Prompt:</b>\n${escapeHtml(prompt)}`);
  }

  if (job?.errorMessage) {
    lines.push('', `<b>Error:</b>\n${escapeHtml(truncate(job.errorMessage, 500))}`);
  }

  return lines.join('\n');
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

async function sendMedia(env, url, caption = '') {
  const isVideo = isVideoUrl(url);
  const method = isVideo ? 'sendVideo' : 'sendPhoto';
  const mediaField = isVideo ? 'video' : 'photo';
  const body = new URLSearchParams();

  body.set('chat_id', env.TELEGRAM_CHAT_ID);
  body.set(mediaField, url);
  if (caption) {
    body.set('caption', truncate(caption, 900));
  }

  const threadId = getThreadId(env);
  if (threadId) body.set('message_thread_id', threadId);

  try {
    return await sendTelegramRequest(env, method, body);
  } catch (error) {
    await sendText(env, `<b>Media fallback:</b>\n${escapeHtml(url)}`);
    return { ok: false, fallback: true, error: String(error) };
  }
}

async function handleNotification(env, payload) {
  const eventType = String(payload?.eventType || 'queued').toLowerCase();
  const inputUrls = normalizeUrls(payload?.media?.inputUrls);
  const outputUrl = isHttpUrl(payload?.media?.outputUrl) ? payload.media.outputUrl.trim() : null;

  await sendText(env, buildTextMessage(payload));

  if (eventType === 'queued') {
    for (const url of inputUrls.slice(0, 3)) {
      await sendMedia(env, url, 'Input media');
    }
    return;
  }

  if (eventType === 'failed') {
    for (const url of inputUrls.slice(0, 1)) {
      await sendMedia(env, url, 'Failed job input');
    }
    return;
  }

  if (eventType === 'completed' && outputUrl) {
    await sendMedia(env, outputUrl, 'Output result');
  }
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
