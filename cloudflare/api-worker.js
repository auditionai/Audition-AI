// Public API edge for the lanes that used to depend on Netlify Functions.
// Bind this Worker to /api/* on the production hostname.
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-audition-device-key, x-secret-key, x-cron-secret', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
const withCors = (response) => { const headers = new Headers(response.headers); Object.entries(cors).forEach(([key, value]) => headers.set(key, value)); return new Response(response.body, { status: response.status, headers }); };
const text = (env, key) => String(env[key] || '').trim();
const serviceHeaders = (env, extra = {}) => ({ apikey: text(env, 'SUPABASE_SERVICE_ROLE_KEY'), authorization: `Bearer ${text(env, 'SUPABASE_SERVICE_ROLE_KEY')}`, 'content-type': 'application/json', ...extra });
const db = (env, path, init = {}) => fetch(`${text(env, 'SUPABASE_URL')}/rest/v1/${path}`, { ...init, headers: serviceHeaders(env, init.headers || {}) });
const rpc = async (env, name, body) => { const response = await fetch(`${text(env, 'SUPABASE_URL')}/rest/v1/rpc/${name}`, { method: 'POST', headers: serviceHeaders(env), body: JSON.stringify(body) }); if (!response.ok) throw new Error(`Supabase RPC ${name} failed (${response.status}): ${await response.text()}`); return response.json().catch(() => null); };
const timingSafeEqual = async (left, right) => { const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right); if (a.byteLength !== b.byteLength) return false; const key = await crypto.subtle.importKey('raw', a, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const one = await crypto.subtle.sign('HMAC', key, a); const two = await crypto.subtle.sign('HMAC', key, b); return crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(one, two) : one.byteLength === two.byteLength && new Uint8Array(one).every((value, index) => value === new Uint8Array(two)[index]); };

const requireUser = async (request, env, admin = false) => {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const response = await fetch(`${text(env, 'SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: text(env, 'SUPABASE_ANON_KEY'), authorization } });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  if (admin) {
    const profile = await db(env, `users?id=eq.${encodeURIComponent(user.id)}&select=is_admin,account_status`).then((r) => r.json());
    if (profile?.[0]?.account_status === 'locked') throw Object.assign(new Error('AccountLocked'), { status: 403 });
    if (profile?.[0]?.is_admin !== true) throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return user;
};
const requiredSecret = async (request, env, name, header) => {
  const expected = text(env, name); const actual = request.headers.get(header) || '';
  if (!expected || !(await timingSafeEqual(expected, actual))) throw Object.assign(new Error('Unauthorized'), { status: 401 });
};
const cleanSegment = (value) => String(value || '').normalize('NFKD').replace(/[^\w./-]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[/.-]+|[/.-]+$/g, '').slice(0, 180);
const extensionFor = (type) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' })[String(type).split(';', 1)[0].toLowerCase()] || 'bin';
const r2KeyFromUrl = (env, value) => { const base = text(env, 'R2_PUBLIC_URL').replace(/\/+$/, ''); const asset = String(value || ''); return base && asset.startsWith(`${base}/`) ? decodeURIComponent(asset.slice(base.length + 1)) : ''; };
const safeUrl = (value) => { const url = new URL(value); const host = url.hostname.toLowerCase(); if (url.protocol !== 'https:' || url.username || url.password || url.port || host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '::1') throw new Error('Remote asset URL is not allowed'); return url; };
const fetchSafe = async (value) => { let url = safeUrl(value); for (let hop = 0; hop < 4; hop += 1) { const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120000) }); if (response.status < 300 || response.status > 399) return response; const location = response.headers.get('location'); if (!location) throw new Error('Remote asset redirect is invalid'); url = safeUrl(new URL(location, url).toString()); } throw new Error('Remote asset exceeded redirect limit'); };
const proxyToNetlify = (request, env) => {
  const origin = new URL(text(env, 'NETLIFY_API_ORIGIN') || 'https://audition-ai.netlify.app');
  if (origin.protocol !== 'https:') throw new Error('NETLIFY_API_ORIGIN must use HTTPS');
  const target = new URL(request.url);
  target.protocol = origin.protocol;
  target.host = origin.host;
  // This is a compatibility bridge during incremental migration: requests
  // already handled above remain edge-native; all other /api routes retain
  // their established Netlify Function implementation.
  return fetch(new Request(target, request));
};

const sepayConfig = (env) => { const merchant = text(env, 'SEPAY_MERCHANT_ID'); const secret = text(env, 'SEPAY_SECRET_KEY'); if (!merchant || !secret) throw new Error('Missing SePay environment variables'); return { merchant, secret, token: text(env, 'SEPAY_API_TOKEN') || text(env, 'SEPAY_USER_API_TOKEN'), sandbox: text(env, 'SEPAY_ENV') === 'sandbox' }; };
const sepayStatus = (payload) => { const raw = String(payload?.data?.order_status || payload?.data?.status || payload?.order?.order_status || payload?.order_status || payload?.status || payload?.transaction?.transaction_status || '').toUpperCase(); return ['PAID','SUCCESS','SUCCEEDED','COMPLETED','APPROVED','CAPTURED','SETTLED'].includes(raw) ? 'PAID' : ['CANCELLED','CANCELED','VOIDED'].includes(raw) ? 'CANCELLED' : ['FAILED','ERROR','EXPIRED','REJECTED'].includes(raw) ? 'FAILED' : raw || 'PENDING'; };
const sepayOrderCode = (payload) => String(payload?.order?.order_invoice_number || payload?.order_invoice_number || payload?.data?.order_invoice_number || payload?.custom_data?.orderCode || '').trim();
const sepayAmount = (payload) => { const value = payload?.order?.order_amount ?? payload?.data?.order_amount ?? payload?.transaction?.transaction_amount ?? payload?.amount_in ?? payload?.amount; const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : null; };
const settleSePay = async (env, tx, payload, source) => {
  const status = sepayStatus(payload); const amount = sepayAmount(payload);
  if (status === 'PAID' && amount != null && amount !== Number(tx.amount_vnd)) throw new Error('Amount mismatch');
  const result = await rpc(env, 'settle_payment_transaction_by_id', { p_transaction_id: tx.id, p_provider_status: status, p_provider_payload: { gateway: 'sepay', source, reconciled_at: new Date().toISOString(), ...payload } });
  if (status === 'PAID') await rpc(env, 'mark_topup_giftcode_applied', { p_transaction_id: tx.id }).catch((error) => { if (!/function|schema|topup_gift_code/i.test(error.message)) throw error; });
  return result;
};
const reconcileSePay = async (env, limit = 10) => {
  const config = sepayConfig(env); if (!config.token) throw new Error('Missing SEPAY_API_TOKEN');
  const before = new Date(Date.now() - 60000).toISOString(); const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const list = await db(env, `payment_transactions?select=id,amount_vnd,order_code,provider_order_code,status,created_at&status=in.(pending,cancelled,failed)&created_at=gte.${encodeURIComponent(since)}&created_at=lte.${encodeURIComponent(before)}&order=created_at.desc&limit=${Math.min(Math.max(Number(limit) || 10, 1), 100)}`);
  if (!list.ok) throw new Error(`Unable to list payments (${list.status})`); const transactions = await list.json(); const base = config.sandbox ? 'https://pgapi-sandbox.sepay.vn/v1' : 'https://pgapi.sepay.vn/v1'; const auth = `Basic ${btoa(`${config.merchant}:${config.secret}`)}`; const results = [];
  for (const tx of transactions) { const code = String(tx.provider_order_code || tx.order_code || ''); if (!code) { results.push({ id: tx.id, skipped: 'missing_order_code' }); continue; } const response = await fetch(`${base}/order/detail/${encodeURIComponent(code)}`, { headers: { authorization: auth }, signal: AbortSignal.timeout(8000) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { results.push({ id: tx.id, status: response.status, settled: false }); continue; } if (sepayStatus(payload) === 'PAID') { await settleSePay(env, tx, payload, 'order_detail_api'); results.push({ id: tx.id, settled: true }); } else results.push({ id: tx.id, settled: false, status: sepayStatus(payload) }); }
  return { checked: transactions.length, settled: results.filter((item) => item.settled).length, results };
};

const runWatchdog = async (env) => {
  const result = {
    stale: await rpc(env, 'repair_stale_generated_queue_jobs', { p_pre_dispatch_grace_seconds: 15, p_max_recoveries: 8, p_max_pre_dispatch_age_minutes: 30, p_overdue_poll_grace_seconds: 120 }),
    cleanup: await rpc(env, 'cleanup_expired_operational_history', { p_limit: 100, p_retention_days: 7 }),
  };
  // Permit a safe staged API deployment before SePay credentials are copied.
  // Once all three are present, reconciliation becomes part of every cron run.
  if (text(env, 'SEPAY_MERCHANT_ID') && text(env, 'SEPAY_SECRET_KEY') && text(env, 'SEPAY_API_TOKEN')) {
    result.payments = await reconcileSePay(env, Number(text(env, 'SEPAY_RECONCILE_LIMIT') || 10));
  }
  return result;
};

const uploadTst = async (request, env, kind) => { await requireUser(request, env, true); const response = await fetch(`https://api.tramsangtao.com/v1/files/upload/${kind}`, { method: 'POST', headers: { authorization: `Bearer ${text(env, 'TST_API_KEY')}`, 'content-type': request.headers.get('content-type') || '' }, body: request.body, signal: AbortSignal.timeout(120000) }); return new Response(response.body, { status: response.status, headers: { 'content-type': response.headers.get('content-type') || 'application/json' } }); };
const submitVideoScript = async (request, env) => { const user = await requireUser(request, env); const payload = await request.json(); const created = await db(env, 'video_script_jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, request_payload: payload }) }); const rows = await created.json(); if (!created.ok || !rows?.[0]?.id) throw new Error('VIDEO_SCRIPT_JOB_CREATE_FAILED'); const id = rows[0].id; const worker = text(env, 'VIDEO_SCRIPT_WORKER_URL'); const secret = text(env, 'VIDEO_SCRIPT_WORKER_SECRET'); if (!worker || !secret) throw new Error('VIDEO_SCRIPT_WORKER_URL is not configured'); const wake = await fetch(worker, { method: 'POST', headers: { 'content-type': 'application/json', 'x-worker-secret': secret }, body: JSON.stringify({ jobId: id }) }); if (!wake.ok) throw new Error(`VIDEO_SCRIPT_WORKER_LAUNCH_FAILED (${wake.status})`); return json({ jobId: id, status: 'queued' }, 202); };

async function handle(request, env, ctx) {
  const url = new URL(request.url); const path = url.pathname.replace(/^\/api\/?/, '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === 'health') return json({ ok: true, worker: 'auditionai-api-worker' });
  if (path === 'sepay-checkout' && request.method === 'GET') { const raw = url.searchParams.get('payload') || ''; const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)))); const checkout = String(payload.checkoutUrl || ''); if (!/^https:\/\/pay(?:-sandbox)?\.sepay\.vn\//.test(checkout) || !payload.fields || typeof payload.fields !== 'object') return new Response('Invalid SePay checkout payload', { status: 400 }); const escaped = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); const fields = Object.entries(payload.fields).map(([key, value]) => `<input type="hidden" name="${escaped(key)}" value="${escaped(value)}">`).join(''); return new Response(`<!doctype html><meta charset="utf-8"><form id="p" method="post" action="${escaped(checkout)}">${fields}</form><script>p.submit()</script>`, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
  if ((path === 'sepay-ipn' || path === 'sepay-webhook')) { if (request.method === 'GET') return json({ success: true, message: 'SePay IPN endpoint is ready' }); if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405); await requiredSecret(request, env, 'SEPAY_SECRET_KEY', 'x-secret-key'); const payload = await request.json(); const code = sepayOrderCode(payload); const amount = sepayAmount(payload); const filter = code ? `or=(provider_order_code.eq.${encodeURIComponent(code)},order_code.eq.${encodeURIComponent(code)})` : `amount_vnd=eq.${amount ?? -1}`; const response = await db(env, `payment_transactions?select=id,amount_vnd,status&${filter}&order=created_at.desc&limit=1`); const rows = await response.json(); if (!rows?.[0]) return json({ success: true, ignored: true, reason: 'Unknown orderCode', orderCode: code }); return json({ success: true, data: await settleSePay(env, rows[0], payload, 'checkout_ipn') }); }
  if (path === 'sepay-reconcile-pending') { await requiredSecret(request, env, 'SEPAY_RECONCILE_SECRET', 'x-cron-secret'); return json(await reconcileSePay(env, Number(url.searchParams.get('limit') || 10))); }
  if (path === 'operations') { await requiredSecret(request, env, 'OPERATIONS_WORKER_SECRET', 'x-worker-secret'); ctx.waitUntil(runWatchdog(env).catch((error) => console.error(JSON.stringify({ lane: 'watchdog', error: error.message })))); return json({ accepted: true }, 202); }
  if (path === 'video-script-submit' && request.method === 'POST') return submitVideoScript(request, env);
  if (path === 'video-script-status' && request.method === 'GET') { const user = await requireUser(request, env); const id = url.searchParams.get('id') || ''; const response = await db(env, `video_script_jobs?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&select=status,script,error_message`); const rows = await response.json(); return rows?.[0] ? json({ status: rows[0].status, script: rows[0].script || null, error: rows[0].error_message || null }) : json({ error: 'Video script job not found.' }, 404); }
  if (path === 'tst-upload' && request.method === 'POST') return uploadTst(request, env, 'image');
  if (path === 'tst-upload-video' && request.method === 'POST') return uploadTst(request, env, 'video');
  if (path === 'storage-upload-url') { const user = await requireUser(request, env); if (request.method === 'GET') return json({ ready: true, provider: 'cloudflare-r2' }); if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405); const body = await request.json(); const type = String(body.contentType || '').toLowerCase(); if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(type)) return json({ error: 'Unsupported file type' }, 400); const key = `users/${user.id}/${cleanSegment(body.folder) || 'inputs'}/${Date.now()}-${crypto.randomUUID()}.${extensionFor(type)}`; return json({ provider: 'cloudflare-r2', uploadUrl: `${url.origin}/api/storage-upload?key=${encodeURIComponent(key)}`, publicUrl: `${text(env, 'R2_PUBLIC_URL').replace(/\/+$/, '')}/${key}`, expiresIn: 300 }); }
  if (path === 'storage-upload' && request.method === 'PUT') { const user = await requireUser(request, env); const key = url.searchParams.get('key') || ''; if (!key.startsWith(`users/${user.id}/`) || !/^users\/[\w-]+\/[\w./-]+\.(png|jpg|jpeg|webp|gif|mp4|mov|webm|bin)$/i.test(key)) return json({ error: 'Invalid storage key' }, 400); const length = Number(request.headers.get('content-length') || 0); if (length > 50 * 1024 * 1024) return json({ error: 'File too large' }, 413); await env.RESULTS_BUCKET.put(key, request.body, { httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' } }); return new Response(null, { status: 204 }); }
  if (path === 'storage-delete' && request.method === 'POST') { const user = await requireUser(request, env); const { imageId } = await request.json(); const result = await db(env, `generated_images?id=eq.${encodeURIComponent(String(imageId || ''))}&select=id,user_id,image_url`); const rows = await result.json(); const image = rows?.[0]; if (!image) return json({ error: 'Not found' }, 404); if (image.user_id !== user.id) { await requireUser(request, env, true); } const key = r2KeyFromUrl(env, image.image_url); if (key) await env.RESULTS_BUCKET.delete(key); const deleted = await db(env, `generated_images?id=eq.${encodeURIComponent(image.id)}`, { method: 'DELETE' }); if (!deleted.ok) throw new Error('Unable to delete image metadata'); return json({ success: true }); }
  if (path === 'download-proxy' && request.method === 'GET') { await requireUser(request, env); const upstream = await fetchSafe(url.searchParams.get('url') || ''); if (!upstream.ok || !upstream.body) return json({ error: `Failed to fetch asset: ${upstream.status}` }, upstream.status || 502); const filename = String(url.searchParams.get('filename') || new URL(url.searchParams.get('url')).pathname.split('/').pop() || 'download').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').slice(0, 180); return new Response(upstream.body, { headers: { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'private, no-store' } }); }
  if (path === 'admin-r2-cleanup' && request.method === 'POST') { await requireUser(request, env, true); const body = await request.json(); const prefix = String(body.prefix || '').replace(/^\/+/, ''); if (!prefix) return json({ error: 'A prefix is required for a bounded R2 cleanup.' }, 400); const start = new Date(`${body.startDate}T00:00:00.000Z`); const end = new Date(`${body.endDate}T00:00:00.000Z`); end.setUTCDate(end.getUTCDate() + 1); if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return json({ error: 'Invalid date range' }, 400); const listed = await env.RESULTS_BUCKET.list({ prefix, limit: 1000 }); const keys = listed.objects.filter((item) => item.uploaded >= start && item.uploaded < end).slice(0, 500).map((item) => item.key); const dryRun = body.dryRun !== false; if (!dryRun && keys.length) await env.RESULTS_BUCKET.delete(keys); return json({ success: true, dryRun, matched: keys.length, deleted: dryRun ? 0 : keys.length, truncated: listed.truncated, samples: keys.slice(0, 20) }); }
  return proxyToNetlify(request, env);
}

export default { async fetch(request, env, ctx) { try { return withCors(await handle(request, env, ctx)); } catch (error) { const status = Number(error?.status) || 500; console.error(JSON.stringify({ worker: 'api', path: new URL(request.url).pathname, status, error: error instanceof Error ? error.message : String(error) })); return withCors(json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, status)); } }, async scheduled(_event, env, ctx) { ctx.waitUntil(runWatchdog(env).catch((error) => console.error(JSON.stringify({ lane: 'watchdog', error: error.message })))); } };
