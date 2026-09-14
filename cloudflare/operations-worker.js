const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const h = (env) => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' });
const isAuthorizedWorkerRequest = (request, env) => {
  const expected = String(env.OPERATIONS_WORKER_SECRET || '').trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}` || request.headers.get('x-worker-secret') === expected;
};
const rpc = (env, name, body = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: h(env), body: JSON.stringify(body) });
const run = async (env) => {
  const result = {};
  for (const [name, body] of [
    ['repair_stale_generated_queue_jobs', { p_pre_dispatch_grace_seconds: 15, p_max_recoveries: 8, p_max_pre_dispatch_age_minutes: 30, p_overdue_poll_grace_seconds: 120 }],
    ['cleanup_expired_operational_history', { p_limit: 100, p_retention_days: 7 }],
  ]) {
    const response = await rpc(env, name, body);
    result[name] = response.ok ? await response.json() : { error: response.status, detail: await response.text() };
  }
  return result;
};
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-operations-worker' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    if (!isAuthorizedWorkerRequest(request, env)) return json({ error: 'Unauthorized' }, 401);
    ctx.waitUntil(run(env).catch((error) => console.error('[operations-worker]', error)));
    return json({ accepted: true }, 202);
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(run(env)); },
};
