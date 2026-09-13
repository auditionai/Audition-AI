const SYSTEM_KINDS = ['image_generate', 'video_generate', 'motion_generate'];
const GPTI2_MODELS = new Set(['gpt-image-2', 'image-gpt-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'nano-banana-2', 'nano-banana-pro']);

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const envText = (env, key) => String(env[key] || '').trim();
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

const rescueAbandonedGpti2Dispatches = async (env) => {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const response = await supabase(env, `generated_images?status=eq.processing&job_id=is.null&updated_at=lt.${encodeURIComponent(cutoff)}&select=id,queue_payload`);
  if (!response.ok) throw new Error(`Supabase rescue scan failed (${response.status}): ${await response.text()}`);
  const rows = (await response.json()).filter((row) => payloadObject(row).__targetProvider === 'gpti2' && payloadObject(row).__stage === 'dispatching');
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

const tst = async (env, row) => {
  const payload = payloadObject(row);
  const path = row.queue_kind === 'video_generate' ? '/video/generate' : row.queue_kind === 'motion_generate' ? '/motion/generate' : '/image/generate';
  const response = await fetch(`https://api.tramsangtao.com/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env.TST_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, prompt: payload.prompt || row.prompt, model: modelOf(row) }), signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`TST_ERROR: ${await response.text()}`);
  const data = await response.json();
  const id = data?.job_id || data?.jobId || data?.id;
  if (!id) throw new Error('TST_ERROR: provider returned no job id');
  return { id: String(id) };
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
    activePayload = appendLog(activePayload, 'completed', 'Cloudflare Worker da nhan ket qua GPTi2 va luu anh.', 'success');
    await updateJob(env, row.id, { status: 'completed', progress: 100, image_url: result, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: activePayload });
    return { completed: 1 };
  }
  const submission = await tst(env, row);
  await updateJob(env, row.id, { status: 'processing', progress: 60, provider: 'tst', job_id: submission.id, next_poll_at: new Date(Date.now() + 15000).toISOString(), lease_token: null, lease_expires_at: null, queue_payload: { ...payloadObject(row), __stage: 'submitted', __cloudflareWorker: true } });
  return { submitted: 1 };
};

const run = async (env) => {
  const rescued = await rescueAbandonedGpti2Dispatches(env);
  const claim = await rpc(env, 'claim_dispatchable_generated_jobs', { p_limit: Number(env.CLOUDFLARE_QUEUE_BATCH || 4), p_lease_seconds: 900 });
  if (!claim.ok) throw new Error(`Supabase claim failed (${claim.status}): ${await claim.text()}`);
  const rows = await claim.json(); const summary = { rescued, claimed: rows.length, completed: 0, submitted: 0, failed: 0 };
  for (const row of rows) { try { Object.assign(summary, Object.fromEntries(Object.entries(await processRow(env, row)).map(([k, v]) => [k, Number(summary[k] || 0) + v]))); } catch (error) { summary.failed += 1; await updateJob(env, row.id, { status: 'failed', progress: 0, error_message: error instanceof Error ? error.message : String(error), finished_at: new Date().toISOString(), lease_token: null, lease_expires_at: null, next_poll_at: null, queue_payload: { ...payloadObject(row), __stage: 'failed', __cloudflareWorker: true } }); } }
  return summary;
};

export default {
  async fetch(request, env, ctx) { if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-queue-worker' }); ctx.waitUntil(run(env).catch((error) => console.error('[queue-worker]', error))); return json({ accepted: true }, 202); },
  async scheduled(_event, env, ctx) { ctx.waitUntil(run(env)); },
};
