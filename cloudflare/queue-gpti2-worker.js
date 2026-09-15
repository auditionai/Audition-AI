import {
  appendLog, claimJob, enqueueDelayed, envText, isAuthorizedWorkerRequest, isJobId,
  jobState, json, payloadObject, supabase, updateJob,
} from './_queue-shared.js';

const GPTI2_PROVIDERS = new Set(['gpti2_image', 'gpti2_edit']);
const GPTI2_MODELS = new Set(['gpt-image-2', 'image-gpt-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'nano-banana-2', 'nano-banana-pro']);
const GPTI2_SIZES = {
  '1K': { '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280', '4:3': '1024x768', '3:4': '768x1024', '3:2': '1536x1024', '2:3': '1024x1536', '21:9': '1280x544' },
  '2K': { '1:1': '1536x1536', '16:9': '2560x1440', '9:16': '1440x2560', '4:3': '2048x1536', '3:4': '1536x2048', '3:2': '2400x1600', '2:3': '1600x2400', '21:9': '2560x1088' },
  '4K': { '1:1': '2048x2048', '16:9': '3840x2160', '9:16': '2160x3840', '4:3': '3200x2400', '3:4': '2400x3200', '3:2': '3360x2240', '2:3': '2240x3360', '21:9': '3840x1632' },
};

const modelOf = (row) => String(payloadObject(row).model || payloadObject(row).modelId || row?.model_used || '').trim().toLowerCase();
const gpti2SizeOf = (payload) => GPTI2_SIZES[String(payload.resolution || payload.size || '1K').trim().toUpperCase()]?.[String(payload.aspect_ratio || payload.aspectRatio || '1:1').trim()] || GPTI2_SIZES['1K']['1:1'];
const referenceUrlsOf = (row) => {
  const payload = payloadObject(row);
  const recipe = payload.__recipePayload && typeof payload.__recipePayload === 'object' ? payload.__recipePayload : payload;
  const urls = [];
  const add = (value) => { if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) urls.push(value.trim()); };
  const addMany = (value) => { if (Array.isArray(value)) value.forEach(addMany); else if (value && typeof value === 'object') Object.values(value).forEach(addMany); else add(value); };
  addMany(payload.img_url); addMany(payload.image_urls); addMany(payload.image_url);
  addMany(recipe.referenceImages); addMany(recipe.characterImages); addMany(recipe.sampleImage); addMany(recipe.styleImage); addMany(recipe.characterReferenceGroups);
  return [...new Set(urls)];
};
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
  const payload = payloadObject(row); const model = modelOf(row);
  if (!GPTI2_MODELS.has(model)) throw new Error(`GPTI2_MODEL_UNSUPPORTED: ${model}`);
  const prompt = String(payload.prompt || row.prompt || '').trim();
  if (!prompt) throw new Error('GPTI2_ERROR: prompt is required');
  const refs = referenceUrlsOf(row); const size = gpti2SizeOf(payload); let response;
  if (refs.length && !model.startsWith('nano-banana')) {
    await report('building_payload', `Da dung payload GPTi2: ${model}, ${size}, ${refs.length} anh tham chieu.`);
    const form = new FormData(); form.set('prompt', prompt); form.set('model', model); form.set('size', size); form.set('quality', String(payload.quality || 'low'));
    for (const [i, url] of refs.entries()) {
      await report('uploading_refs', `Dang tai va chuan bi anh tham chieu ${i + 1}/${refs.length}.`);
      const source = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!source.ok) throw new Error(`GPTI2 reference ${i + 1} unavailable`);
      form.append('image[]', await source.blob(), `reference-${i + 1}.jpg`);
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
  await updateJob(env, row.id, { status: 'failed', progress: 0, error_message: message, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: appendLog(payloadObject(row), 'failed', message, 'error') });
  const refund = await supabase(env, 'rpc/refund_generated_job', { method: 'POST', body: JSON.stringify({ p_generated_image_id: row.id, p_reason: `Refund: GPTi2 queue job failed (${String(row.tool_name || row.queue_kind || 'generation').slice(0, 120)})` }) });
  if (!refund.ok) console.error(JSON.stringify({ worker: 'queue-gpti2', event: 'refund_failed', jobId: row.id, status: refund.status }));
};

const dispatch = async (env, row) => {
  let activePayload = { ...payloadObject(row), __cloudflareWorker: true };
  const report = async (stage, message, level = 'info') => { activePayload = appendLog(activePayload, stage, message, level); await updateJob(env, row.id, { status: 'processing', progress: stage === 'uploading_refs' ? 35 : stage === 'building_payload' ? 45 : stage === 'verifying_output' ? 85 : 50, error_message: null, queue_payload: activePayload }); };
  await report('preparing', 'Cloudflare GPTi2 Worker da nhan job. Bat dau kiem tra payload.');
  const result = await submitGpti2(env, row, report); await report('verifying_output', 'Dang luu ket qua GPTi2 vao R2.');
  const imageUrl = await persistGpti2Result(env, row, result);
  activePayload = appendLog(activePayload, 'completed', 'Cloudflare Worker da luu ket qua GPTi2 vao R2.', 'success');
  await updateJob(env, row.id, { status: 'completed', progress: 100, image_url: imageUrl, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: activePayload });
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
  catch (error) { await failAndRefund(env, row, error instanceof Error ? error.message : String(error)); return { ack: true, reason: 'failed' }; }
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
