import 'dotenv/config';

import { randomUUID } from 'node:crypto';

const TST_API_BASE = 'https://api.tramsangtao.com/v1';
const RUN_ID = `queue-hardening-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
const TEST_EMAIL_DOMAIN = 'audition.local';
const ALLOW_DB_WRITE = process.env.QUEUE_HARDENING_ALLOW_DB_WRITE === '1';
const ALLOW_ACTIVE_QUEUE = process.env.QUEUE_HARDENING_ALLOW_ACTIVE_QUEUE === '1';
const SKIP_CLEANUP = process.env.QUEUE_HARDENING_SKIP_CLEANUP === '1';

process.env.QUEUE_DISPATCH_CLAIM_LEASE_SECONDS ||= '30';
process.env.QUEUE_LIVE_CATALOG_VALIDATION_TIMEOUT_MS ||= '5000';
process.env.QUEUE_DISPATCH_CLAIM_LIMIT ||= '4';
process.env.QUEUE_POLL_CLAIM_LIMIT ||= '4';
process.env.QUEUE_DISPATCH_CONCURRENCY_LIMIT ||= '2';
process.env.QUEUE_POLL_CONCURRENCY_LIMIT ||= '2';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

const fail = (message, details) => {
  const error = new Error(message);
  error.details = details;
  throw error;
};

const assert = (condition, message, details) => {
  if (!condition) fail(message, details);
};

const log = (...args) => console.log('[queue-hardening]', ...args);

const installTstMock = () => {
  const realFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input?.url || '');

    if (url.startsWith(TST_API_BASE)) {
      if (url.includes('/jobs/mock-hardening-complete')) {
        return Response.json({
          status: 'completed',
          progress: 100,
          result_url: 'https://example.com/queue-hardening-result.png',
        });
      }

      if (url.endsWith('/models')) {
        return Response.json({
          models: [
            {
              model: 'image-gpt-2',
              name: 'Hardening Mock Image',
              type: 'image',
              servers: ['fast'],
              capabilities: {
                resolutions: ['1k'],
                slow_mode: true,
              },
            },
          ],
        });
      }

      if (url.endsWith('/models/pricing')) {
        return Response.json({
          pricing: [
            {
              model: 'image-gpt-2',
              server: 'fast',
              config_key: '1k-medium-fast',
              resolution: '1k',
              quality: 'medium',
              speed: 'fast',
              credits: 1,
            },
          ],
        });
      }

      if (String(init?.method || 'GET').toUpperCase() === 'POST') {
        return Response.json({
          job_id: `mock-hardening-submit-${randomUUID()}`,
          status: 'submitted',
        });
      }

      return Response.json({ status: 'processing', progress: 60 });
    }

    return realFetch(input, init);
  };
};

const createSupabase = async () => {
  const { getServiceRoleClient } = await import('../netlify/functions/_supabase.ts');
  return getServiceRoleClient();
};

const loadQueueRunners = async () => {
  const [{ runQueueWatchdog }, { runQueueWorker }] = await Promise.all([
    import('../netlify/functions/_queue-watchdog.ts'),
    import('../netlify/functions/_queue-worker.ts'),
  ]);

  return { runQueueWatchdog, runQueueWorker };
};

const cleanupOldHardeningRows = async (admin) => {
  const { data: oldUsers, error } = await admin
    .from('users')
    .select('id')
    .ilike('email', `queue-hardening+%@${TEST_EMAIL_DOMAIN}`);

  if (error) throw error;

  const userIds = (oldUsers || []).map((row) => row.id).filter(Boolean);
  if (userIds.length === 0) return;

  await admin.from('generated_images').delete().in('user_id', userIds);
  await admin.from('vcoin_transactions').delete().in('user_id', userIds);
  await admin.from('users').delete().in('id', userIds);
  log(`Cleaned ${userIds.length} previous hardening test users.`);
};

const assertNoActiveProductionQueue = async (admin) => {
  if (ALLOW_ACTIVE_QUEUE) {
    log('QUEUE_HARDENING_ALLOW_ACTIVE_QUEUE=1, active queue preflight is bypassed.');
    return;
  }

  const { count, error } = await admin
    .from('generated_images')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'processing'])
    .in('queue_kind', ['image_generate', 'video_generate', 'motion_generate']);

  if (error) throw error;

  assert(
    Number(count || 0) === 0,
    'Active queue is not empty. Refusing to run worker crash simulation against a live queue.',
    {
      activeQueueCount: count,
      fix: 'Run this on local/staging, or set QUEUE_HARDENING_ALLOW_ACTIVE_QUEUE=1 only when you intentionally accept that worker may claim existing jobs.',
    },
  );
};

const createUser = async (admin, label) => {
  const id = randomUUID();
  const { error } = await admin.from('users').insert({
    id,
    email: `queue-hardening+${label}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
    display_name: `Queue Hardening ${label}`,
    photo_url: '',
    vcoin_balance: 0,
    is_admin: false,
    is_vip: false,
    created_at: iso(),
    updated_at: iso(),
  });

  if (error) throw error;
  return id;
};

const basePayload = (stage, extra = {}) => ({
  __hardeningRunId: RUN_ID,
  __stage: stage,
  __logs: [
    {
      at: iso(-120_000),
      stage,
      level: 'info',
      message: `Hardening fixture staged at ${stage}`,
    },
  ],
  ...extra,
});

const imageRecipePayload = (stage, extra = {}) => ({
  recipeType: 'image_generate_recipe_v1',
  characterCount: 1,
  characterImages: ['https://example.com/reference.png'],
  referenceImages: [],
  sampleImage: '',
  styleImage: '',
  prompt: 'hardening test prompt',
  modelId: 'image-gpt-2',
  serverId: 'fast',
  resolution: '1k',
  quality: 'medium',
  speed: 'fast',
  aspectRatio: '1:1',
  __hardeningRunId: RUN_ID,
  __stage: stage,
  __logs: [
    {
      at: iso(-120_000),
      stage,
      level: 'info',
      message: `Hardening recipe staged at ${stage}`,
    },
  ],
  ...extra,
});

const createJob = async (admin, userId, overrides = {}) => {
  const id = randomUUID();
  const row = {
    id,
    user_id: userId,
    user_name: 'Queue Hardening',
    image_url: '',
    prompt: 'queue hardening test prompt',
    model_used: 'image-gpt-2',
    created_at: iso(-180_000),
    updated_at: iso(-120_000),
    is_public: false,
    tool_id: 'single_3d_character',
    tool_name: 'Queue Hardening Test',
    status: 'processing',
    job_id: null,
    progress: 5,
    error_message: null,
    cost_vcoin: 0,
    asset_type: 'image',
    queue_kind: 'image_generate',
    queue_payload: basePayload('preparing'),
    provider: 'tst',
    processing_started_at: iso(-180_000),
    finished_at: null,
    next_poll_at: null,
    lease_token: null,
    lease_expires_at: iso(600_000),
    attempt_count: 0,
    last_error_at: null,
    ...overrides,
  };

  const { error } = await admin.from('generated_images').insert(row);
  if (error) throw error;
  return id;
};

const getJob = async (admin, id) => {
  const { data, error } = await admin
    .from('generated_images')
    .select('id, status, job_id, image_url, progress, error_message, queue_payload, lease_expires_at, next_poll_at, updated_at')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
};

const runCase = async (name, fn) => {
  const startedAt = Date.now();
  try {
    const details = await fn();
    log(`PASS ${name} (${Date.now() - startedAt}ms)`, details || '');
    return { name, ok: true, details };
  } catch (error) {
    log(`FAIL ${name}: ${error.message}`, error.details || '');
    return { name, ok: false, error: error.message, details: error.details };
  }
};

const main = async () => {
  if (!ALLOW_DB_WRITE) {
    fail('Refusing to write test rows. Set QUEUE_HARDENING_ALLOW_DB_WRITE=1 to run this audit.');
  }

  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    fail('Missing SUPABASE_URL or VITE_SUPABASE_URL.');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('Missing SUPABASE_SERVICE_ROLE_KEY.');
  }

  process.env.TST_API_KEY ||= 'queue-hardening-mock-key';
  installTstMock();

  const admin = await createSupabase();
  const { runQueueWatchdog, runQueueWorker } = await loadQueueRunners();

  await cleanupOldHardeningRows(admin);
  await assertNoActiveProductionQueue(admin);

  const createdUserIds = [];
  const createMarkedUser = async (label) => {
    const id = await createUser(admin, label);
    createdUserIds.push(id);
    return id;
  };

  const results = [];

  results.push(await runCase('watchdog requeues stale preparing job before provider touch', async () => {
    const userId = await createMarkedUser('watchdog-requeue');
    const jobId = await createJob(admin, userId, {
      queue_payload: basePayload('preparing'),
      updated_at: iso(-120_000),
      lease_expires_at: iso(600_000),
    });

    const summary = await runQueueWatchdog({ runWorkerAfterRescue: false });
    const job = await getJob(admin, jobId);

    assert(job.status === 'queued', 'Expected stale pre-dispatch job to return to queued.', { summary, job });
    assert(!job.job_id, 'Expected no provider job id after requeue.', { job });
    assert(job.queue_payload?.__stage === 'queued', 'Expected payload stage queued after rescue.', { job });
    return { summary };
  }));

  results.push(await runCase('watchdog fails/refunds risky dispatching job without provider id', async () => {
    const userId = await createMarkedUser('watchdog-fail-risk');
    const jobId = await createJob(admin, userId, {
      queue_payload: basePayload('dispatching', {
        __tstTouched: true,
        __dispatchConfirmationPending: true,
      }),
      updated_at: iso(-180_000),
      lease_expires_at: iso(-60_000),
    });

    const summary = await runQueueWatchdog({ runWorkerAfterRescue: false });
    const job = await getJob(admin, jobId);

    assert(job.status === 'failed', 'Expected risky dispatching job to fail instead of duplicate-dispatching.', { summary, job });
    assert(job.queue_payload?.__stage === 'failed', 'Expected payload stage failed.', { job });
    return { summary };
  }));

  results.push(await runCase('watchdog nudges overdue provider poll', async () => {
    const userId = await createMarkedUser('watchdog-nudge-poll');
    const jobId = await createJob(admin, userId, {
      status: 'processing',
      job_id: 'mock-hardening-waiting',
      progress: 60,
      queue_payload: basePayload('submitted'),
      next_poll_at: iso(-300_000),
      lease_expires_at: iso(-120_000),
      updated_at: iso(-300_000),
    });

    const summary = await runQueueWatchdog({ runWorkerAfterRescue: false });
    const job = await getJob(admin, jobId);

    assert(job.status === 'processing', 'Expected poll job to remain processing.', { summary, job });
    assert(!job.lease_expires_at, 'Expected overdue poll lease to be cleared.', { job });
    assert(new Date(job.next_poll_at).getTime() > Date.now() - 60_000, 'Expected next_poll_at to be moved to now.', { job });
    return { summary };
  }));

  results.push(await runCase('worker recovers stale staged recipe without dispatching while capacity is full', async () => {
    const fillerUserIds = [];
    for (let index = 0; index < 4; index += 1) {
      const fillerUserId = await createMarkedUser(`filler-${index}`);
      fillerUserIds.push(fillerUserId);
      await createJob(admin, fillerUserId, {
        status: 'processing',
        job_id: `mock-hardening-filler-${index}`,
        progress: 60,
        queue_payload: basePayload('submitted'),
        next_poll_at: iso(600_000),
        lease_expires_at: iso(600_000),
        updated_at: iso(),
      });
    }

    const userId = await createMarkedUser('worker-staged-recovery');
    const jobId = await createJob(admin, userId, {
      queue_payload: imageRecipePayload('uploading_refs'),
      updated_at: iso(-120_000),
      lease_expires_at: iso(-60_000),
      processing_started_at: iso(-180_000),
    });

    const summary = await runQueueWorker({ lane: 'dispatch' });
    const job = await getJob(admin, jobId);

    assert(job.status === 'queued', 'Expected worker recovery to put stale staged recipe back to queued.', { summary, job });
    assert(!job.job_id, 'Expected worker recovery not to create provider job id.', { job });
    return { summary, fillerUserIds };
  }));

  results.push(await runCase('worker poll completes provider job with mocked TST response', async () => {
    const userId = await createMarkedUser('worker-poll-complete');
    const jobId = await createJob(admin, userId, {
      status: 'processing',
      job_id: 'mock-hardening-complete',
      progress: 60,
      queue_payload: basePayload('submitted'),
      next_poll_at: iso(-60_000),
      lease_expires_at: iso(-60_000),
      updated_at: iso(-120_000),
    });

    const summary = await runQueueWorker({ lane: 'poll' });
    const job = await getJob(admin, jobId);

    assert(job.status === 'completed', 'Expected poll worker to complete mocked provider job.', { summary, job });
    assert(job.image_url === 'https://example.com/queue-hardening-result.png', 'Expected result URL persisted.', { job });
    return { summary };
  }));

  const failed = results.filter((result) => !result.ok);

  if (!SKIP_CLEANUP && createdUserIds.length > 0) {
    await admin.from('generated_images').delete().in('user_id', createdUserIds);
    await admin.from('vcoin_transactions').delete().in('user_id', createdUserIds);
    await admin.from('users').delete().in('id', createdUserIds);
    log(`Cleaned ${createdUserIds.length} test users for ${RUN_ID}.`);
  }

  if (failed.length > 0) {
    console.error(JSON.stringify({ ok: false, runId: RUN_ID, failed, results }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ ok: true, runId: RUN_ID, results }, null, 2));
};

main().catch((error) => {
  console.error('[queue-hardening] Fatal:', error.message);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exitCode = 1;
});
