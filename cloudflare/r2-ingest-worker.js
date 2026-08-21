const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const RETENTION_DAYS = 7;
const CLEANUP_PREFIXES = ['edited/', 'inputs/', 'users/'];

const getVietnamMondayStart = (now = new Date()) => {
  const vietnamNow = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  const day = vietnamNow.getUTCDay();
  const mondayDelta = day === 0 ? 6 : day - 1;
  const mondayUtc = Date.UTC(
    vietnamNow.getUTCFullYear(),
    vietnamNow.getUTCMonth(),
    vietnamNow.getUTCDate() - mondayDelta,
  );
  return new Date(mondayUtc - VIETNAM_OFFSET_MS);
};

const formatVietnamDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

const notifyCleanup = async (env, alert) => {
  if (!env.TELEGRAM_NOTIFY_WEBHOOK_URL || !env.TELEGRAM_NOTIFY_WEBHOOK_SECRET) return;
  await fetch(env.TELEGRAM_NOTIFY_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-notify-secret': env.TELEGRAM_NOTIFY_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      eventType: 'queue_alert',
      app: 'Audition AI',
      alert: { ...alert, createdAt: new Date().toISOString() },
    }),
  });
};

const cleanupR2 = async (env) => {
  const cutoff = new Date(getVietnamMondayStart().getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const summary = {};
  for (const prefix of CLEANUP_PREFIXES) {
    let cursor;
    let scanned = 0;
    let deleted = 0;
    let bytes = 0;
    do {
      const page = await env.ASSETS.list({ prefix, cursor, limit: 1000 });
      const expired = page.objects.filter((object) => {
        scanned += 1;
        return object.uploaded && object.uploaded < cutoff;
      });
      if (expired.length) {
        await env.ASSETS.delete(expired.map((object) => object.key));
        deleted += expired.length;
        bytes += expired.reduce((total, object) => total + Number(object.size || 0), 0);
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    summary[prefix] = { scanned, deleted, bytes };
  }
  const totals = CLEANUP_PREFIXES.reduce((result, prefix) => ({
    scanned: result.scanned + summary[prefix].scanned,
    deleted: result.deleted + summary[prefix].deleted,
    bytes: result.bytes + summary[prefix].bytes,
  }), { scanned: 0, deleted: 0, bytes: 0 });
  await notifyCleanup(env, {
    title: 'R2 weekly cleanup completed',
    severity: 'info',
    key: 'r2_weekly_cleanup_cloudflare',
    details: {
      timezone: 'Asia/Ho_Chi_Minh',
      protectedRecentDays: RETENTION_DAYS,
      cutoffVietnamDate: formatVietnamDate(cutoff),
      totals,
      prefixes: summary,
    },
  });
  return { cutoff: cutoff.toISOString(), summary };
};

const extensionForMime = (contentType, assetType) => {
  const mime = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  return assetType === 'video' ? 'mp4' : 'png';
};

const allowedSource = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};

const decodeInlineImage = (value) => {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, '')), (character) => character.charCodeAt(0));
  return bytes.byteLength <= 20 * 1024 * 1024 ? { bytes, contentType: match[1].toLowerCase() } : null;
};

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    if (request.headers.get('authorization') !== `Bearer ${env.INGEST_SECRET}`) return json({ error: 'Unauthorized' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const sourceUrl = String(body?.sourceUrl || '').trim();
    const inlineImage = decodeInlineImage(body?.inlineData);
    const key = String(body?.key || '').replace(/^\/+/, '');
    const assetType = body?.assetType === 'video' ? 'video' : 'image';
    const validKey = /^users\/[^/]+\/generated\/[^/]+\.(png|jpg|webp|mp4|mov|webm)$/i.test(key);
    if ((!allowedSource(sourceUrl) && !(assetType === 'image' && inlineImage)) || !validKey) {
      return json({ error: 'Invalid source or key' }, 400);
    }
    if (inlineImage) {
      const extension = extensionForMime(inlineImage.contentType, assetType);
      const finalKey = key.replace(/\.(png|jpg|webp|mp4|mov|webm)$/i, `.${extension}`);
      await env.ASSETS.put(finalKey, inlineImage.bytes, { httpMetadata: { contentType: inlineImage.contentType } });
      return json({ publicUrl: `${env.PUBLIC_URL.replace(/\/+$/, '')}/${finalKey}`, key: finalKey });
    }
    const source = await fetch(sourceUrl);
    if (!source.ok || !source.body) return json({ error: `Provider returned ${source.status}` }, 502);
    const contentType = source.headers.get('content-type') || (assetType === 'video' ? 'video/mp4' : 'image/png');
    const extension = extensionForMime(contentType, assetType);
    const finalKey = key.replace(/\.(png|jpg|webp|mp4|mov|webm)$/i, `.${extension}`);
    await env.ASSETS.put(finalKey, source.body, { httpMetadata: { contentType } });
    return json({ publicUrl: `${env.PUBLIC_URL.replace(/\/+$/, '')}/${finalKey}`, key: finalKey });
  },

  async scheduled(_event, env) {
    try {
      await cleanupR2(env);
    } catch (error) {
      await notifyCleanup(env, {
        title: 'R2 weekly cleanup failed',
        severity: 'error',
        key: 'r2_weekly_cleanup_cloudflare_failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      }).catch(() => {});
      throw error;
    }
  },
};
