const UUID_RE = /^[0-9a-f-]{36}$/i;

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

export const envText = (env, key) => String(env[key] || '').trim();
export const payloadObject = (row) => row?.queue_payload && typeof row.queue_payload === 'object' ? row.queue_payload : {};
export const isJobId = (value) => UUID_RE.test(String(value || '').trim());
export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const isAuthorizedWorkerRequest = (request, env) => {
  const expected = envText(env, 'QUEUE_WORKER_SECRET');
  return Boolean(expected) && (
    request.headers.get('authorization') === `Bearer ${expected}`
    || request.headers.get('x-worker-secret') === expected
  );
};

export const supabase = (env, path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(init.headers || {}),
  },
});

export const rpc = (env, name, body) => fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
  method: 'POST',
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

export const updateJob = async (env, id, values) => {
  const response = await supabase(env, `generated_images?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Supabase update failed (${response.status}): ${await response.text()}`);
};

const claimJobViaConditionalUpdate = async (env, jobId, leaseSeconds) => {
  const response = await supabase(env, `generated_images?id=eq.${encodeURIComponent(jobId)}&status=eq.queued`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'processing',
      progress: 10,
      processing_started_at: new Date().toISOString(),
      lease_token: crypto.randomUUID(),
      lease_expires_at: new Date(Date.now() + Math.max(leaseSeconds, 60) * 1000).toISOString(),
      error_message: null,
    }),
  });
  if (!response.ok) throw new Error(`Fallback message claim failed (${response.status}): ${await response.text()}`);
  return (await response.json())?.[0] || null;
};

export const appendLog = (payload, stage, message, level = 'info') => ({
  ...payload,
  __stage: stage,
  __logs: [
    ...(Array.isArray(payload.__logs) ? payload.__logs : []),
    { at: new Date().toISOString(), stage, level, message },
  ].slice(-80),
});

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const addNotificationMedia = (entries, value, role, kind = 'image', userProvided = true) => {
  if (!isHttpUrl(value) || entries.some((entry) => entry.url === value.trim())) return;
  entries.push({ url: value.trim(), role, kind, userProvided });
};

const addNotificationMediaList = (entries, value, role, kind = 'image', userProvided = true) => {
  if (Array.isArray(value)) value.forEach((item) => addNotificationMediaList(entries, item, role, kind, userProvided));
  else addNotificationMedia(entries, value, role, kind, userProvided);
};

// Keep this metadata separate from the provider payload so Telegram can link
// every uploaded reference without trying to re-send those assets as media.
const notificationInputMedia = (payload) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const recipe = raw.__recipePayload && typeof raw.__recipePayload === 'object' ? raw.__recipePayload : raw;
  const entries = [];
  const explicit = Array.isArray(raw.__notifyInputMedia) ? raw.__notifyInputMedia : [];
  for (const entry of explicit) {
    if (entry && typeof entry === 'object') addNotificationMedia(entries, entry.url, entry.role || 'reference', entry.kind === 'video' ? 'video' : 'image', entry.userProvided !== false);
  }
  if (entries.length) return entries;

  addNotificationMedia(entries, recipe.sampleImage, 'sample');
  addNotificationMedia(entries, recipe.styleImage, 'style', 'image', false);
  addNotificationMedia(entries, recipe.sourceImage, 'source');
  addNotificationMedia(entries, recipe.keyframeImage, 'keyframe');
  addNotificationMedia(entries, recipe.characterImage, 'character');
  addNotificationMediaList(entries, recipe.characterImages, 'character');
  addNotificationMediaList(entries, recipe.referenceImages, 'reference');
  addNotificationMediaList(entries, recipe.__uploadSources, 'reference');
  for (const group of Array.isArray(recipe.characterReferenceGroups) ? recipe.characterReferenceGroups : []) {
    addNotificationMediaList(entries, group?.references?.map((reference) => reference?.source || reference), 'character');
  }
  addNotificationMedia(entries, recipe.motionVideoDataUrl, 'motion', 'video');
  return entries;
};

const notificationUserProfile = async (env, userId) => {
  if (!userId) return null;
  try {
    const response = await supabase(env, `users?id=eq.${encodeURIComponent(userId)}&select=display_name,email&limit=1`);
    if (!response.ok) return null;
    return (await response.json())?.[0] || null;
  } catch {
    return null;
  }
};

const recordTelegramDelivery = async (env, row, eventType) => {
  const response = await supabase(env, `generated_images?id=eq.${encodeURIComponent(row.id)}&select=queue_payload&limit=1`);
  if (!response.ok) throw new Error(`Telegram delivery state lookup failed (${response.status})`);
  const current = (await response.json())?.[0]?.queue_payload;
  const queuePayload = current && typeof current === 'object' ? current : {};
  await updateJob(env, row.id, {
    queue_payload: {
      ...queuePayload,
      __telegramDelivery: {
        ...(queuePayload.__telegramDelivery && typeof queuePayload.__telegramDelivery === 'object' ? queuePayload.__telegramDelivery : {}),
        [eventType]: { status: 'delivered', deliveredAt: new Date().toISOString() },
      },
    },
  });
};

// Queue rows may initially contain local base64 inputs. Once a Worker has
// claimed a job, retaining those blobs in every progress PATCH can make the
// Supabase REST update exceed its upstream timeout. Keep the operation's
// metadata, prompt, and remotely staged reference URLs only.
export const compactWorkerPayload = (value) => {
  const trim = (entry, depth = 0) => {
    if (depth > 8 || entry == null) return undefined;
    if (typeof entry === 'string') {
      if (entry.startsWith('data:')) return undefined;
      return entry.length > 8_000 && !isHttpUrl(entry) ? entry.slice(0, 8_000) : entry;
    }
    if (Array.isArray(entry)) return entry.map((item) => trim(item, depth + 1)).filter((item) => item !== undefined);
    if (typeof entry !== 'object') return entry;
    return Object.fromEntries(Object.entries(entry)
      .map(([key, item]) => [key, trim(item, depth + 1)])
      .filter(([, item]) => item !== undefined));
  };

  const payload = payloadObject(value);
  const compacted = trim(payload) || {};
  return { ...compacted, __workerPayloadCompacted: true };
};

export const notifyTelegramJob = async (env, eventType, row, overrides = {}) => {
  const webhookUrl = envText(env, 'TELEGRAM_NOTIFY_WEBHOOK_URL');
  const webhookSecret = envText(env, 'TELEGRAM_NOTIFY_WEBHOOK_SECRET');
  if (!webhookUrl || !webhookSecret) return;

  const queuePayload = compactWorkerPayload(row);
  const profile = await notificationUserProfile(env, row.user_id);
  const inputMedia = notificationInputMedia(queuePayload);
  const body = {
    eventType,
    app: 'Audition AI',
    job: {
      id: row.id,
      providerJobId: row.job_id || null,
      provider: row.provider || queuePayload.__targetProvider || null,
      userId: row.user_id,
      displayName: row.user_name || profile?.display_name || null,
      email: profile?.email || null,
      prompt: row.prompt || '',
      assetType: row.asset_type || 'image',
      toolId: row.tool_id || null,
      toolName: row.tool_name || null,
      engine: row.model_used || null,
      queueKind: row.queue_kind || null,
      costVcoin: Number(row.cost_vcoin || 0),
      status: eventType,
      createdAt: row.created_at || null,
      finishedAt: overrides.finishedAt || null,
      errorMessage: overrides.errorMessage || null,
      resultUrl: overrides.resultUrl || null,
      config: {
        modelId: queuePayload.modelId || queuePayload.model || null,
        resolution: queuePayload.resolution || null,
        aspectRatio: queuePayload.aspectRatio || queuePayload.aspect_ratio || null,
      },
    },
    media: {
      outputUrl: overrides.resultUrl || null,
      inputMedia,
      inputUrls: inputMedia.map((entry) => entry.url),
    },
  };

  const request = new Request(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-notify-secret': webhookSecret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const response = env.TELEGRAM_NOTIFIER
    ? await env.TELEGRAM_NOTIFIER.fetch(request)
    : await fetch(request);
  if (!response.ok) throw new Error(`Telegram notification failed (${response.status})`);
  await recordTelegramDelivery(env, row, eventType);
};

export const claimJob = async (env, jobId, action) => {
  const poll = action === 'poll';
  const response = await rpc(env, poll ? 'claim_cloudflare_tst_poll_job_by_id' : 'claim_cloudflare_generated_job_by_id', {
    p_job_id: jobId,
    p_lease_seconds: poll ? 120 : 900,
  });
  if (!response.ok) {
    const detail = await response.text();
    // Keep queue processing available while a deployed claim RPC is repaired.
    // The status filter makes this fallback idempotent under at-least-once delivery.
    if (!poll && response.status === 400 && /column reference "id" is ambiguous|42702/i.test(detail)) {
      console.error(JSON.stringify({ worker: 'queue', event: 'claim_rpc_ambiguous_id_fallback', jobId }));
      return claimJobViaConditionalUpdate(env, jobId, 900);
    }
    throw new Error(`Message claim failed (${response.status}): ${detail}`);
  }
  const rows = await response.json();
  return rows?.[0] || null;
};

export const jobState = async (env, id) => {
  const response = await supabase(env, `generated_images?id=eq.${encodeURIComponent(id)}&select=status,job_id,provider,next_poll_at,queue_kind,queue_payload,attempt_count`);
  if (!response.ok) throw new Error(`Job lookup failed (${response.status})`);
  return (await response.json())?.[0] || null;
};

export const mimeTypeToExtension = (mimeType, kind) => {
  const normalized = String(mimeType || '').split(';', 1)[0].trim().toLowerCase();
  const known = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v',
  };
  return known[normalized] || normalized.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg');
};

export const persistResultToR2 = async (env, row, resultUrl, suffix = '') => {
  const publicBase = envText(env, 'R2_PUBLIC_URL').replace(/\/+$/, '');
  if (!env.RESULTS_BUCKET || !publicBase) return resultUrl;
  const response = await fetch(resultUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body) throw new Error(`Provider result download failed (${response.status})`);
  const kind = row.asset_type === 'video' ? 'video' : 'image';
  const contentType = String(response.headers.get('content-type') || (kind === 'video' ? 'video/mp4' : 'image/png')).split(';', 1)[0].trim();
  const extension = mimeTypeToExtension(contentType, kind);
  const key = `users/${encodeURIComponent(row.user_id)}/generated/${encodeURIComponent(row.id)}${suffix}.${extension}`;
  await env.RESULTS_BUCKET.put(key, response.body, { httpMetadata: { contentType } });
  return `${publicBase}/${key}`;
};

export const enqueueDelayed = (queue, body, delaySeconds = 0) => queue.send(body, { delaySeconds });
