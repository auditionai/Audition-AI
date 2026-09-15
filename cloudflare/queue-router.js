const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-queue-router' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    // Netlify holds the queue wake secret. The service-role key is only for
    // database access inside consumers and must never be used as an HTTP key.
    const expected = String(env.QUEUE_WORKER_SECRET || '').trim();
    if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return json({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => null);
    const jobId = String(body?.jobId || '').trim();
    const provider = String(body?.provider || '').trim().toLowerCase();
    const queue = provider.startsWith('gpti2_') ? env.ROUTER_QUEUE_GPTI2 : provider.startsWith('tst_') ? env.ROUTER_QUEUE_TST : null;
    if (!/^[0-9a-f-]{36}$/i.test(jobId) || !queue || !['gpti2_image', 'gpti2_edit', 'tst_image', 'tst_video', 'tst_edit'].includes(provider)) {
      return json({ error: 'Invalid queue wake request' }, 400);
    }
    await queue.send({ jobId, action: 'dispatch', provider, requestedAt: new Date().toISOString() });
    return json({ accepted: true }, 202);
  },
};
