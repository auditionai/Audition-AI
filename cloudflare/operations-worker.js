const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const h = (env) => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' });
const isAuthorizedWorkerRequest = (request, env) => {
  const expected = String(env.OPERATIONS_WORKER_SECRET || '').trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}` || request.headers.get('x-worker-secret') === expected;
};
const rpc = (env, name, body = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: h(env), body: JSON.stringify(body) });
const db = (env, path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...h(env), ...(init.headers || {}) } });
const reconcileFailedRefunds = async (env) => {
  const failedResponse = await db(env, 'generated_images?select=id,cost_vcoin&status=eq.failed&cost_vcoin=gt.0&order=updated_at.desc&limit=100');
  if (!failedResponse.ok) throw new Error(`Failed-refund scan failed (${failedResponse.status}): ${await failedResponse.text()}`);
  const failedJobs = await failedResponse.json();
  if (!Array.isArray(failedJobs) || failedJobs.length === 0) return { scanned: 0, refunded: 0, alreadyRefunded: 0 };

  const refundResponse = await db(env, 'vcoin_transactions?select=reference_id&reference_type=eq.generated_image_refund&limit=1000');
  if (!refundResponse.ok) throw new Error(`Refund-ledger scan failed (${refundResponse.status}): ${await refundResponse.text()}`);
  const refundedIds = new Set((await refundResponse.json()).map((entry) => String(entry.reference_id || '')));
  let refunded = 0;
  let alreadyRefunded = 0;
  for (const job of failedJobs) {
    if (refundedIds.has(String(job.id))) {
      alreadyRefunded += 1;
      continue;
    }
    const response = await rpc(env, 'refund_generated_job', {
      p_generated_image_id: job.id,
      p_reason: 'Refund: operations reconciliation for failed queue job',
    });
    if (!response.ok) throw new Error(`Refund reconciliation failed (${response.status}): ${await response.text()}`);
    if (await response.json()) refunded += 1;
  }
  return { scanned: failedJobs.length, refunded, alreadyRefunded };
};
const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());
const addMedia = (entries, url, role, kind = 'image', userProvided = true) => {
  if (!isHttpUrl(url) || entries.some((entry) => entry.url === url.trim())) return;
  entries.push({ url: url.trim(), role, kind, userProvided });
};
const notificationMedia = (payload) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const recipe = raw.__recipePayload && typeof raw.__recipePayload === 'object' ? raw.__recipePayload : raw;
  const entries = [];
  if (Array.isArray(raw.__notifyInputMedia)) raw.__notifyInputMedia.forEach((entry) => addMedia(entries, entry?.url, entry?.role || 'reference', entry?.kind === 'video' ? 'video' : 'image', entry?.userProvided !== false));
  if (entries.length) return entries;
  const addMany = (values, role) => Array.isArray(values) && values.forEach((value) => addMedia(entries, value, role));
  addMany(recipe.characterImages, 'character'); addMany(recipe.referenceImages, 'reference');
  for (const group of Array.isArray(recipe.characterReferenceGroups) ? recipe.characterReferenceGroups : []) {
    for (const reference of Array.isArray(group?.references) ? group.references : []) addMedia(entries, reference?.source || reference, 'character');
  }
  addMedia(entries, recipe.sampleImage, 'sample'); addMedia(entries, recipe.sourceImage, 'source'); addMedia(entries, recipe.keyframeImage, 'keyframe');
  addMedia(entries, recipe.motionVideoDataUrl, 'motion', 'video');
  return entries;
};
const notificationBody = (row) => {
  const raw = row.queue_payload && typeof row.queue_payload === 'object' ? row.queue_payload : {};
  const recipe = raw.__recipePayload && typeof raw.__recipePayload === 'object' ? raw.__recipePayload : raw;
  return {
    eventType: row.status,
    app: 'Audition AI',
    job: {
      id: row.id, providerJobId: row.job_id || null, provider: row.provider || raw.__targetProvider || null,
      userId: row.user_id, displayName: row.user_name || null, prompt: row.prompt || '',
      assetType: row.asset_type || 'image', toolId: row.tool_id || null, toolName: row.tool_name || null,
      engine: row.model_used || null, queueKind: row.queue_kind || null, costVcoin: Number(row.cost_vcoin || 0),
      createdAt: row.created_at || null, finishedAt: row.finished_at || null, errorMessage: row.error_message || null,
      resultUrl: isHttpUrl(row.image_url) ? row.image_url : null,
      config: { modelId: recipe.modelId || recipe.model || null, resolution: recipe.resolution || null, aspectRatio: recipe.aspectRatio || recipe.aspect_ratio || null },
    },
    media: { outputUrl: isHttpUrl(row.image_url) ? row.image_url : null, inputMedia: notificationMedia(raw) },
  };
};
const recordTelegramDelivery = async (env, row) => {
  const payload = row.queue_payload && typeof row.queue_payload === 'object' ? row.queue_payload : {};
  const response = await db(env, `generated_images?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ queue_payload: { ...payload, __telegramDelivery: { ...(payload.__telegramDelivery && typeof payload.__telegramDelivery === 'object' ? payload.__telegramDelivery : {}), [row.status]: { status: 'delivered', deliveredAt: new Date().toISOString(), reconciled: true } } }, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Telegram delivery state update failed (${response.status})`);
};
const reconcileTelegramNotifications = async (env) => {
  const webhookUrl = String(env.TELEGRAM_NOTIFY_WEBHOOK_URL || '').trim();
  const secret = String(env.TELEGRAM_NOTIFY_WEBHOOK_SECRET || '').trim();
  if (!webhookUrl || !secret) throw new Error('Telegram notification configuration is missing');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const response = await db(env, `generated_images?select=id,user_id,user_name,image_url,provider,job_id,prompt,asset_type,tool_id,tool_name,model_used,queue_kind,cost_vcoin,created_at,finished_at,error_message,status,queue_payload&status=in.(completed,failed)&finished_at=gte.${encodeURIComponent(since)}&order=finished_at.desc&limit=500`);
  if (!response.ok) throw new Error(`Telegram reconciliation scan failed (${response.status}): ${await response.text()}`);
  const rows = await response.json();
  const candidates = rows.filter((row) => !row.queue_payload?.__telegramBackfill20260916 && row.queue_payload?.__telegramDelivery?.[row.status]?.status !== 'delivered').slice(0, 20);
  let delivered = 0;
  for (const row of candidates) {
    const request = new Request(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-notify-secret': secret }, body: JSON.stringify(notificationBody(row)), signal: AbortSignal.timeout(20_000) });
    const notification = env.TELEGRAM_NOTIFIER
      ? await env.TELEGRAM_NOTIFIER.fetch(request)
      : await fetch(request);
    if (!notification.ok) throw new Error(`Telegram reconciliation failed (${notification.status}): ${await notification.text()}`);
    await recordTelegramDelivery(env, row);
    delivered += 1;
  }
  return { scanned: rows.length, pending: candidates.length, delivered };
};
const run = async (env) => {
  const result = {};
  for (const [name, body] of [
    ['repair_stale_generated_queue_jobs', { p_pre_dispatch_grace_seconds: 15, p_max_recoveries: 8, p_max_pre_dispatch_age_minutes: 30, p_overdue_poll_grace_seconds: 120 }],
    ['cleanup_expired_operational_history', { p_limit: 100, p_retention_days: 7 }],
  ]) {
    const response = await rpc(env, name, body);
    result[name] = response.ok ? await response.json() : { error: response.status, detail: await response.text() };
  }
  result.reconcile_failed_generation_refunds = await reconcileFailedRefunds(env);
  result.reconcile_telegram_notifications = await reconcileTelegramNotifications(env);
  return result;
};
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-operations-worker' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    if (!isAuthorizedWorkerRequest(request, env)) return json({ error: 'Unauthorized' }, 401);
    if (new URL(request.url).searchParams.get('wait') === '1') {
      try {
        return json(await run(env));
      } catch (error) {
        console.error('[operations-worker]', error);
        return json({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
    ctx.waitUntil(run(env).catch((error) => console.error('[operations-worker]', error)));
    return json({ accepted: true }, 202);
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(run(env)); },
};
