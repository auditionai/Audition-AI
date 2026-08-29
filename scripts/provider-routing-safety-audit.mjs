import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildGommoFormBody, buildGommoImageReferenceFields, buildGommoVideoReferenceFields, extractGommoCreateJobId, isGommoModelAvailable } from '../netlify/functions/_gommo-provider.ts';
import { sortTstFallbackServers } from '../netlify/functions/_queue-worker.ts';
import { buildLocalPricingOptionCandidates } from '../netlify/functions/queue-submit.ts';
import { buildGommoCatalogPricingOptionId, buildProviderPricingOptionCandidates, getAuditionProviderPricing, getGommoCatalogPricingOptionId, getGommoPricingInput, isSelectableGommoImageResolution, resolveProviderForModel } from '../services/providerCatalog.ts';
import { getAllowedModelsForFeature, inferGenerationProviderRouteKey, isModelAllowedForFeature } from '../shared/providerRouting.ts';
import { getGommoModeForServerGroup, getGommoServerGroups, getGommoServerIdForMode, getPreferredGommoBasicMode } from '../shared/gommoServerRouting.ts';
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
assert.equal(getGommoModeForServerGroup(gommoGptServerModel, 'basic-server', 'low'), 'low_basic');
assert.equal(getPreferredGommoBasicMode(['low', 'low_basic', 'medium_basic'], 'medium'), 'medium_basic');
assert.equal(isSelectableGommoImageResolution('image-gpt-2', '4K_UPSCALE'), false);
assert.equal(isSelectableGommoImageResolution('image-gpt-2', '4K'), true);

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
assert(grokOptions.includes('720p-6s'));
assert(grokOptions.includes('720p-6-standard'));

const grokAdminPricing = [
  { model_id: 'grok-i2v', option_id: '720p-6s', audition_price_vcoin: 17 },
  { model_id: 'grok-i2v', option_id: 'normal', audition_price_vcoin: 9 },
];
assert.deepEqual(
  getAuditionProviderPricing(
    grokAdminPricing,
    'grok-i2v',
    getGommoPricingInput('grok-i2v', {
      resolution: '720P',
      duration: '6S',
      providerMode: 'normal',
    }),
    { allowGenericFallback: true },
  ),
  { optionId: '720p-6s', vcoin: 17 },
);
assert.equal(buildGommoCatalogPricingOptionId({ resolution: null, duration: '10', mode: 'professional' }), '10s-professional');
assert.equal(buildGommoCatalogPricingOptionId({ resolution: '720p', duration: null, mode: 'quality' }), '720p-quality');
assert.equal(buildGommoCatalogPricingOptionId({ resolution: null, duration: null, mode: 'standard' }), 'standard');
assert.equal(getGommoPricingInput('motion-control-3.0', { providerMode: 'standard' }).resolution, '720p');
assert.equal(getGommoPricingInput('motion-control-3.0', { providerMode: 'professional' }).resolution, '1080p');
assert.equal(
  getGommoCatalogPricingOptionId({ prices: [
    { resolution: '720p', duration: '6', mode: 'fast', price: 1 },
    { resolution: '1080p', duration: '6', mode: 'fast', price: 2 },
  ] }, { resolution: '1080P', duration: '6S', providerMode: 'fast' }),
  '1080p-6s-fast',
);
assert.deepEqual(
  getAuditionProviderPricing(
    [
      { model_id: 'kling-2.6', option_id: '720p-5s-standard', audition_price_vcoin: 99 },
      { model_id: 'kling-2.6', option_id: '5s-standard', audition_price_vcoin: 12 },
    ],
    'kling-2.6',
    getGommoPricingInput('kling-2.6', { duration: '5s', providerMode: 'standard' }),
    { allowGenericFallback: true, preferredOptionId: '5s-standard' },
  ),
  { optionId: '5s-standard', vcoin: 12 },
);

const klingGommoPricingOptions = buildProviderPricingOptionCandidates({
  duration: '10s',
  providerMode: 'professional',
});
assert(klingGommoPricingOptions.includes('10s-professional'));

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
const uploadedGommoReferences = [
  { id_base: 'upload-1', url: 'https://cdn.example.com/one.png', data: '' },
  { id_base: 'upload-2', url: 'https://cdn.example.com/two.png', data: '' },
];
assert.deepEqual(
  buildGommoImageReferenceFields({ model: 'imagegen_2_0', name: 'GPT Image 2', withSubject: true, maxSubject: 8 }, uploadedGommoReferences),
  { subjects: ['https://cdn.example.com/one.png', 'https://cdn.example.com/two.png'] },
);
const gommoReferenceForm = buildGommoFormBody({
  model: 'imagegen_2_0',
  subjects: ['https://cdn.example.com/one.png', 'https://cdn.example.com/two.png'],
  images: [{ url: 'https://cdn.example.com/start.png', id_base: 'upload-start' }],
});
assert.equal(gommoReferenceForm.get('subjects'), null);
assert.equal(gommoReferenceForm.get('images'), null);
assert.equal(gommoReferenceForm.get('subjects[0][url]'), 'https://cdn.example.com/one.png');
assert.equal(gommoReferenceForm.get('subjects[1][url]'), 'https://cdn.example.com/two.png');
assert.equal(gommoReferenceForm.get('images[0][url]'), 'https://cdn.example.com/start.png');
assert.deepEqual(
  buildGommoImageReferenceFields({ model: 'other', name: 'Other', startImage: true }, uploadedGommoReferences),
  { images: [{ url: 'https://cdn.example.com/one.png' }] },
);
assert.deepEqual(
  buildGommoVideoReferenceFields({ model: 'kling_video_2_6', name: 'Kling 2.6', startImage: true }, uploadedGommoReferences),
  { images: [{ url: 'https://cdn.example.com/one.png', id_base: 'upload-1' }] },
);
assert.deepEqual(
  buildGommoVideoReferenceFields({ model: 'kling_video_o1', name: 'Kling O1', startImage: true, startImageAndEnd: true }, uploadedGommoReferences),
  { images: [
    { url: 'https://cdn.example.com/one.png', id_base: 'upload-1' },
    { url: 'https://cdn.example.com/two.png', id_base: 'upload-2' },
  ] },
);
assert.deepEqual(
  buildGommoVideoReferenceFields({ model: 'text_video', name: 'Text Video', startImage: false }, uploadedGommoReferences),
  {},
);
assert.equal(
  extractGommoCreateJobId({ success: true, imageInfo: { id_base: 'image-job', status: 'PENDING_ACTIVE' } }, 'image'),
  'image-job',
);
assert.equal(
  extractGommoCreateJobId({ success: true, imageInfo: { id_base: 'failed-job', status: 'ERROR' } }, 'image'),
  '',
);
assert.equal(
  extractGommoCreateJobId({ videoInfo: { id_base: 'video-job', status: 'MEDIA_GENERATION_STATUS_PENDING' } }, 'video'),
  'video-job',
);
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
assert(workerSource.includes('prepareGommoProviderPayloadFromQueueRecipe(currentPayload)'));
assert(workerSource.includes('prepareTstProviderPayloadFromQueueRecipe'));
assert(!workerSource.includes('prepareProviderPayloadFromQueueRecipe(currentPayload, { uploadReferencesToTst: false })'));

const gommoSource = await readFile(new URL('../netlify/functions/_gommo-provider.ts', import.meta.url), 'utf8');
assert(gommoSource.includes('resolution: providerPayload.resolution'));
assert(gommoSource.includes('normalizeAndValidateGommoPayload'));
assert(gommoSource.includes("'https://api.gommo.net'"));
assert(gommoSource.includes('Authorization: `Bearer ${credentials.access_token}`'));
assert(gommoSource.includes("postForm('/ai/image-upload'"));
assert(gommoSource.includes("postForm('/ai/generateImage'"));
assert(gommoSource.includes("postForm('/ai/create-video'"));
assert(gommoSource.includes("postMultipart('/ai/create-video'"));
assert(gommoSource.includes("{ field: 'character_image', ...characterImage }"));
assert(gommoSource.includes("{ field: 'motion_video', ...motionVideo }"));
assert(gommoSource.includes("auditionModelId: 'motion-control-2.6', gommoModelId: 'kling_video_motion', kind: 'motion', fallbackSupported: true"));
assert(gommoSource.includes("auditionModelId: 'motion-control-3.0', gommoModelId: 'kling_video_motion_3', kind: 'motion', fallbackSupported: false"));
assert(gommoSource.includes("media === 'image' ? '/ai/image' : '/ai/video'"));
assert(gommoSource.includes("media === 'image' ? { id_base: providerJobId } : { videoId: providerJobId }"));
assert(gommoSource.includes("model.withSubject ? 'subjects' : 'images'"));
assert(gommoSource.includes('maxReferenceImages'));
assert(gommoSource.includes('GOMMO_SERVER_DISABLED'));
assert(gommoSource.includes("isProviderServerAllowedByConfig('gommo'"));
assert(gommoSource.includes('getGommoServerIdForMode(normalized.model, mode)'));
assert(gommoSource.includes("case 'image-gpt-2': return `${quality || 'low'}_basic`;"));
assert(gommoSource.includes('if (model.withSubject) return { subjects: limitedSources.map((source) => source.url) }'));
assert(gommoSource.includes('.map((source) => ({ url: source.url }))'));
assert(gommoSource.includes('const extractGommoCreateJobId'));
assert(gommoSource.includes("if (media === 'image' && data?.success !== true) return"));
assert(gommoSource.includes('Boolean(data?.error)'));
assert(gommoSource.includes('...buildGommoVideoReferenceFields(normalized.model, uploadedImages)'));
assert(gommoSource.includes('normalized.model.startImageAndEnd ? 2 : 1'));
assert(gommoSource.includes("return { id_base: idBase, url, data: '' }"));
assert(gommoSource.includes('`${key}[${index}][url]`'));
assert(gommoSource.includes('data?.raw?.imageInfo?.message'));
assert(gommoSource.includes('data?.raw?.videoInfo?.message'));
assert(gommoSource.includes("if (data?.imageInfo && typeof data.imageInfo === 'object') return data.imageInfo"));
assert(gommoSource.includes("if (data?.videoInfo && typeof data.videoInfo === 'object') return data.videoInfo"));

const providerCapacityMigration = await readFile(
  new URL('../supabase/migrations/20260804183000_provider_specific_queue_capacity.sql', import.meta.url),
  'utf8',
);
assert(providerCapacityMigration.includes("when n.provider_key = 'gommo' then 8 else 4"));
assert(providerCapacityMigration.includes("when n.provider_key = 'gommo' then 2 else 1"));
assert(providerCapacityMigration.includes("partition by e.user_id, e.provider_key"));
assert(providerCapacityMigration.includes("partition by ru.provider_key"));
assert(providerCapacityMigration.includes('system_gommo_image_processing integer'));

const gommoTripleCapacityMigration = await readFile(
  new URL('../supabase/migrations/20260805090000_gommo_triple_queue_capacity.sql', import.meta.url),
  'utf8',
);
assert(gommoTripleCapacityMigration.includes("when n.provider_key = 'gommo' then 12 else 4"));
assert(gommoTripleCapacityMigration.includes("when n.provider_key = 'gommo' then 3 else 1"));
assert(gommoTripleCapacityMigration.includes('v_system_image_limit := 12;'));
assert(gommoTripleCapacityMigration.includes('v_user_image_limit := 3;'));

const unlimitedSystemCapacityMigration = await readFile(
  new URL('../supabase/migrations/20260805120000_user_three_unlimited_system_capacity.sql', import.meta.url),
  'utf8',
);
assert(unlimitedSystemCapacityMigration.includes('v_user_queue_limit constant integer := 3;'));
assert(unlimitedSystemCapacityMigration.includes('3 - coalesce(up.active_count, 0) as user_slots'));
assert(!unlimitedSystemCapacityMigration.includes("raise exception 'SYSTEM_QUEUE_FULL'"));
assert(!unlimitedSystemCapacityMigration.includes('system_slots'));

const tstCatalogSource = await readFile(new URL('../services/tstCatalog.ts', import.meta.url), 'utf8');
assert(tstCatalogSource.includes("const PER_SECOND_VIDEO_DURATION_OPTIONS = ['5s', '10s', '15s'];"));
assert(tstCatalogSource.includes('entries.some((entry) => normalizeSpeed(entry.speed) === \'per-second\')'));
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
assert(queueSubmitSource.includes("queueKind === 'motion_generate'"));
assert(queueSubmitSource.includes('motionVideoDurationSeconds'));
assert(queueSubmitSource.includes("requestedProvider === 'gommo' || requestedProvider === 'gpti2'"));
assert(queueSubmitSource.includes('provider: targetProvider'));
assert(queueSubmitSource.includes("if (targetProvider === 'gpti2')"));

const recipeSource = await readFile(new URL('../netlify/functions/_queue-recipes.ts', import.meta.url), 'utf8');
assert(recipeSource.includes('uploadReferencesToTst ? (isUserOnlyPrompt ? 5 : 4) : 8'));
assert(recipeSource.includes('export const prepareTstProviderPayloadFromQueueRecipe'));
assert(recipeSource.includes('export const prepareGommoProviderPayloadFromQueueRecipe'));
assert(recipeSource.includes('prepareProviderPayloadFromQueueRecipe(payload, { uploadReferencesToTst: true })'));
assert(recipeSource.includes('prepareProviderPayloadFromQueueRecipe(payload, { uploadReferencesToTst: false })'));
assert(recipeSource.includes('GOMMO_UNSUPPORTED_RECIPE'));
assert(recipeSource.includes("payload.recipeType === 'motion_generate_recipe_v1'"));
assert(recipeSource.includes("background_source: payload.backgroundSource || 'input_image'"));
assert(!gommoSource.includes('uploadImageToTst'));
assert(!gommoSource.includes('TST_API'));

const queueWorkerSource = await readFile(new URL('../netlify/functions/_queue-worker.ts', import.meta.url), 'utf8');
assert(queueWorkerSource.includes("targetProvider === 'tst' || targetProvider === 'gpti2'"));
assert(queueWorkerSource.includes("String(toQueuePayloadObject(recipePayload).__targetProvider || '').trim().toLowerCase() === 'gpti2'"));
assert(queueWorkerSource.includes("targetProvider === 'tst' || targetProvider === 'gommo' || targetProvider === 'gpti2'"));
assert(queueWorkerSource.includes("targetProvider === 'gpti2' && isGpti2ProviderError(message)"));
assert(queueWorkerSource.includes('payload.__tstFallbackValidated === true'));
assert(queueWorkerSource.includes("updateQuery.is('job_id', null)"));
assert(queueWorkerSource.includes('runtimeState?.provider'));
assert(queueWorkerSource.includes('const persistResultForJob'));
assert(queueWorkerSource.includes('VIDEO_OR_MOTION_QUEUE_KINDS.has(job.queue_kind)'));

const gpti2ProviderSource = await readFile(new URL('../netlify/functions/_gpti2-provider.ts', import.meta.url), 'utf8');
assert(gpti2ProviderSource.includes('const GPTI2_TIMEOUT_MS = 295_000;'));
assert(gpti2ProviderSource.includes("form.append('image[]'"));
assert(gpti2ProviderSource.includes("request('/images/edits'"));
assert(gpti2ProviderSource.includes("'9:16': '720x1280'"));
assert(gpti2ProviderSource.includes("'21:9': '1280x544'"));
assert(gpti2ProviderSource.includes("raw.startsWith('data:') || /^https?:\\/\\//i.test(raw)"));
assert(gpti2ProviderSource.includes('normalizeReferenceImage'));
assert(gpti2ProviderSource.includes('.rotate()'));
assert(gpti2ProviderSource.includes('mozjpeg: true'));
assert(gpti2ProviderSource.includes('GPTI2_NANO_ASPECT_RATIO_UNSUPPORTED'));
assert(gpti2ProviderSource.includes('GPTI2_NANO_TOO_MANY_REFERENCES'));
assert(gpti2ProviderSource.includes("const NANO_OUTPUT_RESOLUTION = '2K';"));
assert(gpti2ProviderSource.includes('const buildNanoRequest'));

const grokProviderSource = await readFile(new URL('../netlify/functions/_grok.ts', import.meta.url), 'utf8');
assert(grokProviderSource.includes("|| 'grok-4.5'"));
assert(grokProviderSource.includes("https://sub.digishop.work/v1"));
assert(grokProviderSource.includes('client.chat.completions.create'));
const grokHealthSource = await readFile(new URL('../netlify/functions/grok-health.ts', import.meta.url), 'utf8');
assert(grokHealthSource.includes('models.list'));

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
  assert(source.includes('gommoDefaultSelectionKeyRef'));
  assert(source.includes('getPreferredGommoBasicMode(gommoModeTypes, gptQuality)') || source.includes('getPreferredGommoBasicMode(modes, gptQuality)'));
  assert(source.includes('tstRuntimeResolutions'));
  assert(!source.includes('Luồng đang dùng:'));
}

for (const filename of ['../views/features/PromptImageTool.tsx', '../mobile-app/src/v2/views/WorkspacePromptImage.tsx']) {
  const source = await readFile(new URL(filename, import.meta.url), 'utf8');
  assert(source.includes('gommoDefaultSelectionKeyRef'));
  assert(source.includes('getPreferredGommoBasicMode(modes, gptQuality)'));
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
  assert(source.includes('isGommoMotionSelected'));
  assert(source.includes('gommoMotionPricing'));
  assert(source.includes("backgroundSource: isGommoMotionSelected ? 'input_image' : undefined") || source.includes("backgroundSource: 'input_image'"));
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
