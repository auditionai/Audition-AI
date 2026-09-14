import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const assertIncludes = (source, snippets, label) => {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${label} is missing: ${snippet}`);
  }
};

const sourceFiles = {
  queueWorker: await read('netlify/functions/_queue-worker.ts'),
  queueSubmit: await read('netlify/functions/queue-submit.ts'),
  queueRecipes: await read('netlify/functions/_queue-recipes.ts'),
  gpti2: await read('netlify/functions/_gpti2-provider.ts'),
  tstNormalizer: await read('netlify/functions/_tst-payload-normalizer.ts'),
  tstCatalog: await read('services/tstCatalog.ts'),
  videoDirector: await read('netlify/functions/video-script-director.ts'),
  videoSubmit: await read('netlify/functions/video-script-submit.ts'),
  videoWorker: await read('netlify/functions/video-script-worker-background.ts'),
  videoStatus: await read('netlify/functions/video-script-status.ts'),
  sepay: await read('netlify/functions/_sepay.ts'),
  sepayIpn: await read('netlify/functions/sepay-ipn.ts'),
  sepayReconcile: await read('netlify/functions/sepay-reconcile-pending.ts'),
  sepayCheckout: await read('netlify/functions/sepay-checkout.ts'),
  watchdog: await read('netlify/functions/_queue-watchdog.ts'),
  watchdogEndpoint: await read('netlify/functions/queue-watchdog.ts'),
  watchdogScheduled: await read('netlify/functions/queue-watchdog-scheduled.ts'),
  recovery: await read('netlify/functions/force-rescue-failed-jobs.ts'),
  upload: await read('netlify/functions/storage-upload-url.ts'),
  deleteAsset: await read('netlify/functions/storage-delete.ts'),
  downloadProxy: await read('netlify/functions/download_proxy.ts'),
  adminJobs: await read('netlify/functions/admin-queue-jobs.ts'),
  adminDetail: await read('netlify/functions/admin-queue-job-detail.ts'),
  adminHealth: await read('netlify/functions/admin-queue-health-report.ts'),
};

assertIncludes(sourceFiles.queueWorker, [
  'providerByFeature',
  'prepareTstProviderPayloadFromQueueRecipe',
  'prepareGpti2ProviderPayloadFromQueueRecipe',
  'const persistResultForJob',
  'VIDEO_OR_MOTION_QUEUE_KINDS.has(job.queue_kind)',
  'payload.__tstFallbackValidated === true',
  "updateQuery.is('job_id', null)",
], 'queue worker');

assertIncludes(sourceFiles.queueSubmit, [
  '__providerRouteKey',
  'MODEL_NOT_ALLOWED_FOR_FEATURE',
  "queueKind === 'motion_generate'",
  'motionVideoDurationSeconds',
  'provider: targetProvider',
], 'queue submit');

assertIncludes(sourceFiles.queueRecipes, [
  'export const prepareTstProviderPayloadFromQueueRecipe',
  'prepareProviderPayloadFromQueueRecipe(payload, { uploadReferencesToTst: true })',
  'uploadReferencesToTst ? (isUserOnlyPrompt ? 5 : 4) : 8',
  "payload.recipeType === 'motion_generate_recipe_v1'",
], 'queue recipes');

assertIncludes(sourceFiles.gpti2, [
  "const GPTI2_TIMEOUT_MS = 295_000;",
  "form.append('image[]'",
  "request('/images/edits'",
  "'9:16': '720x1280'",
  'normalizeReferenceImage',
  'mozjpeg: true',
  'GPTI2_NANO_ASPECT_RATIO_UNSUPPORTED',
  'GPTI2_NANO_TOO_MANY_REFERENCES',
  "const NANO_OUTPUT_RESOLUTION = '2K';",
], 'GPTi2 provider');

assertIncludes(sourceFiles.tstNormalizer, [
  'normalizeTstOutboundPayload',
], 'TST payload preparation');
assertIncludes(sourceFiles.tstCatalog, [
  "const PER_SECOND_VIDEO_DURATION_OPTIONS = ['5s', '10s', '15s'];",
  "String(entry.key || entry.config_key || '')",
], 'TST catalog');

for (const [name, source] of Object.entries({
  'TST image endpoint': await read('netlify/functions/tst-generate.ts'),
  'TST video endpoint': await read('netlify/functions/tst-video-generate.ts'),
  'TST motion endpoint': await read('netlify/functions/tst-motion-generate.ts'),
})) {
  assertIncludes(source, ['validateQueuePayloadAgainstLiveCatalog'], name);
}
assertIncludes(await read('netlify/functions/tst-poll.ts'), ['encodeURIComponent(jobId)'], 'TST polling');

assertIncludes(sourceFiles.videoDirector, [
  'VIDEO_SCRIPT_MAX_TOKENS',
  'VIDEO_SCRIPT_TOTAL_TIMEOUT_MS = 295_000',
  'return { url: source }',
  'Khoa dong nhat tham chieu',
  'Promise.race([operation(controller.signal), deadline])',
], 'video script director');
assertIncludes(sourceFiles.videoSubmit, ['video_script_jobs', 'triggerBackgroundFunction'], 'video script submission');
assertIncludes(sourceFiles.videoWorker, ['verifyInternalRequest', 'generateVideoScriptForRequest', "status: 'failed'"], 'video script worker');
assertIncludes(sourceFiles.videoStatus, ["eq('user_id', user.id)", 'error_message'], 'video script status');

assertIncludes(sourceFiles.sepay, [
  'extractSePayOrderCode',
  'findSePayBankTransactionForOrder',
  'retrieveSePayOrder',
  'normalizeSePayOrderStatus',
], 'SePay helpers');
assertIncludes(sourceFiles.sepayIpn, [
  'x-secret-key',
  'settle_payment_transaction_by_order_code',
  'settle_payment_transaction_by_id',
  'Amount mismatch',
], 'SePay IPN');
assertIncludes(sourceFiles.sepayReconcile, [
  'runSePayPendingReconcile',
  'runtime_budget_exhausted',
  'mark_topup_giftcode_applied',
], 'SePay reconcile');
assertIncludes(sourceFiles.sepayCheckout, [
  'decodeSePayCheckoutPayload',
  'https://pay.sepay.vn/',
  'method="POST"',
], 'SePay checkout');

assertIncludes(sourceFiles.watchdog, [
  'refund_generated_job',
  'MAX_PRE_DISPATCH_RECOVERIES',
  'DIRECT_EDIT_MAX_ATTEMPTS',
  'GPTI2_SYNC_DISPATCH_STALE_MS',
  'sendTelegramOperationalAlert',
], 'queue watchdog');
assertIncludes(sourceFiles.watchdogEndpoint, ['runQueueWatchdog', 'Unauthorized'], 'watchdog endpoint');
assertIncludes(sourceFiles.watchdogScheduled, ['runQueueWatchdog'], 'scheduled watchdog');
assertIncludes(sourceFiles.recovery, ['clearFailedRescueMeta', 'triggerBackgroundQueueWorker'], 'recovery endpoint');

assertIncludes(sourceFiles.upload, [
  'createSignedUploadUrl',
  'PutObjectCommand',
  'users/${user.id}/',
], 'upload');
assertIncludes(sourceFiles.deleteAsset, [
  'DeleteObjectCommand',
  'requester?.is_admin !== true',
  "admin.from('generated_images').delete()",
], 'delete');
assertIncludes(sourceFiles.downloadProxy, ['fetchSafeRemoteAsset', 'requireAuthenticatedUser', 'Content-Disposition'], 'download proxy');
assertIncludes(sourceFiles.adminJobs, ['is_admin', 'admin_generated_images_queue_lightweight'], 'admin jobs');
assertIncludes(sourceFiles.adminDetail, ['watchdogDue', 'isStuck'], 'admin job detail');
assertIncludes(sourceFiles.adminHealth, ['queue_watchdog_last_health_report', 'liveDbReport'], 'admin health');

console.log('Provider routing and production parity audit passed.');
