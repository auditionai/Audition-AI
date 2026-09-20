import {
  appendLog, claimJob, compactWorkerPayload, enqueueDelayed, envText, isAuthorizedWorkerRequest, isJobId,
  jobState, json, notifyTelegramJob, payloadObject, supabase, updateJob,
} from './_queue-shared.js';

const GPTI2_PROVIDERS = new Set(['gpti2_image', 'gpti2_edit']);
const GPTI2_MODELS = new Set(['gpt-image-2', 'image-gpt-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'nano-banana-2', 'nano-banana-pro']);
const GPTI2_SIZES = {
  '1K': { '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280', '4:3': '1024x768', '3:4': '768x1024', '3:2': '1536x1024', '2:3': '1024x1536', '21:9': '1280x544' },
  '2K': { '1:1': '1536x1536', '16:9': '2560x1440', '9:16': '1440x2560', '4:3': '2048x1536', '3:4': '1536x2048', '3:2': '2400x1600', '2:3': '1600x2400', '21:9': '2560x1088' },
  '4K': { '1:1': '2048x2048', '16:9': '3840x2160', '9:16': '2160x3840', '4:3': '3200x2400', '3:4': '2400x3200', '3:2': '3360x2240', '2:3': '2240x3360', '21:9': '3840x1632' },
};
const GPTI2_MAX_ATTEMPTS = 6;
const isRetryableGpti2Error = (message) => /timeout|timed out|network|429|rate_limit|rate limit|service busy|temporarily unavailable|5\d\d|provider returned no image|endpoint returned no image/i.test(String(message || ''));
const retryAfterSeconds = (message) => {
  const match = String(message || '').match(/retry\s+in\s+(\d+)s/i);
  return match ? Math.max(10, Math.min(600, Number(match[1]) + 2)) : 0;
};

const modelOf = (row) => String(payloadObject(row).model || payloadObject(row).modelId || row?.model_used || '').trim().toLowerCase();
const isDirectImageEdit = (row) => {
  const payload = payloadObject(row);
  const recipe = payload.__recipePayload && typeof payload.__recipePayload === 'object' ? payload.__recipePayload : payload;
  return String(recipe.recipeType || '').trim().toLowerCase() === 'image_edit_recipe_v1'
    || String(row?.queue_kind || '').trim().toLowerCase() === 'image_edit_direct';
};
const gpti2SizeOf = (payload) => GPTI2_SIZES[String(payload.resolution || payload.size || '1K').trim().toUpperCase()]?.[String(payload.aspect_ratio || payload.aspectRatio || '1:1').trim()] || GPTI2_SIZES['1K']['1:1'];
const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());
const referenceUrlsOf = (row) => {
  const payload = payloadObject(row);
  const recipe = payload.__recipePayload && typeof payload.__recipePayload === 'object' ? payload.__recipePayload : payload;
  const urls = [];
  const add = (value) => { if (isHttpUrl(value)) urls.push(value.trim()); };
  const addMany = (value) => { if (Array.isArray(value)) value.forEach(addMany); else if (value && typeof value === 'object') Object.values(value).forEach(addMany); else add(value); };
  // Reference order is part of the prompt contract: character identity first,
  // then the sample canvas, then optional style/reference images.
  const groups = Array.isArray(recipe.characterReferenceGroups) ? recipe.characterReferenceGroups : [];
  for (const group of groups) addMany(Array.isArray(group?.references) ? group.references.map((reference) => reference?.source || reference) : []);
  addMany(recipe.characterImages); add(recipe.sampleImage); add(recipe.styleImage); addMany(recipe.referenceImages);
  addMany(payload.img_url); addMany(payload.image_urls); add(payload.image_url);
  return [...new Set(urls)];
};
const assertCompleteReferenceImage = (bytes, contentType, index) => {
  const type = String(contentType || '').toLowerCase().split(';', 1)[0];
  const has = (...values) => values.every((value, position) => bytes[position] === value);
  const endsWith = (...values) => values.every((value, position) => bytes[bytes.length - values.length + position] === value);
  let valid = bytes.length > 0;
  if (type === 'image/jpeg') valid = valid && has(0xff, 0xd8) && endsWith(0xff, 0xd9);
  if (type === 'image/png') valid = valid && has(0x89, 0x50, 0x4e, 0x47) && endsWith(0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82);
  if (type === 'image/gif') valid = valid && (has(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || has(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)) && endsWith(0x3b);
  if (type === 'image/webp') valid = valid && has(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!valid) throw new Error(`GPTI2_INPUT_INVALID: Reference image #${index + 1} is truncated or corrupt. Re-upload the original image before retrying.`);
};
const downloadReferenceImage = async (url, index) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GPTI2 reference ${index + 1} unavailable`);
  const contentType = String(response.headers.get('content-type') || 'image/jpeg').split(';', 1)[0];
  let bytes = new Uint8Array(await response.arrayBuffer());
  const isJpeg = contentType === 'image/jpeg';
  const missingJpegEnd = isJpeg && bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 && !(bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9);
  if (missingJpegEnd) {
    const repaired = new Uint8Array(bytes.length + 2);
    repaired.set(bytes); repaired[bytes.length] = 0xff; repaired[bytes.length + 1] = 0xd9;
    bytes = repaired;
  }
  assertCompleteReferenceImage(bytes, contentType, index);
  return { blob: new Blob([bytes], { type: contentType }), repaired: missingJpegEnd };
};
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
const buildSampleSwapPrompt = async (env, row, refs, basePrompt) => {
  const payload = payloadObject(row); const recipe = payload.__recipePayload && typeof payload.__recipePayload === 'object' ? payload.__recipePayload : payload;
  const sampleUrl = String(recipe.sampleImage || '').trim();
  const characterUrl = refs.find((url) => url !== sampleUrl);
  if (!isHttpUrl(sampleUrl) || !characterUrl) return basePrompt;
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
  return `${instruction}\n\n${basePrompt}`.trim();
};
const sampleSwapFallbackPrompt = (basePrompt) => `FULL FACE AND BODY REPLACEMENT. Use the character reference image(s) as the only identity source. Use the sample image as the base canvas. Replace the sample subject one-to-one while preserving the sample's exact pose, facial expression, head direction, camera angle, crop, framing, body placement, hand visibility, lighting, background, props, and depth. Never copy the sample person's identity, face, hair, outfit, or body. ${basePrompt}`;
const imageExtension = (contentType) => String(contentType || '').toLowerCase().includes('jpeg') ? 'jpg' : String(contentType || '').toLowerCase().includes('webp') ? 'webp' : 'png';
const isGpti2Lane = (row, provider) => {
  if (!GPTI2_PROVIDERS.has(provider)) return false;
  const stored = String(row.provider || payloadObject(row).__targetProvider || '').trim().toLowerCase();
  if (stored === provider) return true;
  if (stored !== 'gpti2') return false;
  const recipeType = String(payloadObject(row).__recipePayload?.recipeType || payloadObject(row).recipeType || '').toLowerCase();
  return provider === (recipeType === 'image_edit_recipe_v1' ? 'gpti2_edit' : 'gpti2_image');
};

const persistGpti2Result = async (env, row, result) => {
  const keyBase = `users/${encodeURIComponent(row.user_id)}/generated/${encodeURIComponent(row.id)}`;
  let body; let contentType = 'image/png';
  if (result.startsWith('data:image/')) {
    const match = result.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error('GPTI2_ERROR: invalid inline image result');
    contentType = match[1]; const binary = atob(match[2]); const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    body = bytes;
  } else {
    const response = await fetch(result, { signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error(`GPTI2_ERROR: result download failed (${response.status})`);
    contentType = response.headers.get('content-type') || contentType; body = response.body;
  }
  const publicBase = envText(env, 'R2_PUBLIC_URL').replace(/\/+$/, '');
  if (!publicBase) throw new Error('R2_PUBLIC_URL is required to publish GPTi2 output');
  const key = `${keyBase}.${imageExtension(contentType)}`;
  await env.RESULTS_BUCKET.put(key, body, { httpMetadata: { contentType } });
  return `${publicBase}/${key}`;
};

const submitGpti2 = async (env, row, report) => {
  const payload = payloadObject(row); const model = isDirectImageEdit(row) ? 'gpt-image-2' : modelOf(row);
  if (!GPTI2_MODELS.has(model)) throw new Error(`GPTI2_MODEL_UNSUPPORTED: ${model}`);
  const rawPrompt = String(payload.prompt || row.prompt || '').trim();
  if (!rawPrompt) throw new Error('GPTI2_ERROR: prompt is required');
  const refs = referenceUrlsOf(row); const size = gpti2SizeOf(payload); let response;
  // Validate every reference before any analysis or provider request so a
  // corrupt R2 object cannot consume a GPTi2 generation attempt.
  const referenceBlobs = [];
  for (const [i, url] of refs.entries()) {
    await report('uploading_refs', `Dang kiem tra anh tham chieu ${i + 1}/${refs.length}.`);
    const reference = await downloadReferenceImage(url, i);
    if (reference.repaired) await report('uploading_refs', `Da sua marker ket thuc cho JPEG tham chieu ${i + 1} truoc khi gui GPTi2.`, 'warning');
    referenceBlobs.push(reference.blob);
  }
  let prompt = rawPrompt;
  try { prompt = await buildSampleSwapPrompt(env, row, refs, rawPrompt); }
  catch (error) { if (String(payloadObject(row).__recipePayload?.sampleImage || payloadObject(row).sampleImage || '').trim()) { prompt = sampleSwapFallbackPrompt(rawPrompt); await report('building_payload', 'Claude sample analysis unavailable; using the strict sample-swap contract.', 'warning'); } else throw error; }
  if (refs.length) {
    await report('building_payload', `Da dung payload GPTi2: ${model}, ${size}, ${refs.length} anh tham chieu.`);
    const form = new FormData(); form.set('prompt', prompt); form.set('model', model); form.set('size', size); form.set('quality', String(payload.quality || 'low'));
    for (const [i, blob] of referenceBlobs.entries()) {
      form.append('image[]', blob, `reference-${i + 1}.jpg`);
      await report('uploading_refs', `Da dua anh tham chieu ${i + 1}/${refs.length} vao payload GPTi2.`, 'success');
    }
    await report('dispatching', `Dang gui GPTi2 edit request voi ${refs.length} anh tham chieu.`);
    response = await fetch('https://gpti2.store/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${env.GPTI2_API_KEY}` }, body: form, signal: AbortSignal.timeout(295000) });
  } else {
    await report('building_payload', `Da dung payload GPTi2: ${model}, ${size}, khong co anh tham chieu.`); await report('dispatching', 'Dang gui GPTi2 generation request.');
    response = await fetch('https://gpti2.store/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${env.GPTI2_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, size, quality: String(payload.quality || 'low'), n: 1 }), signal: AbortSignal.timeout(295000) });
  }
  if (!response.ok) { const detail = await response.text(); throw new Error(`GPTI2_ERROR: ${detail}`); }
  const data = await response.json();
  const findResult = (value, depth = 0) => {
    if (depth > 6 || value == null) return '';
    if (typeof value === 'string') return /^https?:\/\//i.test(value.trim()) || value.trim().startsWith('data:image/') || value.trim().length > 128 ? value.trim() : '';
    if (Array.isArray(value)) { for (const item of value) { const found = findResult(item, depth + 1); if (found) return found; } return ''; }
    if (typeof value !== 'object') return '';
    const object = value;
    for (const key of ['b64_json', 'image_url', 'imageUrl', 'result_url', 'resultUrl', 'output_url', 'outputUrl', 'url', 'result', 'output', 'image']) { const found = findResult(object[key], depth + 1); if (found) return found; }
    for (const [key, child] of Object.entries(object)) { if (/prompt|status|message|error|model|usage|id/i.test(key)) continue; const found = findResult(child, depth + 1); if (found) return found; }
    return '';
  };
  const raw = findResult(data);
  if (!raw) throw new Error('GPTI2_ERROR: provider returned no image');
  await report('verifying_output', 'GPTi2 da tra ket qua. Dang kiem tra va luu anh.');
  return String(raw).startsWith('http') ? String(raw) : `data:image/png;base64,${raw}`;
};

const failAndRefund = async (env, row, message) => {
  await updateJob(env, row.id, { status: 'failed', progress: 0, error_message: message, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: appendLog(compactWorkerPayload(row), 'failed', message, 'error') });
  await notifyTelegramJob(env, 'failed', row, { errorMessage: message, finishedAt: new Date().toISOString() }).catch((error) => console.warn('[queue-gpti2] Telegram notification failed', error));
  const refund = await supabase(env, 'rpc/refund_generated_job', { method: 'POST', body: JSON.stringify({ p_generated_image_id: row.id, p_reason: `Refund: GPTi2 queue job failed (${String(row.tool_name || row.queue_kind || 'generation').slice(0, 120)})` }) });
  if (!refund.ok) console.error(JSON.stringify({ worker: 'queue-gpti2', event: 'refund_failed', jobId: row.id, status: refund.status }));
};

const retryBeforeFallback = async (env, row, message, attemptCount) => {
  if (!isRetryableGpti2Error(message) || attemptCount >= GPTI2_MAX_ATTEMPTS) return false;
  const delaySeconds = retryAfterSeconds(message) || Math.min(120, 10 * (attemptCount + 1));
  const payload = appendLog(compactWorkerPayload(row), 'queued', `GPTi2 tam ban. Se thu lai lan ${attemptCount + 1}/${GPTI2_MAX_ATTEMPTS} sau ${delaySeconds}s.`, 'warning');
  await updateJob(env, row.id, {
    status: 'queued', progress: 0, job_id: null, lease_token: null, lease_expires_at: null,
    processing_started_at: null, next_poll_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    attempt_count: attemptCount + 1, error_message: message, queue_payload: payload,
  });
  await enqueueDelayed(env.GPTI2_JOBS, { jobId: row.id, provider: 'gpti2_image', action: 'dispatch', requestedAt: new Date().toISOString() }, delaySeconds);
  return true;
};

const dispatch = async (env, row) => {
  let activePayload = { ...compactWorkerPayload(row), __cloudflareWorker: true };
  const report = async (stage, message, level = 'info') => {
    activePayload = appendLog(activePayload, stage, message, level);
    if (stage === 'dispatching') {
      activePayload.__gpti2SynchronousDispatchStartedAt = new Date().toISOString();
    }
    await updateJob(env, row.id, {
      status: 'processing',
      progress: stage === 'uploading_refs' ? 35 : stage === 'building_payload' ? 45 : stage === 'verifying_output' ? 85 : 50,
      error_message: null,
      queue_payload: activePayload,
    });
  };
  await report('preparing', 'Cloudflare GPTi2 Worker da nhan job. Bat dau kiem tra payload.');
  if (isDirectImageEdit(row)) {
    activePayload.model = 'gpt-image-2';
    activePayload.modelId = 'gpt-image-2';
    if (activePayload.__recipePayload && typeof activePayload.__recipePayload === 'object') {
      activePayload.__recipePayload = { ...activePayload.__recipePayload, model: 'gpt-image-2', modelId: 'gpt-image-2' };
    }
    row.queue_payload = activePayload;
  }
  const result = await submitGpti2(env, row, report); await report('verifying_output', 'Dang luu ket qua GPTi2 vao R2.');
  const imageUrl = await persistGpti2Result(env, row, result);
  activePayload = appendLog(activePayload, 'completed', 'Cloudflare Worker da luu ket qua GPTi2 vao R2.', 'success');
  await updateJob(env, row.id, { status: 'completed', progress: 100, image_url: imageUrl, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: activePayload });
  await notifyTelegramJob(env, 'completed', row, { resultUrl: imageUrl, finishedAt: new Date().toISOString() }).catch((error) => console.warn('[queue-gpti2] Telegram notification failed', error));
};

const processMessage = async (env, message) => {
  const body = message.body && typeof message.body === 'object' ? message.body : {};
  const jobId = String(body.jobId || '').trim(); const provider = String(body.provider || '').trim().toLowerCase();
  if (!isJobId(jobId) || !GPTI2_PROVIDERS.has(provider) || String(body.action || 'dispatch').toLowerCase() !== 'dispatch') return { ack: true, reason: 'invalid_message' };
  const row = await claimJob(env, jobId, 'dispatch');
  if (!row) {
    const state = await jobState(env, jobId);
    if (state?.status === 'queued') await enqueueDelayed(env.GPTI2_JOBS, { ...body, jobId, provider, action: 'dispatch', requestedAt: new Date().toISOString() }, 30);
    return { ack: true, reason: 'already_claimed_or_rescheduled' };
  }
  if (!isGpti2Lane(row, provider)) { console.error(JSON.stringify({ worker: 'queue-gpti2', event: 'wrong_lane', jobId, provider, rowProvider: row.provider })); return { ack: true, reason: 'wrong_lane' }; }
  try { await dispatch(env, row); return { ack: true, reason: 'dispatched' }; }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const state = await jobState(env, row.id).catch(() => null);
    if (await retryBeforeFallback(env, row, message, Number(state?.attempt_count || 0))) return { ack: true, reason: 'retry_before_fallback' };
    await failAndRefund(env, row, message);
    return { ack: true, reason: 'failed' };
  }
};

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-queue-gpti2' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    if (!isAuthorizedWorkerRequest(request, env)) return json({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => null);
    if (!isJobId(body?.jobId) || !GPTI2_PROVIDERS.has(String(body?.provider || '').toLowerCase())) return json({ error: 'jobId and GPTi2 provider are required' }, 400);
    // HTTP request lifetimes are too short for a synchronous GPTi2 generation.
    // Hand the work to the Queue consumer, which owns the long-running call.
    await env.GPTI2_JOBS.send({ ...body, action: 'dispatch', requestedAt: new Date().toISOString() });
    return json({ accepted: true }, 202);
  },
  async queue(batch, env) {
    await Promise.all(batch.messages.map(async (message) => {
      try { const outcome = await processMessage(env, message); if (outcome.ack) message.ack(); else message.retry({ delaySeconds: 30 }); }
      catch (error) { console.error(JSON.stringify({ worker: 'queue-gpti2', event: 'queue_delivery_failed', error: String(error) })); message.retry({ delaySeconds: 30 }); }
    }));
  },
};
