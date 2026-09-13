const SYSTEM_KINDS = ['image_generate', 'video_generate', 'motion_generate'];
const GPTI2_MODELS = new Set(['gpt-image-2', 'image-gpt-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'nano-banana-2', 'nano-banana-pro']);

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const envText = (env, key) => String(env[key] || '').trim();
const payloadObject = (row) => row?.queue_payload && typeof row.queue_payload === 'object' ? row.queue_payload : {};
const modelOf = (row) => String(row?.model_used || payloadObject(row).model || payloadObject(row).modelId || '').trim().toLowerCase();
const providerOf = (row) => String(row?.provider || payloadObject(row).__targetProvider || '').trim().toLowerCase() || (GPTI2_MODELS.has(modelOf(row)) ? 'gpti2' : 'tst');
const supabase = (env, path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', ...(init.headers || {}) } });
const rpc = (env, name, body) => fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const updateJob = async (env, id, values) => {
  const response = await supabase(env, `generated_images?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error(`Supabase update failed (${response.status}): ${await response.text()}`);
};

const gpti2 = async (env, row) => {
  const payload = payloadObject(row);
  const model = modelOf(row);
  if (!GPTI2_MODELS.has(model)) throw new Error(`GPTI2_MODEL_UNSUPPORTED: ${model}`);
  const prompt = String(payload.prompt || row.prompt || '').trim();
  if (!prompt) throw new Error('GPTI2_ERROR: prompt is required');
  const refs = Array.isArray(payload.img_url) ? payload.img_url : Array.isArray(payload.image_urls) ? payload.image_urls : [];
  const resolution = String(payload.resolution || payload.size || '1K').toUpperCase();
  const size = resolution === '1K' ? '1024x1024' : resolution === '2K' ? '1536x1536' : '2048x2048';
  let response;
  if (refs.length && !model.startsWith('nano-banana')) {
    const form = new FormData(); form.set('prompt', prompt); form.set('model', model); form.set('size', size); form.set('quality', String(payload.quality || 'low'));
    for (const [i, url] of refs.entries()) { const source = await fetch(String(url)); if (!source.ok) throw new Error(`GPTI2 reference ${i + 1} unavailable`); form.append('image[]', await source.blob(), `reference-${i + 1}`); }
    response = await fetch('https://gpti2.store/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${env.GPTI2_API_KEY}` }, body: form, signal: AbortSignal.timeout(295000) });
  } else {
    response = await fetch('https://gpti2.store/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${env.GPTI2_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, size, quality: String(payload.quality || 'low'), n: 1 }), signal: AbortSignal.timeout(295000) });
  }
  if (!response.ok) throw new Error(`GPTI2_ERROR: ${await response.text()}`);
  const data = await response.json();
  const raw = data?.data?.[0]?.b64_json || data?.data?.[0]?.url || data?.url;
  if (!raw) throw new Error('GPTI2_ERROR: provider returned no image');
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
  await updateJob(env, row.id, { status: 'processing', progress: 50, error_message: null, queue_payload: { ...payloadObject(row), __stage: 'dispatching', __cloudflareWorker: true } });
  if (providerOf(row) === 'gpti2') {
    const result = await gpti2(env, row);
    await updateJob(env, row.id, { status: 'completed', progress: 100, image_url: result, finished_at: new Date().toISOString(), next_poll_at: null, lease_token: null, lease_expires_at: null, queue_payload: { ...payloadObject(row), __stage: 'completed', __cloudflareWorker: true } });
    return { completed: 1 };
  }
  const submission = await tst(env, row);
  await updateJob(env, row.id, { status: 'processing', progress: 60, provider: 'tst', job_id: submission.id, next_poll_at: new Date(Date.now() + 15000).toISOString(), lease_token: null, lease_expires_at: null, queue_payload: { ...payloadObject(row), __stage: 'submitted', __cloudflareWorker: true } });
  return { submitted: 1 };
};

const run = async (env) => {
  const claim = await rpc(env, 'claim_dispatchable_generated_jobs', { p_limit: Number(env.CLOUDFLARE_QUEUE_BATCH || 4), p_lease_seconds: 900 });
  if (!claim.ok) throw new Error(`Supabase claim failed (${claim.status}): ${await claim.text()}`);
  const rows = await claim.json(); const summary = { claimed: rows.length, completed: 0, submitted: 0, failed: 0 };
  for (const row of rows) { try { Object.assign(summary, Object.fromEntries(Object.entries(await processRow(env, row)).map(([k, v]) => [k, Number(summary[k] || 0) + v]))); } catch (error) { summary.failed += 1; await updateJob(env, row.id, { status: 'failed', progress: 0, error_message: error instanceof Error ? error.message : String(error), finished_at: new Date().toISOString(), lease_token: null, lease_expires_at: null, next_poll_at: null, queue_payload: { ...payloadObject(row), __stage: 'failed', __cloudflareWorker: true } }); } }
  return summary;
};

export default {
  async fetch(request, env, ctx) { if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-queue-worker' }); ctx.waitUntil(run(env).catch((error) => console.error('[queue-worker]', error))); return json({ accepted: true }, 202); },
  async scheduled(_event, env, ctx) { ctx.waitUntil(run(env)); },
};
