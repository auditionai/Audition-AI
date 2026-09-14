const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-queue-router' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    const expected = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return json({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => null);
    const jobId = String(body?.jobId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(jobId) || String(body?.provider || '').toLowerCase() !== 'gpti2') {
      return json({ error: 'Invalid GPTi2 queue wake request' }, 400);
    }
    await env.GPTI2_JOBS.send({ jobId, requestedAt: new Date().toISOString() });
    return json({ accepted: true }, 202);
  },
};
