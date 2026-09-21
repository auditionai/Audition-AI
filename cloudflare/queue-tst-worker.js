import {
  appendLog, claimJob, enqueueDelayed, envText, isAuthorizedWorkerRequest, isJobId,
  jobState, json, mimeTypeToExtension, notifyTelegramJob, payloadObject, persistResultToR2, rpc, supabase, updateJob,
} from './_queue-shared.js';

const TST_PROVIDERS = new Set(['tst_image', 'tst_video', 'tst_edit']);
const TST_API_BASE = 'https://api.tramsangtao.com/v1';
const TST_UPLOAD_STATUS_POLL_INTERVAL_MS = 2000;
const TST_UPLOAD_STATUS_TIMEOUT_MS = 240000;
const TST_SOURCE_FETCH_TIMEOUT_MS = 120000;
const TST_VIDEO_SOURCE_FETCH_TIMEOUT_MS = 180000;
// TST is asynchronous. A short poll interval makes a completed provider job
// visible in the gallery promptly without changing the generation concurrency.
const TST_RESULT_POLL_INTERVAL_SECONDS = 5;
const TST_MAX_REFERENCE_IMAGES = 8;
const TST_CATALOG_TTL_MS = 5 * 60 * 1000;
let tstCatalogCache = null;

const modelOf = (row) => String(payloadObject(row).model || payloadObject(row).modelId || row?.model_used || '').trim().toLowerCase();
const GPTI2_IMAGE_MODELS = new Set(['image-gpt-2', 'gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'nano-banana-2', 'nano-banana-pro']);
const isGpti2ImageJob = (row) => {
  const payload = payloadObject(row);
  const recipe = payload.__recipePayload && typeof payload.__recipePayload === 'object' ? payload.__recipePayload : payload;
  const model = String(recipe.model || recipe.modelId || modelOf(row)).trim().toLowerCase();
  const recipeType = String(recipe.recipeType || '').trim().toLowerCase();
  const queueKind = String(row?.queue_kind || '').trim().toLowerCase();
  return GPTI2_IMAGE_MODELS.has(model)
    && (queueKind === 'image_generate' || queueKind === 'image_edit_direct' || recipeType === 'image_edit_recipe_v1');
};
const recipePayloadOf = (row) => {
  const payload = payloadObject(row);
  return payload.__recipePayload && typeof payload.__recipePayload === 'object' ? payload.__recipePayload : payload;
};
const expectedTstLane = (row) => {
  const recipe = recipePayloadOf(row);
  const recipeType = String(recipe?.recipeType || '').trim();
  if (recipeType === 'image_edit_recipe_v1' || row.queue_kind === 'image_edit_direct') return 'tst_edit';
  if (row.queue_kind === 'video_generate' || row.queue_kind === 'motion_generate') return 'tst_video';
  return 'tst_image';
};
const isTstLane = (row, provider) => {
  if (!TST_PROVIDERS.has(provider)) return false;
  const stored = String(row.provider || payloadObject(row).__targetProvider || '').trim().toLowerCase();
  if (stored === provider) return true;
  if (stored !== 'tst') return false;
  return expectedTstLane(row) === provider;
};

const isHttpUrl = (value) => /^https:\/\//i.test(String(value || '').trim());
const cleanBase64 = (value) => String(value || '').replace(/^data:[^;]+;base64,/, '');

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
    await new Promise((resolve) => setTimeout(resolve, TST_UPLOAD_STATUS_POLL_INTERVAL_MS));
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
      console.warn(`[queue-tst] TST ${kind} upload-from-URL failed; falling back to multipart upload.`, error);
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

const uniqueSources = (values) => [...new Set(values
  .flatMap((value) => Array.isArray(value) ? value : [value])
  .map((value) => String(value || '').trim())
  .filter(Boolean))];

const imageToDataUrl = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Sample analysis image fetch failed (${response.status})`);
  const mime = String(response.headers.get('content-type') || 'image/jpeg').split(';', 1)[0];
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Sample analysis image must be between 1 byte and 8 MB');
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
};
const claudeKey = async (env) => {
  const configured = envText(env, 'CLAUDE_API_KEY') || envText(env, 'OPENAI_COMPATIBLE_API_KEY');
  if (configured) return configured;
  const response = await supabase(env, 'api_keys?select=key_value&status=eq.active&name=ilike.%5BCLAUDE%5D%25&order=last_used_at.asc.nullsfirst');
  if (!response.ok) throw new Error(`Claude key lookup failed (${response.status})`);
  const row = (await response.json()).find((item) => String(item?.key_value || '').trim().length >= 8);
  if (!row?.key_value) throw new Error('CLAUDE_NOT_CONFIGURED');
  return String(row.key_value).trim();
};
const applySampleSwapPrompt = async (env, recipe, sources, prompt) => {
  const sampleUrl = String(recipe?.sampleImage || '').trim();
  const characterUrl = sources.find((url) => url !== sampleUrl);
  if (!isHttpUrl(sampleUrl) || !characterUrl) return prompt;
  const [characterImage, sampleImage] = await Promise.all([imageToDataUrl(characterUrl), imageToDataUrl(sampleUrl)]);
  const response = await fetch(`${(envText(env, 'OPENAI_COMPATIBLE_BASE_URL') || 'https://sub.digishop.work/v1').replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${await claudeKey(env)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: envText(env, 'CLAUDE_MODEL') || 'claude-sonnet-4-6', temperature: 0, max_tokens: 900, messages: [{ role: 'user', content: [
      { type: 'text', text: 'Image 1 is the required character identity. Image 2 is the sample canvas. Analyze Image 2 pose, facial expression, head direction, camera angle, crop, lens, body placement, hands, lighting and background. Return one compact English image-edit instruction: replace the full face and body in Image 2 with Image 1 identity; preserve Image 2 pose, expression, camera, framing and scene exactly. Do not mention analysis or JSON.' },
      { type: 'image_url', image_url: { url: characterImage } }, { type: 'image_url', image_url: { url: sampleImage } },
    ] }] }), signal: AbortSignal.timeout(120_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Claude sample analysis failed (${response.status})`);
  const instruction = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!instruction) throw new Error('Claude sample analysis returned no instruction');
  return `${instruction}\n\n${prompt}`.trim();
};
const sampleSwapFallbackPrompt = (prompt) => `FULL FACE AND BODY REPLACEMENT. Use the character reference image(s) as the only identity source. Use the sample image as the base canvas. Replace the sample subject one-to-one while preserving the sample's exact pose, facial expression, head direction, camera angle, crop, framing, body placement, hand visibility, lighting, background, props, and depth. Never copy the sample person's identity, face, hair, outfit, or body. ${prompt}`;

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
          collectCharacterReferenceSources(recipe),
          recipe.sampleImage,
          recipe.styleImage,
          recipe.referenceImages,
        ]);
    return explicit.slice(0, TST_MAX_REFERENCE_IMAGES);
  }
  if (recipeType === 'prompt_image_generate_recipe_v1') {
    const limit = String(recipe.promptMode || '').toLowerCase() === 'user_only' ? 5 : 4;
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
  if (String(recipePayloadOf(row)?.recipeType || '') === 'image_generate_recipe_v1') {
    const originalPrompt = String(providerPayload.prompt || row.prompt || '');
    try { providerPayload.prompt = await applySampleSwapPrompt(env, recipePayloadOf(row), sources, originalPrompt); }
    catch (error) { if (String(recipePayloadOf(row)?.sampleImage || '').trim()) { providerPayload.prompt = sampleSwapFallbackPrompt(originalPrompt); await report('building_payload', 'Claude sample analysis unavailable; using the strict sample-swap contract.', 'warning'); } else throw error; }
  }
  await validateTstPayloadAgainstLiveCatalog(env, row, providerPayload);
  const nextPayload = {
    ...originalPayload,
    __uploadSources: sources,
    __uploadedUrls: uploadedUrls,
    __tstPreparedAt: new Date().toISOString(),
    __tstProviderPayload: providerPayload,
    __stage: 'building_payload',
  };
  await report('building_payload', 'Da dung payload TST voi media tham chieu da san sang.', 'success');
  return { providerPayload, queuePayload: nextPayload };
};

const submitTst = async (env, row, providerPayload, report) => {
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

const failAndRefund = async (env, row, message) => {
  await updateJob(env, row.id, { status: 'failed', progress: 0, error_message: message, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: appendLog(payloadObject(row), 'failed', message, 'error') });
  await notifyTelegramJob(env, 'failed', row, { errorMessage: message, finishedAt: new Date().toISOString() }).catch((error) => console.warn('[queue-tst] Telegram notification failed', error));
  const refund = await rpc(env, 'refund_generated_job', { p_generated_image_id: row.id, p_reason: `Refund: TST queue job failed (${String(row.tool_name || row.queue_kind || 'generation').slice(0, 120)})` });
  if (!refund.ok) console.error(JSON.stringify({ worker: 'queue-tst', event: 'refund_failed', jobId: row.id, status: refund.status }));
};

const schedulePoll = async (env, jobId, provider, delaySeconds = TST_RESULT_POLL_INTERVAL_SECONDS) => enqueueDelayed(env.TST_JOBS, { jobId, provider, action: 'poll', requestedAt: new Date().toISOString() }, delaySeconds);

const fetchTstJob = async (env, jobId) => {
  const response = await fetch(`${TST_API_BASE}/jobs/${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${envText(env, 'TST_API_KEY')}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`TST poll failed (${response.status}): ${await response.text()}`);
  return response.json();
};

const pollRow = async (env, row, provider) => {
  try {
    const data = await fetchTstJob(env, row.job_id);
    const status = String(data?.status || '').toLowerCase();
    const result = providerResultOf(data, row.asset_type || 'image');
    if (result && ['completed', 'success', 'succeeded', 'done'].includes(status)) {
      const storedUrl = await persistResultToR2(env, row, result, '-tst');
      await updateJob(env, row.id, { status: 'completed', progress: 100, image_url: storedUrl, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: appendLog(payloadObject(row), 'completed', 'Cloudflare Worker da luu ket qua TST.', 'success') });
      await notifyTelegramJob(env, 'completed', row, { resultUrl: storedUrl, finishedAt: new Date().toISOString() }).catch((error) => console.warn('[queue-tst] Telegram notification failed', error));
      return 'completed';
    }
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      await failAndRefund(env, row, String(data?.error || data?.message || 'TST job failed'));
      return 'failed';
    }
    await updateJob(env, row.id, { status: 'processing', progress: Math.max(60, Number(data?.progress || 0)), next_poll_at: new Date(Date.now() + TST_RESULT_POLL_INTERVAL_SECONDS * 1000).toISOString(), lease_token: null, lease_expires_at: null, queue_payload: appendLog(payloadObject(row), 'polling', 'Cloudflare Worker dang poll TST.') });
    await schedulePoll(env, row.id, provider);
    return 'pending';
  } catch (error) {
    await updateJob(env, row.id, { status: 'processing', next_poll_at: new Date(Date.now() + 30000).toISOString(), lease_token: null, lease_expires_at: null, error_message: error instanceof Error ? error.message : String(error), queue_payload: appendLog(payloadObject(row), 'polling', 'Cloudflare Worker poll TST gap loi, se thu lai.', 'warning') });
    await schedulePoll(env, row.id, provider, 30);
    return 'retrying';
  }
};

const dispatch = async (env, row, provider) => {
  let activePayload = { ...payloadObject(row), __cloudflareWorker: true };
  const report = async (stage, message, level = 'info') => { activePayload = appendLog(activePayload, stage, message, level); await updateJob(env, row.id, { status: 'processing', progress: stage === 'uploading_refs' ? 35 : stage === 'building_payload' ? 45 : stage === 'dispatching' ? 55 : 50, error_message: null, queue_payload: activePayload }); };
  await report('preparing', 'Cloudflare TST Worker da nhan job. Bat dau kiem tra payload.');
  const prepared = await prepareTstPayload(env, row, report);
  activePayload = prepared.queuePayload;
  const submission = await submitTst(env, row, prepared.providerPayload, report);
  const submittedPayload = appendLog({ ...activePayload, __cloudflareWorker: true }, 'submitted', 'TST da nhan job. Dang cho ket qua.', 'success');
  await updateJob(env, row.id, { status: 'processing', progress: 60, provider: 'tst', job_id: submission.id, next_poll_at: new Date(Date.now() + TST_RESULT_POLL_INTERVAL_SECONDS * 1000).toISOString(), lease_token: null, lease_expires_at: null, queue_payload: submittedPayload });
  await schedulePoll(env, row.id, provider);
};

const redirectGpti2ImageJob = async (env, row) => {
  const payload = appendLog(payloadObject(row), 'queued', `Model ${modelOf(row)} chi dung GPTi2. Da chuyen job sang GPTi2 truoc khi gui provider.`, 'warning');
  await updateJob(env, row.id, {
    status: 'queued', progress: 0, provider: 'gpti2', job_id: null, next_poll_at: null,
    lease_token: null, lease_expires_at: null, processing_started_at: null, error_message: null,
    queue_payload: { ...payload, __targetProvider: 'gpti2', __smartProviderFallbackEnabled: false, __providerPriority: ['gpti2'] },
  });
  const recipe = payloadObject(row).__recipePayload && typeof payloadObject(row).__recipePayload === 'object' ? payloadObject(row).__recipePayload : payloadObject(row);
  const isEdit = String(recipe.recipeType || '').trim().toLowerCase() === 'image_edit_recipe_v1' || String(row.queue_kind || '').trim().toLowerCase() === 'image_edit_direct';
  await env.GPTI2_JOBS.send({ jobId: row.id, provider: isEdit ? 'gpti2_edit' : 'gpti2_image', action: 'dispatch', requestedAt: new Date().toISOString() });
};

const processMessage = async (env, message) => {
  const body = message.body && typeof message.body === 'object' ? message.body : {};
  const jobId = String(body.jobId || '').trim();
  const provider = String(body.provider || '').trim().toLowerCase();
  const action = String(body.action || 'dispatch').toLowerCase();
  if (!isJobId(jobId) || !TST_PROVIDERS.has(provider) || !['dispatch', 'poll'].includes(action)) return { ack: true, reason: 'invalid_message' };

  const row = await claimJob(env, jobId, action);
  if (!row) {
    const state = await jobState(env, jobId);
    if (action === 'dispatch' && state?.status === 'queued') {
      await enqueueDelayed(env.TST_JOBS, { jobId, provider, action: 'dispatch', requestedAt: new Date().toISOString() }, 30);
      return { ack: true, reason: 'capacity_rescheduled' };
    }
    if (action === 'poll' && state?.status === 'processing' && state.job_id) {
      const dueAt = Date.parse(state.next_poll_at || '');
      const delaySeconds = Number.isFinite(dueAt) ? Math.max(5, Math.ceil((dueAt - Date.now()) / 1000)) : TST_RESULT_POLL_INTERVAL_SECONDS;
      await schedulePoll(env, jobId, provider, delaySeconds);
      return { ack: true, reason: 'poll_rescheduled' };
    }
    return { ack: true, reason: 'already_claimed_or_terminal' };
  }

  if (action === 'poll') { await pollRow(env, row, provider); return { ack: true, reason: 'polled' }; }

  if (isGpti2ImageJob(row)) {
    await redirectGpti2ImageJob(env, row);
    return { ack: true, reason: 'redirected_to_gpti2' };
  }

  if (!isTstLane(row, provider)) { console.error(JSON.stringify({ worker: 'queue-tst', event: 'wrong_lane', jobId, provider, rowProvider: row.provider })); return { ack: true, reason: 'wrong_lane' }; }
  try { await dispatch(env, row, provider); return { ack: true, reason: 'dispatched' }; }
  catch (error) { await failAndRefund(env, row, error instanceof Error ? error.message : String(error)); return { ack: true, reason: 'failed' }; }
};

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-queue-tst' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    if (!isAuthorizedWorkerRequest(request, env)) return json({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => null);
    if (!isJobId(body?.jobId) || !TST_PROVIDERS.has(String(body?.provider || '').toLowerCase())) return json({ error: 'jobId and TST provider are required' }, 400);
    // HTTP wake requests enqueue work; Queue delivery gives long provider calls
    // the execution lifetime they need.
    await env.TST_JOBS.send({ ...body, action: 'dispatch', requestedAt: new Date().toISOString() });
    return json({ accepted: true }, 202);
  },
  async queue(batch, env) {
    await Promise.all(batch.messages.map(async (message) => {
      try { const outcome = await processMessage(env, message); if (outcome.ack) message.ack(); else message.retry({ delaySeconds: 30 }); }
      catch (error) { console.error(JSON.stringify({ worker: 'queue-tst', event: 'queue_delivery_failed', error: String(error) })); message.retry({ delaySeconds: 30 }); }
    }));
  },
};
