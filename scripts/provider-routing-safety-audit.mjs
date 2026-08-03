import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { isGommoModelAvailable } from '../netlify/functions/_gommo-provider.ts';
import { sortTstFallbackServers } from '../netlify/functions/_queue-worker.ts';
import { buildLocalPricingOptionCandidates } from '../netlify/functions/queue-submit.ts';

const gptOptions = buildLocalPricingOptionCandidates({
  model: 'image-gpt-2',
  resolution: '1k',
  quality: 'medium',
  speed: 'fast',
});
assert.equal(gptOptions[0], '1k-medium-fast');

const nanoOptions = buildLocalPricingOptionCandidates({
  model: 'nano-banana-2',
  resolution: '2k',
  speed: 'fast',
});
assert(nanoOptions.includes('2k-fast'));

const videoOptions = buildLocalPricingOptionCandidates({
  model: 'seedance-2.0-fast',
  resolution: '720p',
  duration: '10s',
  speed: 'fast',
  audio: true,
});
assert.equal(videoOptions[0], '720p-10s-audio-fast');

const grokOptions = buildLocalPricingOptionCandidates({
  model: 'grok-i2v',
  resolution: '720p',
  duration: '6s',
  speed: 'standard',
});
assert(grokOptions.includes('720p-6-standard'));

assert.deepEqual(
  sortTstFallbackServers(['vip3', 'vip2', 'fast', 'vip1', 'custom']),
  ['fast', 'vip1', 'vip2', 'vip3', 'custom'],
);
assert.equal(isGommoModelAvailable({ model: 'test', name: 'Test', status: 'unavailable' }), false);
assert.equal(isGommoModelAvailable({ model: 'test', name: 'Test', status: 'on' }), true);

const workerSource = await readFile(new URL('../netlify/functions/_queue-worker.ts', import.meta.url), 'utf8');
assert(workerSource.includes(".contains('queue_payload', { __dispatchAttemptId: dispatchAttemptId })"));
assert.equal((workerSource.match(/return summary;/g) || []).length, 1);

const migrationSource = await readFile(new URL('./supabase_fix_queue_provider_safety.sql', import.meta.url), 'utf8');
assert(migrationSource.includes("raise exception 'ACCOUNT_LOCKED'"));
assert(!migrationSource.includes('Refund: enqueue failed'));
assert(migrationSource.includes('from public, anon, authenticated'));
assert(migrationSource.includes('to service_role'));

console.log('Provider routing safety audit passed.');
