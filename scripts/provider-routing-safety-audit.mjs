import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { isGommoModelAvailable } from '../netlify/functions/_gommo-provider.ts';
import { sortTstFallbackServers } from '../netlify/functions/_queue-worker.ts';
import { buildLocalPricingOptionCandidates } from '../netlify/functions/queue-submit.ts';
import { getAuditionProviderPricing, getGommoPricingInput, resolveProviderForModel } from '../services/providerCatalog.ts';
import { getAllowedModelsForFeature, inferGenerationProviderRouteKey, isModelAllowedForFeature } from '../shared/providerRouting.ts';
import { getGommoServerGroups, getGommoServerIdForMode, getPreferredGommoBasicMode } from '../shared/gommoServerRouting.ts';
import { getVideoModelPresentation } from '../shared/videoModelPresentation.ts';

const gommoGptServerModel = {
  server: 'openai',
  model: 'imagegen_2_0',
  modes: [
    { type: 'low', name: 'Low', group: 'Premium Server', groupSubtitle: 'Trực tiếp OpenAI' },
    { type: 'low_basic', name: 'Low', group: 'Basic Server', groupSubtitle: 'Tối ưu chi phí' },
  ],
};
assert.equal(getGommoServerIdForMode(gommoGptServerModel, 'low'), 'premium-server');
assert.equal(getGommoServerIdForMode(gommoGptServerModel, 'low_basic'), 'basic-server');
assert.deepEqual(getGommoServerGroups(gommoGptServerModel).map((group) => group.label), ['Premium Server', 'Basic Server']);
assert.equal(getPreferredGommoBasicMode(['low', 'low_basic', 'medium_basic'], 'medium'), 'medium_basic');

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

const gommoOptions = buildLocalPricingOptionCandidates({
  model: 'image-gpt-2',
  resolution: '2k',
  provider_mode: 'medium_basic',
});
assert.equal(gommoOptions[0], '2k-medium_basic');

const samplePricing = [
  { model_id: 'image-gpt-2', option_id: '1k-low-fast', audition_price_vcoin: 5 },
  { model_id: 'image-gpt-2', option_id: 'default', audition_price_vcoin: 10 },
];
assert.deepEqual(
  getAuditionProviderPricing(
    samplePricing,
    'image-gpt-2',
    getGommoPricingInput('image-gpt-2', { resolution: '1k', providerMode: 'low_basic' }),
    { allowGenericFallback: false },
  ),
  { optionId: '1k-low-fast', vcoin: 5 },
);
assert.equal(
  getAuditionProviderPricing(
    samplePricing,
    'image-gpt-2',
    getGommoPricingInput('image-gpt-2', { resolution: '8k', providerMode: 'low_basic' }),
    { allowGenericFallback: false },
  ),
  null,
);
assert.deepEqual(
  getAuditionProviderPricing(
    samplePricing,
    'image-gpt-2',
    getGommoPricingInput('image-gpt-2', { resolution: '8k', providerMode: 'low_basic' }),
    { allowGenericFallback: true },
  ),
  { optionId: 'default', vcoin: 10 },
);

assert.deepEqual(
  sortTstFallbackServers(['vip3', 'vip2', 'fast', 'vip1', 'custom']),
  ['fast', 'vip1', 'vip2', 'vip3', 'custom'],
);
assert.equal(isGommoModelAvailable({ model: 'test', name: 'Test', status: 'unavailable' }), false);
assert.equal(isGommoModelAvailable({ model: 'test', name: 'Test', status: 'on' }), true);
assert.equal(inferGenerationProviderRouteKey({ queueKind: 'image_generate', queuePayload: { recipeType: 'image_generate_recipe_v1', characterCount: 8 } }), 'image_group_8');
assert.equal(inferGenerationProviderRouteKey({ queueKind: 'video_generate', queuePayload: {} }), 'video_generation');
assert.deepEqual(getAllowedModelsForFeature(null, 'image_group_8'), ['image-gpt-2']);
assert.equal(isModelAllowedForFeature(null, 'image_group_8', 'nano-banana-2'), false);
assert.equal(isModelAllowedForFeature({ allowedModelsByFeature: { image_group_8: ['*'] } }, 'image_group_8', 'nano-banana-2'), true);
assert.equal(isModelAllowedForFeature({ allowedModelsByFeature: { image_single: ['nano-banana-pro'] } }, 'image_single', 'image-gpt-2'), false);
assert.match(getVideoModelPresentation({ id: 'kling-2.5-turbo' })?.description || '', /tốc độ và chi phí/);
assert.match(getVideoModelPresentation({ id: 'kling-2.6' })?.description || '', /âm thanh gốc/);
assert.match(getVideoModelPresentation({ id: 'kling-3.0-video' })?.description || '', /nhiều phân đoạn/);
assert.match(getVideoModelPresentation({ id: 'kling-o1-video' })?.description || '', /nhiều loại tham chiếu/);
assert.notDeepEqual(
  getVideoModelPresentation({ id: 'kling-2.5-turbo' })?.tags,
  getVideoModelPresentation({ id: 'kling-3.0-video' })?.tags,
);
assert.equal(resolveProviderForModel({ provider: 'tst', providerByModel: { 'image-gpt-2': 'tst' }, providerByFeature: {}, smartFallbackEnabled: true }, 'image-gpt-2', 'image_group_8'), 'gommo');
assert.equal(resolveProviderForModel({ provider: 'tst', providerByModel: {}, providerByFeature: { image_single: 'gommo' }, smartFallbackEnabled: true }, 'image-gpt-2', 'image_single'), 'gommo');

const workerSource = await readFile(new URL('../netlify/functions/_queue-worker.ts', import.meta.url), 'utf8');
assert(workerSource.includes(".contains('queue_payload', { __dispatchAttemptId: dispatchAttemptId })"));
assert.equal((workerSource.match(/return summary;/g) || []).length, 1);
assert(workerSource.includes('providerByFeature'));

const gommoSource = await readFile(new URL('../netlify/functions/_gommo-provider.ts', import.meta.url), 'utf8');
assert(gommoSource.includes('resolution: providerPayload.resolution'));
assert(gommoSource.includes('normalizeAndValidateGommoPayload'));
assert(gommoSource.includes("'https://v2.api.gommo.net'"));
assert(gommoSource.includes('Authorization: `Bearer ${credentials.access_token}`'));
assert(gommoSource.includes('/ai/jobs/image/${encodeURIComponent(mapping.gommoModelId)}'));
assert(gommoSource.includes('/ai/jobs/${encodeURIComponent(providerJobId)}?media=${media}'));
assert(gommoSource.includes("model.withSubject ? 'subjects' : model.withReference ? 'references' : 'images'"));
assert(gommoSource.includes('maxReferenceImages'));
assert(gommoSource.includes('GOMMO_SERVER_DISABLED'));
assert(gommoSource.includes("isProviderServerAllowedByConfig('gommo'"));
assert(gommoSource.includes('getGommoServerIdForMode(normalized.model, mode)'));

const tstCatalogSource = await readFile(new URL('../services/tstCatalog.ts', import.meta.url), 'utf8');
assert(tstCatalogSource.includes("String(entry.key || entry.config_key || '')"));
assert(tstCatalogSource.includes("'image-gpt-2': ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']"));

const tstServerCatalogSource = await readFile(new URL('../netlify/functions/_tst-live-catalog.ts', import.meta.url), 'utf8');
assert(tstServerCatalogSource.includes('data.models.map(enrichTstProviderModel)'));
assert(tstServerCatalogSource.includes('key: configKey'));

for (const filename of ['tst-generate.ts', 'tst-video-generate.ts', 'tst-motion-generate.ts']) {
  const source = await readFile(new URL(`../netlify/functions/${filename}`, import.meta.url), 'utf8');
  assert(source.includes('validateQueuePayloadAgainstLiveCatalog'));
}
const tstPollSource = await readFile(new URL('../netlify/functions/tst-poll.ts', import.meta.url), 'utf8');
assert(tstPollSource.includes('encodeURIComponent(jobId)'));

const queueSubmitSource = await readFile(new URL('../netlify/functions/queue-submit.ts', import.meta.url), 'utf8');
assert(queueSubmitSource.includes('Math.min(8, characterCount'));
assert(queueSubmitSource.includes('__providerRouteKey'));
assert(queueSubmitSource.includes('sampleImage: null'));
assert(queueSubmitSource.includes('MODEL_NOT_ALLOWED_FOR_FEATURE'));
assert(queueSubmitSource.includes('GOMMO_SERVER_DISABLED'));

const recipeSource = await readFile(new URL('../netlify/functions/_queue-recipes.ts', import.meta.url), 'utf8');
assert(recipeSource.includes('uploadReferencesToTst ? (isUserOnlyPrompt ? 5 : 4) : 8'));

for (const filename of ['../views/features/GenerationTool.tsx', '../mobile-app/src/v2/views/WorkspaceImage.tsx']) {
  const source = await readFile(new URL(filename, import.meta.url), 'utf8');
  assert(source.includes('group8'));
  assert(source.includes("activeMode !== 'group8'"));
  assert(source.includes('isModelAllowedForFeature'));
  assert(source.includes('GENERATION_SECTION_TIPS.character'));
  assert(source.includes('GENERATION_SECTION_TIPS.settings'));
  assert(source.includes('GENERATION_SECTION_TIPS.render'));
  assert(source.includes("['group6', 'group7', 'group8'].includes(activeMode)"));
  assert(source.includes('getPreferredGommoBasicMode'));
  assert(source.includes('getGommoServerGroups'));
  assert(source.includes('tstRuntimeResolutions'));
  assert(!source.includes('Luồng đang dùng:'));
}

const generationTipsSource = await readFile(new URL('../shared/generationSectionTips.ts', import.meta.url), 'utf8');
assert(generationTipsSource.includes('1K hoặc 2K'));
assert(generationTipsSource.includes('Pro hoặc Flash'));

const videoTipsSource = await readFile(new URL('../shared/videoGenerationTips.ts', import.meta.url), 'utf8');
assert(videoTipsSource.includes('ảnh AI rõ nét'));
assert(videoTipsSource.includes('chất lượng video và thời lượng video'));
assert(videoTipsSource.includes('Sever Tạo Video'));
assert(videoTipsSource.includes('ảnh kích thước 9:16'));
assert(videoTipsSource.includes('Motion Controlphù hợp'));
assert(videoTipsSource.includes('Sever Tạo Motion Control'));
for (const filename of ['../views/features/VideoTool.tsx', '../mobile-app/src/v2/views/WorkspaceVideo.tsx']) {
  const source = await readFile(new URL(filename, import.meta.url), 'utf8');
  assert(source.includes('VIDEO_GENERATION_TIPS.motionControl'));
  assert(source.includes('VIDEO_GENERATION_TIPS.videoAi'));
  assert(source.includes('activeSectionTips.upload'));
  assert(source.includes('activeSectionTips.settings'));
  assert(source.includes('activeSectionTips.render'));
}
const desktopImageSource = await readFile(new URL('../views/features/GenerationTool.tsx', import.meta.url), 'utf8');
const desktopVideoSource = await readFile(new URL('../views/features/VideoTool.tsx', import.meta.url), 'utf8');
assert(!desktopImageSource.includes("onNavigateToFeature?.('magic_editor_pro')"));
assert(desktopImageSource.includes("setGuideTopic('chars')"));
assert(desktopImageSource.includes('Video HD'));
assert(desktopVideoSource.includes('setShowGuide(true)'));

const adminSource = await readFile(new URL('../views/Admin.tsx', import.meta.url), 'utf8');
assert(adminSource.includes("pricingConfigFilter === 'missing'"));
assert(adminSource.includes('GENERATION_PROVIDER_ROUTE_OPTIONS'));
assert(adminSource.includes('allowedModelsByFeature'));
assert(adminSource.includes('Model được phép'));
assert(adminSource.includes('getInheritedAuditionPricing'));
assert(adminSource.includes('Kế thừa giá hệ thống từ'));
assert(adminSource.includes('Provider, model và server theo từng chức năng'));
assert(adminSource.includes('Server {effectiveProvider.toUpperCase()} realtime'));
assert(adminSource.includes('providerServerLabel'));

const migrationSource = await readFile(new URL('./supabase_fix_queue_provider_safety.sql', import.meta.url), 'utf8');
assert(migrationSource.includes("raise exception 'ACCOUNT_LOCKED'"));
assert(!migrationSource.includes('Refund: enqueue failed'));
assert(migrationSource.includes('from public, anon, authenticated'));
assert(migrationSource.includes('to service_role'));

console.log('Provider routing safety audit passed.');
