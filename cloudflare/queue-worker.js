const SYSTEM_KINDS = ['image_generate', 'video_generate', 'motion_generate'];
const GPTI2_MODELS = new Set(['gpt-image-2', 'image-gpt-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'nano-banana-2', 'nano-banana-pro']);
const TST_API_BASE = 'https://api.tramsangtao.com/v1';
const TST_UPLOAD_STATUS_POLL_INTERVAL_MS = 2000;
const TST_UPLOAD_STATUS_TIMEOUT_MS = 240000;
const TST_SOURCE_FETCH_TIMEOUT_MS = 120000;
const TST_VIDEO_SOURCE_FETCH_TIMEOUT_MS = 180000;
const TST_MAX_REFERENCE_IMAGES = 8;
const TST_CATALOG_TTL_MS = 5 * 60 * 1000;
let tstCatalogCache = null;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const envText = (env, key) => String(env[key] || '').trim();
const isAuthorizedWorkerRequest = (request, env) => {
  const expected = envText(env, 'QUEUE_WORKER_SECRET');
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`
    || request.headers.get('x-worker-secret') === expected;
};
const payloadObject = (row) => row?.queue_payload && typeof row.queue_payload === 'object' ? row.queue_payload : {};
const modelOf = (row) => String(payloadObject(row).model || payloadObject(row).modelId || row?.model_used || '').trim().toLowerCase();
const providerOf = (row) => String(row?.provider || payloadObject(row).__targetProvider || '').trim().toLowerCase() || (GPTI2_MODELS.has(modelOf(row)) ? 'gpti2' : 'tst');
const GPTI2_SIZES = {
  '1K': { '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280', '4:3': '1024x768', '3:4': '768x1024', '3:2': '1536x1024', '2:3': '1024x1536', '21:9': '1280x544' },
  '2K': { '1:1': '1536x1536', '16:9': '2560x1440', '9:16': '1440x2560', '4:3': '2048x1536', '3:4': '1536x2048', '3:2': '2400x1600', '2:3': '1600x2400', '21:9': '2560x1088' },
  '4K': { '1:1': '2048x2048', '16:9': '3840x2160', '9:16': '2160x3840', '4:3': '3200x2400', '3:4': '2400x3200', '3:2': '3360x2240', '2:3': '2240x3360', '21:9': '3840x1632' },
};
const gpti2SizeOf = (payload) => {
  const resolution = String(payload.resolution || payload.size || '1K').trim().toUpperCase();
  const ratio = String(payload.aspect_ratio || payload.aspectRatio || '1:1').trim();
  return GPTI2_SIZES[resolution]?.[ratio] || GPTI2_SIZES['1K']['1:1'];
};
const referenceUrlsOf = (row) => {
  const payload = payloadObject(row);
  const recipe = payload.__recipePayload && typeof payload.__recipePayload === 'object' ? payload.__recipePayload : payload;
  const urls = [];
  const add = (value) => { if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) urls.push(value.trim()); };
  const addMany = (value) => { if (Array.isArray(value)) value.forEach(addMany); else if (value && typeof value === 'object') Object.values(value).forEach(addMany); else add(value); };
  addMany(payload.img_url); addMany(payload.image_urls); addMany(payload.image_url);
  addMany(recipe.referenceImages); addMany(recipe.characterImages); addMany(recipe.sampleImage); addMany(recipe.styleImage);
  addMany(recipe.characterReferenceGroups);
  return [...new Set(urls)];
};
const supabase = (env, path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', ...(init.headers || {}) } });
const rpc = (env, name, body) => fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const updateJob = async (env, id, values) => {
  const response = await supabase(env, `generated_images?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error(`Supabase update failed (${response.status}): ${await response.text()}`);
};

const appendLog = (payload, stage, message, level = 'info') => ({
  ...payload,
  __stage: stage,
  __logs: [
    ...(Array.isArray(payload.__logs) ? payload.__logs : []),
    { at: new Date().toISOString(), stage, level, message },
  ].slice(-80),
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isHttpUrl = (value) => /^https:\/\//i.test(String(value || '').trim());
const cleanBase64 = (value) => String(value || '').replace(/^data:[^;]+;base64,/, '');
const mimeTypeToExtension = (mimeType, kind) => {
  const normalized = String(mimeType || '').split(';', 1)[0].trim().toLowerCase();
  const known = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
  };
  return known[normalized] || normalized.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg');
};

const parseResponsePayload = async (response) => {
  const raw = await response.text().catch(() => '');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { raw }; }
};

const providerError = (data, fallback) => {
  const value = data?.error || data?.message || data?.detail || data?.raw;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
};

const fetchTstCatalog = async (env) => {
  if (tstCatalogCache && Date.now() - tstCatalogCache.fetchedAt < TST_CATALOG_TTL_MS) return tstCatalogCache;
  const headers = { Authorization: `Bearer ${envText(env, 'TST_API_KEY')}` };
  const [modelsResponse, pricingResponse] = await Promise.all([
    fetch(`${TST_API_BASE}/models`, { headers, signal: AbortSignal.timeout(30000) }),
    fetch(`${TST_API_BASE}/models/pricing`, { headers, signal: AbortSignal.timeout(30000) }),
  ]);
  const modelsPayload = await parseResponsePayload(modelsResponse);
  const pricingPayload = await parseResponsePayload(pricingResponse);
  if (!modelsResponse.ok) throw new Error(`TST catalog models failed (${modelsResponse.status})`);
  if (!pricingResponse.ok) throw new Error(`TST catalog pricing failed (${pricingResponse.status})`);
  tstCatalogCache = {
    fetchedAt: Date.now(),
    models: Array.isArray(modelsPayload?.models) ? modelsPayload.models : [],
    pricing: Array.isArray(pricingPayload?.pricing) ? pricingPayload.pricing : [],
  };
  return tstCatalogCache;
};

const normalizeConfigKey = (value) => String(value || '').trim().toLowerCase();
const validateTstPayloadAgainstLiveCatalog = async (env, row, payload) => {
  const catalog = await fetchTstCatalog(env);
  const modelId = String(payload.model || '').trim().toLowerCase();
  const model = catalog.models.find((entry) => String(entry?.model || entry?.id || '').trim().toLowerCase() === modelId);
  if (!model) throw new Error(`INVALID_TST_CONFIG: Model ${modelId || '(missing)'} is not available on TST`);
  const expectedType = row.queue_kind === 'image_generate' ? 'image' : row.queue_kind === 'video_generate' ? 'video' : row.queue_kind === 'motion_generate' ? 'motion-control' : '';
  const actualType = String(model.type || '').trim().toLowerCase();
  if (expectedType && actualType && actualType !== expectedType) throw new Error(`INVALID_TST_CONFIG: Model ${modelId} is not available for ${row.queue_kind}`);
  const modelPricing = catalog.pricing.filter((entry) => String(entry?.model || entry?.model_id || '').trim().toLowerCase() === modelId);
  if (modelPricing.length === 0) throw new Error(`INVALID_TST_CONFIG: Model ${modelId} has no live pricing on TST`);
  const configKey = normalizeConfigKey(payload.config_key || payload.pricingOptionId);
  if (configKey) {
    const match = modelPricing.some((entry) => normalizeConfigKey(entry?.key || entry?.config_key) === configKey);
    if (!match) throw new Error(`INVALID_TST_CONFIG: Selected configuration ${configKey} is no longer available for ${modelId}`);
  }
};

const extractUploadedMediaUrl = (data) => {
  const visit = (value) => {
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
    if (Array.isArray(value)) return value.map(visit).find(Boolean) || '';
    if (!value || typeof value !== 'object') return '';
    for (const key of ['url', 'file_url', 'fileUrl', 'download_url', 'downloadUrl', 'result', 'data']) {
      const found = visit(value[key]);
      if (found) return found;
    }
    return '';
  };
  return visit(data);
};

const normalizeSourceToBlob = async (input, kind) => {
  const source = String(input || '').trim();
  const fallbackMime = kind === 'video' ? 'video/mp4' : 'image/jpeg';
  if (!source) throw new Error(`TST ${kind} reference is empty`);
  if (isHttpUrl(source)) {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(kind === 'video' ? TST_VIDEO_SOURCE_FETCH_TIMEOUT_MS : TST_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`TST ${kind} reference fetch failed (${response.status})`);
    const blob = await response.blob();
    const mimeType = blob.type || fallbackMime;
    return { blob, mimeType, filename: `${kind}.${mimeTypeToExtension(mimeType, kind)}` };
  }

  let mimeType = fallbackMime;
  let encoded = source;
  if (source.startsWith('data:')) {
    const [header, body = ''] = source.split(',', 2);
    encoded = body;
    mimeType = header.match(/^data:(.*?);base64$/i)?.[1] || fallbackMime;
  }

  let binary;
  try {
    binary = atob(cleanBase64(encoded));
  } catch {
    throw new Error(`TST ${kind} reference is not valid base64`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { blob: new Blob([bytes], { type: mimeType }), mimeType, filename: `${kind}.${mimeTypeToExtension(mimeType, kind)}` };
};

const uploadMediaFromUrlToTst = async (env, sourceUrl, kind) => {
  const response = await fetch(`${TST_API_BASE}/files/upload-url`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${envText(env, 'TST_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: sourceUrl, type: kind }),
    signal: AbortSignal.timeout(30000),
  });
  const initial = await parseResponsePayload(response);
  if (!response.ok) throw new Error(providerError(initial, `TST ${kind} upload-from-URL failed (${response.status})`));
  const immediateUrl = extractUploadedMediaUrl(initial);
  if (immediateUrl) return immediateUrl;
  const uploadId = String(initial?.upload_id || initial?.uploadId || initial?.id || '').trim();
  if (!uploadId) throw new Error('TST upload-from-URL response did not include upload_id');

  const deadline = Date.now() + TST_UPLOAD_STATUS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(TST_UPLOAD_STATUS_POLL_INTERVAL_MS);
    const statusResponse = await fetch(`${TST_API_BASE}/files/upload/${encodeURIComponent(uploadId)}/status`, {
      headers: { Authorization: `Bearer ${envText(env, 'TST_API_KEY')}` },
      signal: AbortSignal.timeout(30000),
    });
    const statusPayload = await parseResponsePayload(statusResponse);
    if (!statusResponse.ok) throw new Error(providerError(statusPayload, `TST ${kind} upload status failed (${statusResponse.status})`));
    const status = String(statusPayload?.status || '').trim().toLowerCase();
    const uploadedUrl = extractUploadedMediaUrl(statusPayload);
    if (uploadedUrl && ['ready', 'completed', 'success', 'succeeded'].includes(status)) return uploadedUrl;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) throw new Error(providerError(statusPayload, `TST ${kind} upload failed`));
  }
  throw new Error(`TST ${kind} upload timed out after ${TST_UPLOAD_STATUS_TIMEOUT_MS / 1000}s`);
};

const uploadMediaToTst = async (env, input, kind) => {
  const source = String(input || '').trim();
  if (!envText(env, 'TST_API_KEY')) throw new Error('Missing TST_API_KEY environment variable');
  if (isHttpUrl(source)) {
    try {
      return await uploadMediaFromUrlToTst(env, source, kind);
    } catch (error) {
      console.warn(`[queue-worker] TST ${kind} upload-from-URL failed; falling back to multipart upload.`, error);
    }
  }

  const { blob, filename } = await normalizeSourceToBlob(source, kind);
  const form = new FormData();
  form.append('file', blob, filename);
  const response = await fetch(`${TST_API_BASE}/files/upload/${kind}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${envText(env, 'TST_API_KEY')}` },
    body: form,
    signal: AbortSignal.timeout(kind === 'video' ? 240000 : 180000),
  });
  const data = await parseResponsePayload(response);
  if (!response.ok) throw new Error(providerError(data, `TST ${kind} multipart upload failed (${response.status})`));
  const url = extractUploadedMediaUrl(data);
  if (!url) throw new Error(`TST ${kind} upload response did not include a URL`);
  return url;
};

const assertUploadedMediaReady = async (url, kind) => {
  const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok && response.status !== 206) throw new Error(`TST ${kind} upload URL is not readable (${response.status})`);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.startsWith(`${kind}/`)) throw new Error(`TST ${kind} upload returned MIME type ${contentType}`);
};

const imageExtension = (contentType) => {
  const mime = String(contentType || '').toLowerCase();
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
};

const persistGpti2Result = async (env, row, result) => {
  const keyBase = `users/${encodeURIComponent(row.user_id)}/generated/${encodeURIComponent(row.id)}`;
  let body;
  let contentType = 'image/png';
  if (result.startsWith('data:image/')) {
    const match = result.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error('GPTI2_ERROR: invalid inline image result');
    contentType = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    body = bytes;
  } else {
    const response = await fetch(result, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`GPTI2_ERROR: result download failed (${response.status})`);
    contentType = response.headers.get('content-type') || contentType;
    body = await response.arrayBuffer();
  }
  const key = `${keyBase}.${imageExtension(contentType)}`;
  await env.RESULTS_BUCKET.put(key, body, { httpMetadata: { contentType } });
  const publicBase = envText(env, 'R2_PUBLIC_URL').replace(/\/+$/, '');
  if (!publicBase) throw new Error('R2_PUBLIC_URL is required to publish GPTi2 output');
  return `${publicBase}/${key}`;
};

const rescueAbandonedGpti2Dispatches = async (env) => {
  const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const response = await supabase(env, `generated_images?status=eq.processing&job_id=is.null&updated_at=lt.${encodeURIComponent(cutoff)}&select=id,queue_payload`);
  if (!response.ok) throw new Error(`Supabase rescue scan failed (${response.status}): ${await response.text()}`);
  const rows = (await response.json()).filter((row) => payloadObject(row).__targetProvider === 'gpti2' && payloadObject(row).__stage === 'dispatching' && payloadObject(row).__dispatchConfirmationPending === true);
  for (const row of rows) {
    await updateJob(env, row.id, {
      status: 'queued', progress: 5, error_message: null, processing_started_at: null,
      lease_token: null, lease_expires_at: null, next_poll_at: new Date().toISOString(),
      queue_payload: { ...payloadObject(row), __stage: 'queued', __dispatchConfirmationPending: false, __tstTouched: false, __cloudflareRescuedAt: new Date().toISOString() },
    });
  }
  return rows.length;
};

const gpti2 = async (env, row, report) => {
  const payload = payloadObject(row);
  const model = modelOf(row);
  if (!GPTI2_MODELS.has(model)) throw new Error(`GPTI2_MODEL_UNSUPPORTED: ${model}`);
  const prompt = String(payload.prompt || row.prompt || '').trim();
  if (!prompt) throw new Error('GPTI2_ERROR: prompt is required');
  const refs = referenceUrlsOf(row);
  const size = gpti2SizeOf(payload);
  let response;
  if (refs.length && !model.startsWith('nano-banana')) {
    await report('building_payload', `Da dung payload GPTi2: ${model}, ${size}, ${refs.length} anh tham chieu.`);
    const form = new FormData(); form.set('prompt', prompt); form.set('model', model); form.set('size', size); form.set('quality', String(payload.quality || 'low'));
    for (const [i, url] of refs.entries()) {
      await report('uploading_refs', `Dang tai va chuan bi anh tham chieu ${i + 1}/${refs.length}.`);
      const source = await fetch(String(url), { signal: AbortSignal.timeout(30000) });
      if (!source.ok) throw new Error(`GPTI2 reference ${i + 1} unavailable`);
      form.append('image[]', await source.blob(), `reference-${i + 1}.jpg`);
      await report('uploading_refs', `Da dua anh tham chieu ${i + 1}/${refs.length} vao payload GPTi2.`, 'success');
    }
    await report('dispatching', `Dang gui GPTi2 edit request voi ${refs.length} anh tham chieu.`);
    response = await fetch('https://gpti2.store/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${env.GPTI2_API_KEY}` }, body: form, signal: AbortSignal.timeout(295000) });
  } else {
    await report('building_payload', `Da dung payload GPTi2: ${model}, ${size}, khong co anh tham chieu.`);
    await report('dispatching', 'Dang gui GPTi2 generation request.');
    response = await fetch('https://gpti2.store/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${env.GPTI2_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, size, quality: String(payload.quality || 'low'), n: 1 }), signal: AbortSignal.timeout(295000) });
  }
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 429 || /suspicious activity|code.?\"?:.?\"?blocked/i.test(detail)) throw new Error(`GPTI2_ERROR: provider blocked this request; no retry attempted: ${detail}`);
    throw new Error(`GPTI2_ERROR: ${detail}`);
  }
  const data = await response.json();
  const raw = data?.data?.[0]?.b64_json || data?.data?.[0]?.url || data?.url;
  if (!raw) throw new Error('GPTI2_ERROR: provider returned no image');
  await report('verifying_output', 'GPTi2 da tra ket qua. Dang kiem tra va luu anh.');
  return String(raw).startsWith('http') ? String(raw) : `data:image/png;base64,${raw}`;
};

const recipePayloadOf = (row) => {
  const payload = payloadObject(row);
  return payload.__recipePayload && typeof payload.__recipePayload === 'object'
    ? payload.__recipePayload
    : payload;
};

const uniqueSources = (values) => [...new Set(values
  .flatMap((value) => Array.isArray(value) ? value : [value])
  .map((value) => String(value || '').trim())
  .filter(Boolean))];

const collectCharacterReferenceSources = (recipe) => {
  const groups = Array.isArray(recipe?.characterReferenceGroups) ? recipe.characterReferenceGroups : [];
  const grouped = groups.flatMap((group) => {
    const references = Array.isArray(group?.references) ? group.references : [];
    return references.map((reference) => reference && typeof reference === 'object' ? reference.source : reference);
  });
  return uniqueSources([
    grouped,
    Array.isArray(recipe?.characterImages) ? recipe.characterImages : [],
  ]);
};

const collectTstReferenceSources = (row) => {
  const payload = payloadObject(row);
  const recipe = recipePayloadOf(row);
  const recipeType = String(recipe?.recipeType || '').trim();
  if (recipeType === 'image_generate_recipe_v1') {
    const explicit = Array.isArray(payload.__uploadSources) && payload.__uploadSources.length > 0
      ? payload.__uploadSources
      : uniqueSources([
          recipe.sampleImage,
          collectCharacterReferenceSources(recipe),
          recipe.styleImage,
          recipe.referenceImages,
        ]);
    return explicit.slice(0, TST_MAX_REFERENCE_IMAGES);
  }
  if (recipeType === 'prompt_image_generate_recipe_v1') {
    const limit = String(recipe.promptMode || '').toLowerCase() === 'user_only' || GPTI2_MODELS.has(String(recipe.modelId || '').toLowerCase()) ? 5 : 4;
    return uniqueSources([recipe.referenceImages]).slice(0, limit);
  }
  if (recipeType === 'image_edit_recipe_v1') return uniqueSources([recipe.sourceImage]).slice(0, 1);
  if (recipeType === 'video_generate_recipe_v1') return uniqueSources([recipe.keyframeImage, recipe.endFrameImage]).slice(0, 2);
  if (recipeType === 'motion_generate_recipe_v1') return uniqueSources([recipe.characterImage, recipe.motionVideoDataUrl]).slice(0, 2);
  return [];
};

const copyIfPresent = (target, key, value) => {
  if (value !== undefined && value !== null && String(value).trim() !== '') target[key] = value;
};

const buildTstProviderPayload = (row, uploadedUrls) => {
  const recipe = recipePayloadOf(row);
  const recipeType = String(recipe?.recipeType || '').trim();
  const model = String(recipe?.modelId || modelOf(row) || '').trim();
  const prompt = String(recipe?.prompt || row.prompt || '').trim();
  const payload = { prompt, model };

  if (recipeType === 'image_generate_recipe_v1' || recipeType === 'prompt_image_generate_recipe_v1') {
    if (uploadedUrls.length > 0) payload.img_url = uploadedUrls;
    copyIfPresent(payload, 'resolution', String(recipe.resolution || '').toLowerCase());
    copyIfPresent(payload, 'aspect_ratio', recipe.aspectRatio);
    copyIfPresent(payload, 'quality', recipe.quality);
    copyIfPresent(payload, 'speed', recipe.speed);
    copyIfPresent(payload, 'server_id', recipe.serverId);
    copyIfPresent(payload, 'provider_mode', recipe.providerMode);
    copyIfPresent(payload, 'config_key', recipe.pricingOptionId);
    return payload;
  }

  if (recipeType === 'image_edit_recipe_v1') {
    if (!uploadedUrls[0]) throw new Error('TST image edit source is missing');
    payload.img_url = [uploadedUrls[0]];
    copyIfPresent(payload, 'resolution', String(recipe.resolution || '').toLowerCase());
    copyIfPresent(payload, 'aspect_ratio', recipe.aspectRatio);
    copyIfPresent(payload, 'speed', recipe.speed);
    copyIfPresent(payload, 'server_id', recipe.serverId);
    copyIfPresent(payload, 'provider_mode', recipe.providerMode);
    copyIfPresent(payload, 'config_key', recipe.pricingOptionId);
    return payload;
  }

  if (recipeType === 'video_generate_recipe_v1') {
    payload.prompt = prompt || 'Create a cinematic video';
    payload.duration = recipe.duration;
    copyIfPresent(payload, 'resolution', String(recipe.resolution || '').toLowerCase());
    copyIfPresent(payload, 'aspect_ratio', recipe.aspectRatio);
    copyIfPresent(payload, 'speed', recipe.speed);
    copyIfPresent(payload, 'server_id', recipe.serverId);
    copyIfPresent(payload, 'provider_mode', recipe.providerMode);
    copyIfPresent(payload, 'config_key', recipe.pricingOptionId);
    if (typeof recipe.audio === 'boolean') payload.audio = recipe.audio;
    if (uploadedUrls[0]) {
      payload.img_url = uploadedUrls[0];
      payload.image_url = uploadedUrls[0];
      if (uploadedUrls[1]) payload.image_urls = [uploadedUrls[0], uploadedUrls[1]];
      if (model === 'kling-2.5-turbo') payload.mode = 'i2v';
    }
    if (model.toLowerCase().startsWith('seedance')) payload.path = '/seedance/generate';
    return payload;
  }

  if (recipeType === 'motion_generate_recipe_v1') {
    if (!uploadedUrls[0] || !uploadedUrls[1]) throw new Error('TST motion references are incomplete');
    if (prompt) payload.prompt = prompt;
    payload.mode = String(recipe.resolution || '').trim().toLowerCase() === '1080p' ? 'pro' : 'std';
    payload.background_source = recipe.backgroundSource || 'input_image';
    payload.count = 1;
    payload.character_image_url = uploadedUrls[0];
    payload.motion_video_url = uploadedUrls[1];
    copyIfPresent(payload, 'server_id', recipe.serverId);
    copyIfPresent(payload, 'config_key', recipe.pricingOptionId);
    if (typeof recipe.motionVideoDurationSeconds === 'number' && Number.isFinite(recipe.motionVideoDurationSeconds)) {
      payload.duration = recipe.motionVideoDurationSeconds;
    }
    return payload;
  }

  return { ...payloadObject(row), prompt: prompt || undefined, model: model || undefined };
};

const prepareTstPayload = async (env, row, report) => {
  const originalPayload = payloadObject(row);
  const sources = collectTstReferenceSources(row);
  const previousSources = Array.isArray(originalPayload.__uploadSources) ? originalPayload.__uploadSources.map((value) => String(value || '').trim()) : [];
  const previousUploads = Array.isArray(originalPayload.__uploadedUrls) ? originalPayload.__uploadedUrls.map((value) => String(value || '').trim()) : [];
  const canReusePreviousUploads = sources.length > 0 && sources.length === previousSources.length && sources.every((source, index) => source === previousSources[index]) && previousUploads.length === sources.length;
  const uploadedUrls = canReusePreviousUploads ? previousUploads : [];

  if (sources.length > 0 && !canReusePreviousUploads) {
    await report('uploading_refs', `Dang chuan bi ${sources.length} media tham chieu cho TST.`);
    for (let index = 0; index < sources.length; index += 1) {
      const kind = String(recipePayloadOf(row)?.recipeType || '').includes('motion') && index === 1 ? 'video' : 'image';
      const uploaded = await uploadMediaToTst(env, sources[index], kind);
      await assertUploadedMediaReady(uploaded, kind);
      uploadedUrls.push(uploaded);
      await report('uploading_refs', `Da dua ${kind} tham chieu ${index + 1}/${sources.length} vao TST.`, 'success');
    }
  }

  const providerPayload = buildTstProviderPayload(row, uploadedUrls);
  await validateTstPayloadAgainstLiveCatalog(env, row, providerPayload);
  const nextPayload = {
    ...activePayload,
    __uploadSources: sources,
    __uploadedUrls: uploadedUrls,
    __tstPreparedAt: new Date().toISOString(),
    __tstProviderPayload: providerPayload,
    __stage: 'building_payload',
  };
  await report('building_payload', 'Da dung payload TST voi media tham chieu da san sang.', 'success');
  return { providerPayload, queuePayload: nextPayload };
};

const tst = async (env, row, providerPayload, report) => {
  const path = providerPayload.path || (row.queue_kind === 'video_generate' && String(providerPayload.model || '').toLowerCase().startsWith('seedance') ? '/seedance/generate' : row.queue_kind === 'video_generate' ? '/video/generate' : row.queue_kind === 'motion_generate' ? '/motion/generate' : '/image/generate');
  const { path: _ignoredPath, ...body } = providerPayload;
  await report('dispatching', `Dang gui payload ${String(body.model || modelOf(row))} toi TST.`);
  const response = await fetch(`${TST_API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${envText(env, 'TST_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const data = await parseResponsePayload(response);
  if (!response.ok) throw new Error(`TST_ERROR: ${providerError(data, `TST request failed (${response.status})`)}`);
  const id = data?.job_id || data?.jobId || data?.id;
  if (!id) throw new Error('TST_ERROR: provider returned no job id');
  return { id: String(id) };
};

const providerResultOf = (data, assetType) => {
  const keys = assetType === 'video' ? ['video_url', 'videoUrl'] : ['image_url', 'imageUrl'];
  const visit = (value) => {
    if (typeof value === 'string' && isResultUrlCompatible(value, assetType)) return value.trim();
    if (Array.isArray(value)) return value.map(visit).find(Boolean) || '';
    if (!value || typeof value !== 'object') return '';
    for (const key of [...keys, 'result', 'output', 'url', 'data', 'results', 'outputs', 'files']) { const found = visit(value[key]); if (found) return found; }
    return '';
  };
  return visit(data);
};

const isResultUrlCompatible = (value, assetType) => {
  const normalized = String(value || '').trim();
  if (!/^https?:\/\//i.test(normalized)) return false;
  try {
    const pathname = new URL(normalized).pathname.toLowerCase();
    const extension = pathname.match(/\.([a-z0-9]+)$/)?.[1] || '';
    if (!extension) return true;
    const imageExtensions = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'tif', 'tiff', 'webp']);
    const videoExtensions = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'ogv', 'webm']);
    return assetType === 'video' ? videoExtensions.has(extension) : !videoExtensions.has(extension) || imageExtensions.has(extension);
  } catch {
    return false;
  }
};

const persistProviderResult = async (env, row, resultUrl) => {
  const bucket = env.RESULTS_BUCKET;
  const publicBase = envText(env, 'R2_PUBLIC_URL').replace(/\/+$/, '');
  if (!bucket || !publicBase) return resultUrl;
  const response = await fetch(resultUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`TST result download failed (${response.status})`);
  const contentType = String(response.headers.get('content-type') || (row.asset_type === 'video' ? 'video/mp4' : 'image/png')).split(';', 1)[0].trim();
  const body = await response.arrayBuffer();
  if (!body.byteLength) throw new Error('TST result download was empty');
  const extension = mimeTypeToExtension(contentType, row.asset_type === 'video' ? 'video' : 'image');
  const key = `users/${encodeURIComponent(row.user_id)}/generated/${encodeURIComponent(row.id)}-tst.${extension}`;
  await bucket.put(key, body, { httpMetadata: { contentType } });
  return `${publicBase}/${key}`;
};

const failAndRefund = async (env, row, message) => {
  const failedAt = new Date().toISOString();
  await updateJob(env, row.id, {
    status: 'failed',
    progress: 0,
    error_message: message,
    finished_at: failedAt,
    next_poll_at: null,
    lease_token: null,
    lease_expires_at: null,
    queue_payload: appendLog(payloadObject(row), 'failed', message, 'error'),
  });
  const refund = await rpc(env, 'refund_generated_job', {
    p_generated_image_id: row.id,
    p_reason: `Refund: TST queue job failed (${String(row.tool_name || row.queue_kind || 'generation').slice(0, 120)})`,
  });
  if (!refund.ok) console.error('[queue-worker] refund failed', row.id, refund.status, await refund.text().catch(() => ''));
};

const pollTst = async (env, row) => {
  const response = await fetch(`https://api.tramsangtao.com/v1/jobs/${encodeURIComponent(row.job_id)}`, { headers: { Authorization: `Bearer ${env.TST_API_KEY}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`TST poll failed (${response.status}): ${await response.text()}`);
  return response.json();
};

const pollDueRows = async (env) => {
  const response = await rpc(env, 'claim_cloudflare_pollable_tst_jobs', { p_limit: Number(env.CLOUDFLARE_QUEUE_BATCH || 8), p_lease_seconds: 120 });
  if (!response.ok) throw new Error(`Supabase poll claim failed (${response.status}): ${await response.text()}`);
  const rows = await response.json();
  for (const row of rows) {
    try {
      const data = await pollTst(env, row);
      const status = String(data?.status || '').toLowerCase();
      const result = providerResultOf(data, row.asset_type || 'image');
      if (result && ['completed', 'success', 'succeeded', 'done'].includes(status)) {
        const storedUrl = await persistProviderResult(env, row, result);
        await updateJob(env, row.id, { status: 'completed', progress: 100, image_url: storedUrl, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: appendLog(payloadObject(row), 'completed', 'Cloudflare Worker da luu ket qua TST.', 'success') });
      } else if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        await failAndRefund(env, row, String(data?.error || data?.message || 'TST job failed'));
      } else {
        await updateJob(env, row.id, { status: 'processing', progress: Math.max(60, Number(data?.progress || 0)), next_poll_at: new Date(Date.now() + 15000).toISOString(), lease_token: null, lease_expires_at: null, queue_payload: appendLog(payloadObject(row), 'polling', 'Cloudflare Worker dang poll TST.') });
      }
    } catch (error) {
      await updateJob(env, row.id, { status: 'processing', next_poll_at: new Date(Date.now() + 30000).toISOString(), lease_token: null, lease_expires_at: null, error_message: error instanceof Error ? error.message : String(error), queue_payload: appendLog(payloadObject(row), 'polling', 'Cloudflare Worker poll TST gap loi, se thu lai.', 'warning') });
    }
  }
  return rows.length;
};

const processRow = async (env, row) => {
  let activePayload = { ...payloadObject(row), __cloudflareWorker: true };
  const report = async (stage, message, level = 'info') => {
    activePayload = appendLog(activePayload, stage, message, level);
    await updateJob(env, row.id, { status: 'processing', progress: stage === 'uploading_refs' ? 35 : stage === 'building_payload' ? 45 : stage === 'verifying_output' ? 85 : 50, error_message: null, queue_payload: activePayload });
  };
  await report('preparing', 'Cloudflare Worker da nhan job. Bat dau kiem tra payload GPTi2.');
  if (providerOf(row) === 'gpti2') {
    const result = await gpti2(env, row, report);
    await report('verifying_output', 'Dang luu ket qua GPTi2 vao R2.');
    const imageUrl = await persistGpti2Result(env, row, result);
    activePayload = appendLog(activePayload, 'completed', 'Cloudflare Worker da luu ket qua GPTi2 vao R2.', 'success');
    await updateJob(env, row.id, { status: 'completed', progress: 100, image_url: imageUrl, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: activePayload });
    return { completed: 1 };
  }
  const prepared = await prepareTstPayload(env, row, report);
  activePayload = prepared.queuePayload;
  const submission = await tst(env, row, prepared.providerPayload, report);
  const submittedPayload = appendLog({ ...activePayload, __cloudflareWorker: true }, 'submitted', 'TST da nhan job. Dang cho ket qua.', 'success');
  await updateJob(env, row.id, { status: 'processing', progress: 60, provider: 'tst', job_id: submission.id, next_poll_at: new Date(Date.now() + 15000).toISOString(), lease_token: null, lease_expires_at: null, queue_payload: submittedPayload });
  return { submitted: 1 };
};

const run = async (env) => {
  const rescued = await rescueAbandonedGpti2Dispatches(env);
  const polled = await pollDueRows(env);
  const claim = await rpc(env, 'claim_cloudflare_generated_jobs', { p_limit: Number(env.CLOUDFLARE_QUEUE_BATCH || 8), p_lease_seconds: 900 });
  if (!claim.ok) throw new Error(`Supabase claim failed (${claim.status}): ${await claim.text()}`);
  const rows = await claim.json(); const summary = { rescued, polled, claimed: rows.length, completed: 0, submitted: 0, failed: 0 };
  for (const row of rows) {
    try {
      Object.assign(summary, Object.fromEntries(Object.entries(await processRow(env, row)).map(([k, v]) => [k, Number(summary[k] || 0) + v])));
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      try { await failAndRefund(env, row, message); } catch (refundError) { console.error('[queue-worker] failed to fail/refund row', row.id, refundError); }
    }
  }
  return summary;
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-queue-worker' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    if (!isAuthorizedWorkerRequest(request, env)) return json({ error: 'Unauthorized' }, 401);
    ctx.waitUntil(run(env).catch((error) => console.error('[queue-worker]', error)));
    return json({ accepted: true }, 202);
  },
  async queue(batch, env) {
    try {
      await run(env);
      batch.ackAll();
    } catch (error) {
      console.error('[queue-worker] Queue delivery failed:', error);
      batch.retryAll({ delaySeconds: 10 });
    }
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(run(env)); },
};
