const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const headers = (env) => { const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^\uFEFF/, '').trim(); return { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' }; };
const isAuthorizedWorkerRequest = (request, env) => {
  const expected = String(env.DIRECT_EDIT_WORKER_SECRET || '').trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}` || request.headers.get('x-worker-secret') === expected;
};
const rpc = (env, name, body) => fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(env), body: JSON.stringify(body) });
const update = async (env, id, patch) => { const response = await fetch(`${env.SUPABASE_URL}/rest/v1/generated_images?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { ...headers(env), Prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }); if (!response.ok) throw new Error(`Supabase update failed (${response.status})`); };
const payload = (row) => row?.queue_payload && typeof row.queue_payload === 'object' ? row.queue_payload : {};
const log = (p, stage, message, level = 'info') => ({ ...p, __stage: stage, __logs: [...(Array.isArray(p.__logs) ? p.__logs : []), { at: new Date().toISOString(), stage, level, message }].slice(-80) });
const gpti2Size = (resolution, aspectRatio) => {
  const resolutionKey = String(resolution || '1K').trim().toUpperCase();
  const ratio = String(aspectRatio || '1:1').trim();
  const sizes = {
    '1K': { '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280', '4:3': '1024x768', '3:4': '768x1024', '3:2': '1536x1024', '2:3': '1024x1536' },
    '2K': { '1:1': '1536x1536', '16:9': '2560x1440', '9:16': '1440x2560', '4:3': '2048x1536', '3:4': '1536x2048', '3:2': '2400x1600', '2:3': '1600x2400' },
    '4K': { '1:1': '2048x2048', '16:9': '3840x2160', '9:16': '2160x3840', '4:3': '3200x2400', '3:4': '2400x3200', '3:2': '3360x2240', '2:3': '2240x3360' },
  };
  return sizes[resolutionKey]?.[ratio] || sizes['1K']['1:1'];
};
const gpti2Result = (data) => {
  const raw = data?.data?.[0]?.url || data?.data?.[0]?.b64_json || data?.image_url || data?.result_url || data?.url;
  if (!raw) throw new Error('GPTI2_ERROR: GPT Image 2 edit returned no image');
  return String(raw).startsWith('http') || String(raw).startsWith('data:image/') ? String(raw) : `data:image/png;base64,${raw}`;
};
const edit = async (env, row, report) => {
  const p = payload(row); const source = String(p.sourceImage || '').trim(); const instruction = String(p.prompt || row.prompt || '').trim();
  if (!/^https?:\/\//i.test(source) || !instruction) throw new Error('Invalid direct image edit payload');
  await report('dispatching', 'Dang gui anh tham chieu va yeu cau toi GPTi2 GPT Image 2.');
  const form = new FormData(); form.set('prompt', instruction); form.set('model', 'gpt-image-2'); form.set('size', gpti2Size(p.resolution, p.aspectRatio)); form.set('quality', 'low');
  const input = await fetch(source, { signal: AbortSignal.timeout(30000) }); if (!input.ok) throw new Error('Source image unavailable');
  form.append('image[]', await input.blob(), 'source.jpg');
  const response = await fetch('https://gpti2.store/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${env.GPTI2_API_KEY}` }, body: form, signal: AbortSignal.timeout(295000) });
  if (!response.ok) throw new Error(`GPTI2_ERROR: ${await response.text()}`);
  return gpti2Result(await response.json());
};
const persist = async (env, row, result) => {
  let type = 'image/png'; let body;
  if (result.startsWith('data:')) { const m = result.match(/^data:([^;]+);base64,(.+)$/s); if (!m) throw new Error('Invalid image result'); type = m[1]; const b = atob(m[2]); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i += 1) bytes[i] = b.charCodeAt(i); body = bytes; } else { const r = await fetch(result); if (!r.ok || !r.body) throw new Error('Result download failed'); type = r.headers.get('content-type') || type; body = r.body; }
  const key = `users/${encodeURIComponent(row.user_id)}/edited/${encodeURIComponent(row.id)}.png`; await env.RESULTS_BUCKET.put(key, body, { httpMetadata: { contentType: type } }); return `${String(env.R2_PUBLIC_URL).replace(/\/+$/, '')}/${key}`;
};
const processRows = async (env, rows) => { for (const row of rows) { let p = { ...payload(row), model: 'gpt-image-2', modelId: 'gpt-image-2' }; p = log(p, 'preparing', 'Cloudflare Worker da nhan job sua anh.'); try { const report = async (stage, message, level = 'info') => { p = log(p, stage, message, level); await update(env, row.id, { progress: stage === 'dispatching' ? 35 : 70, queue_payload: p }); }; await update(env, row.id, { queue_payload: p }); const result = await edit(env, row, report); const imageUrl = await persist(env, row, result); p = log(p, 'completed', 'Da luu anh da chinh sua vao R2.', 'success'); await update(env, row.id, { status: 'completed', progress: 100, image_url: imageUrl, finished_at: new Date().toISOString(), lease_token: null, lease_expires_at: null, queue_payload: p }); } catch (error) { p = log(p, 'failed', error instanceof Error ? error.message : String(error), 'error'); await update(env, row.id, { status: 'failed', progress: 0, error_message: error instanceof Error ? error.message : String(error), finished_at: new Date().toISOString(), lease_token: null, lease_expires_at: null, queue_payload: p }); await rpc(env, 'refund_generated_job', { p_generated_image_id: row.id, p_reason: `Refund: ${row.tool_name || 'direct image edit'} failed` }); } } return rows.length; };
const run = async (env) => { const configured = Number(env.DIRECT_EDIT_MAX_CONCURRENCY || 2); const batch = Math.max(1, Math.min(Number(env.CLOUDFLARE_QUEUE_BATCH || 4), Number.isFinite(configured) ? configured : 2)); const response = await rpc(env, 'claim_cloudflare_direct_edit_jobs', { p_limit: batch, p_lease_seconds: 900 }); if (!response.ok) throw new Error(`Claim failed (${response.status})`); const rows = await response.json(); return { claimed: await processRows(env, rows), limit: batch }; };
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-direct-edit-worker' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    if (!isAuthorizedWorkerRequest(request, env)) return json({ error: 'Unauthorized' }, 401);
    ctx.waitUntil(run(env).catch((error) => console.error('[direct-edit-worker]', error)));
    return json({ accepted: true }, 202);
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(run(env)); },
};
