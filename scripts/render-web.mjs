import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

import { handler as adminQueueJobDetailHandler } from '../netlify/functions/admin-queue-job-detail.ts';
import { handler as adminQueueJobsHandler } from '../netlify/functions/admin-queue-jobs.ts';
import { handler as adminStopQueueJobHandler } from '../netlify/functions/admin-stop-queue-job.ts';
import { handler as adminUserHistoryHandler } from '../netlify/functions/admin-user-history.ts';
import { handler as checkinRewardHandler } from '../netlify/functions/checkin-reward.ts';
import { handler as createPaymentHandler } from '../netlify/functions/create_payment.js';
import { handler as forceRescueFailedJobsHandler } from '../netlify/functions/force-rescue-failed-jobs.ts';
import { handler as galleryImagesHandler } from '../netlify/functions/gallery-images.ts';
import { handler as getVertexTokenHandler } from '../netlify/functions/get-vertex-token.ts';
import { handler as payosSyncTransactionHandler } from '../netlify/functions/payos-sync-transaction.ts';
import { handler as payosWebhookHandler } from '../netlify/functions/payos-webhook.ts';
import { handler as queueEnqueueHandler } from '../netlify/functions/queue-enqueue.ts';
import { handler as queueReconcileHandler } from '../netlify/functions/queue-reconcile.ts';
import { handler as queueSubmitHandler } from '../netlify/functions/queue-submit.ts';
import { handler as queueTickHandler } from '../netlify/functions/queue-tick.ts';
import { handler as redeemGiftcodeHandler } from '../netlify/functions/redeem-giftcode.ts';
import { handler as tstGenerateHandler } from '../netlify/functions/tst-generate.ts';
import { handler as tstModelsPricingHandler } from '../netlify/functions/tst-models-pricing.ts';
import { handler as tstModelsHandler } from '../netlify/functions/tst-models.ts';
import { handler as tstMotionGenerateHandler } from '../netlify/functions/tst-motion-generate.ts';
import { handler as tstPollHandler } from '../netlify/functions/tst-poll.ts';
import { handler as tstUploadHandler } from '../netlify/functions/tst-upload.ts';
import { handler as tstUploadVideoHandler } from '../netlify/functions/tst-upload-video.ts';
import { handler as tstVideoGenerateHandler } from '../netlify/functions/tst-video-generate.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const indexFile = path.join(distDir, 'index.html');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const BODY_LIMIT = process.env.RENDER_API_BODY_LIMIT || '200mb';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const handlerConfigs = [
  { fnName: 'get-vertex-token', apiPath: '/api/get-vertex-token', handler: getVertexTokenHandler },
  { fnName: 'tst-generate', apiPath: '/api/tst-generate', handler: tstGenerateHandler },
  { fnName: 'tst-poll', apiPath: '/api/tst-poll', handler: tstPollHandler },
  { fnName: 'tst-upload', apiPath: '/api/tst-upload', handler: tstUploadHandler },
  { fnName: 'tst-models-pricing', apiPath: '/api/tst-models-pricing', handler: tstModelsPricingHandler },
  { fnName: 'tst-models', apiPath: '/api/tst-models', handler: tstModelsHandler },
  { fnName: 'tst-video-generate', apiPath: '/api/tst-video-generate', handler: tstVideoGenerateHandler },
  { fnName: 'tst-motion-generate', apiPath: '/api/tst-motion-generate', handler: tstMotionGenerateHandler },
  { fnName: 'tst-upload-video', apiPath: '/api/tst-upload-video', handler: tstUploadVideoHandler },
  { fnName: 'queue-enqueue', apiPath: '/api/queue-enqueue', handler: queueEnqueueHandler },
  { fnName: 'queue-submit', apiPath: '/api/queue-submit', handler: queueSubmitHandler },
  { fnName: 'queue-tick', apiPath: '/api/queue-tick', handler: queueTickHandler },
  { fnName: 'queue-reconcile', apiPath: '/api/queue-reconcile', handler: queueReconcileHandler },
  { fnName: 'admin-queue-jobs', apiPath: '/api/admin-queue-jobs', handler: adminQueueJobsHandler },
  { fnName: 'admin-queue-job-detail', apiPath: '/api/admin-queue-job-detail', handler: adminQueueJobDetailHandler },
  { fnName: 'admin-user-history', apiPath: '/api/admin-user-history', handler: adminUserHistoryHandler },
  { fnName: 'admin-stop-queue-job', apiPath: '/api/admin-stop-queue-job', handler: adminStopQueueJobHandler },
  { fnName: 'force-rescue-failed-jobs', apiPath: '/api/force-rescue-failed-jobs', handler: forceRescueFailedJobsHandler },
  { fnName: 'gallery-images', apiPath: '/api/gallery-images', handler: galleryImagesHandler },
  { fnName: 'checkin-reward', apiPath: '/api/checkin-reward', handler: checkinRewardHandler },
  { fnName: 'redeem-giftcode', apiPath: '/api/redeem-giftcode', handler: redeemGiftcodeHandler },
  { fnName: 'payos-sync-transaction', apiPath: '/api/payos-sync-transaction', handler: payosSyncTransactionHandler },
  { fnName: 'payos-webhook', apiPath: '/api/payos-webhook', handler: payosWebhookHandler, extraApiPaths: ['/api/payment-webhook'] },
  { fnName: 'create_payment', apiPath: '/api/create-payment', handler: createPaymentHandler },
];

const toHeaderRecord = (headers) => {
  const next = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (Array.isArray(value)) {
      next[key] = value.join(', ');
      continue;
    }
    if (typeof value === 'string') {
      next[key] = value;
    }
  }
  return next;
};

const toQueryRecord = (reqUrl) => {
  const url = new URL(reqUrl, 'http://localhost');
  const next = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!(key in next)) {
      next[key] = value;
    }
  }
  return next;
};

const shouldEncodeBodyAsBase64 = (contentType) => {
  const normalized = String(contentType || '').toLowerCase();
  return (
    normalized.includes('multipart/form-data') ||
    normalized.includes('application/octet-stream') ||
    normalized.startsWith('image/') ||
    normalized.startsWith('video/')
  );
};

const buildNetlifyEvent = (req) => {
  const headers = toHeaderRecord(req.headers);
  const rawBody =
    Buffer.isBuffer(req.body) ? req.body :
    typeof req.body === 'string' ? Buffer.from(req.body) :
    Buffer.alloc(0);
  const contentType = headers['content-type'] || headers['Content-Type'] || '';
  const isBase64Encoded = rawBody.length > 0 && shouldEncodeBodyAsBase64(contentType);

  return {
    httpMethod: req.method,
    headers,
    rawUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    path: req.path,
    rawQuery: req.originalUrl.split('?')[1] || '',
    queryStringParameters: toQueryRecord(req.originalUrl),
    body: rawBody.length > 0
      ? (isBase64Encoded ? rawBody.toString('base64') : rawBody.toString('utf8'))
      : undefined,
    isBase64Encoded,
    cookies: typeof req.headers.cookie === 'string'
      ? req.headers.cookie.split(';').map((value) => value.trim()).filter(Boolean)
      : [],
  };
};

const applyResponseHeaders = (res, headers, cookies) => {
  for (const [key, value] of Object.entries(headers || {})) {
    if (typeof value === 'undefined') {
      continue;
    }
    res.setHeader(key, value);
  }

  if (Array.isArray(cookies) && cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies);
  }
};

const sendHandlerResponse = (res, result) => {
  const statusCode = Number(result?.statusCode || 200);
  applyResponseHeaders(res, result?.headers, result?.cookies);

  const body = result?.body;
  if (body == null || statusCode === 204) {
    res.status(statusCode).end();
    return;
  }

  if (result?.isBase64Encoded && typeof body === 'string') {
    res.status(statusCode).end(Buffer.from(body, 'base64'));
    return;
  }

  if (body instanceof Readable) {
    res.status(statusCode);
    body.pipe(res);
    return;
  }

  if (typeof body?.getReader === 'function') {
    res.status(statusCode);
    Readable.fromWeb(body).pipe(res);
    return;
  }

  if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    res.status(statusCode).end(Buffer.from(body));
    return;
  }

  if (typeof body === 'object') {
    res.status(statusCode).send(JSON.stringify(body));
    return;
  }

  res.status(statusCode).send(String(body));
};

const adaptNetlifyHandler = (handler, label) => async (req, res) => {
  try {
    const event = buildNetlifyEvent(req);
    const result = await handler(event, {});

    if (res.headersSent) {
      return;
    }

    sendHandlerResponse(res, result);
  } catch (error) {
    console.error(`[render-web] ${label} failed:`, error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Internal Server Error' });
    }
  }
};

const sanitizeFilename = (value) => {
  const fallback = 'download';
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;

  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 180) || fallback;
};

const getFilenameFromUrl = (url) => {
  try {
    const parsedUrl = new URL(url);
    const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop();
    return sanitizeFilename(lastSegment);
  } catch {
    return 'download';
  }
};

const handleDownloadProxy = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const url = typeof req.query.url === 'string' ? req.query.url : '';
  const requestedFilename = typeof req.query.filename === 'string' ? req.query.filename : '';

  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  try {
    const upstreamResponse = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(120000),
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      res.status(upstreamResponse.status || 502).json({
        error: `Failed to fetch asset: ${upstreamResponse.status} ${upstreamResponse.statusText}`,
      });
      return;
    }

    const filename = sanitizeFilename(requestedFilename) || getFilenameFromUrl(url);
    res.status(200).set({
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': upstreamResponse.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
    });

    const contentLength = upstreamResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    Readable.fromWeb(upstreamResponse.body).pipe(res);
  } catch (error) {
    console.error('[render-web] download proxy failed:', error);
    res.status(500).json({ error: error?.message || 'Download proxy failed' });
  }
};

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'render-web' });
});

app.use(
  ['/api', '/.netlify/functions'],
  express.raw({
    type: () => true,
    limit: BODY_LIMIT,
  }),
);

app.all('/api/download-proxy', handleDownloadProxy);
app.all('/.netlify/functions/download_proxy', handleDownloadProxy);

for (const config of handlerConfigs) {
  const handler = adaptNetlifyHandler(config.handler, config.fnName);
  const paths = [
    config.apiPath,
    `/.netlify/functions/${config.fnName}`,
    ...(config.extraApiPaths || []),
  ];

  for (const routePath of paths) {
    app.all(routePath, handler);
  }
}

app.use(express.static(distDir, { index: false }));

app.use((req, res, next) => {
  if (req.method !== 'GET') {
    next();
    return;
  }

  if (req.path.startsWith('/api/') || req.path.startsWith('/.netlify/functions/')) {
    next();
    return;
  }

  res.sendFile(indexFile, (error) => {
    if (error) {
      next(error);
    }
  });
});

app.use((error, _req, res, _next) => {
  console.error('[render-web] unhandled error:', error);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: error?.message || 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[render-web] Listening on port', PORT);
});
