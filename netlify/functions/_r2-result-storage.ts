import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Buffer } from 'node:buffer';

const getEnv = (...keys: string[]) => keys.map((key) => process.env[key]).find(Boolean) || '';
const R2_INGEST_WORKER_URL = getEnv('R2_INGEST_WORKER_URL');
const R2_INGEST_WORKER_SECRET = getEnv('R2_INGEST_WORKER_SECRET');
const R2_ENDPOINT = getEnv('R2_ENDPOINT', 'VITE_R2_ENDPOINT');
const R2_ACCESS_KEY_ID = getEnv('R2_ACCESS_KEY_ID', 'VITE_R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = getEnv('R2_SECRET_ACCESS_KEY', 'VITE_R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = getEnv('R2_BUCKET_NAME', 'VITE_R2_BUCKET_NAME');
const R2_PUBLIC_URL = getEnv('R2_PUBLIC_URL', 'VITE_R2_PUBLIC_URL').replace(/\/+$/, '');
const R2_UPLOAD_TIMEOUT_MS = 55_000;

const extensionForMime = (contentType: string, assetType: 'image' | 'video') => {
  const mime = contentType.split(';', 1)[0].trim().toLowerCase();
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  return assetType === 'video' ? 'mp4' : 'png';
};

const normalizePublicUrl = (value: unknown) => {
  const url = String(value || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('R2 ingest returned an invalid public URL.');
  return url;
};

const ingestWithWorker = async (sourceUrl: string, key: string, assetType: 'image' | 'video') => {
  if (!R2_INGEST_WORKER_URL || !R2_INGEST_WORKER_SECRET || !/^https?:\/\//i.test(sourceUrl)) return null;
  const response = await fetch(R2_INGEST_WORKER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${R2_INGEST_WORKER_SECRET}` },
    body: JSON.stringify({ sourceUrl, key, assetType }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) throw new Error(`R2 ingest Worker failed (${response.status}).`);
  const payload = await response.json() as { publicUrl?: string };
  return normalizePublicUrl(payload.publicUrl);
};

const ingestDirectly = async (sourceUrl: string, key: string, assetType: 'image' | 'video') => {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error('R2 result storage is not configured.');
  }
  const sourceResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(55_000) });
  if (!sourceResponse.ok || !sourceResponse.body) {
    throw new Error(`Provider result download failed (${sourceResponse.status}).`);
  }
  const contentType = sourceResponse.headers.get('content-type') || (assetType === 'video' ? 'video/mp4' : 'image/png');
  const client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: sourceResponse.body as unknown as ReadableStream,
    ContentType: contentType,
  }), { abortSignal: AbortSignal.timeout(R2_UPLOAD_TIMEOUT_MS) });
  return `${R2_PUBLIC_URL}/${key}`;
};

export const persistProviderResultToR2 = async (
  sourceUrl: string,
  userId: string,
  jobId: string,
  assetType: 'image' | 'video',
) => {
  if (/^data:image\//i.test(String(sourceUrl || '').trim())) {
    const match = String(sourceUrl).match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error('Invalid inline image result.');
    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
      throw new Error('R2 result storage is not configured.');
    }
    const key = `users/${encodeURIComponent(userId)}/generated/${encodeURIComponent(jobId)}.png`;
    const client = new S3Client({ region: 'auto', endpoint: R2_ENDPOINT, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
    await client.send(
      new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: Buffer.from(match[2], 'base64'), ContentType: match[1] }),
      { abortSignal: AbortSignal.timeout(R2_UPLOAD_TIMEOUT_MS) },
    );
    return `${R2_PUBLIC_URL}/${key}`;
  }
  const cleanUser = encodeURIComponent(userId);
  const cleanJob = encodeURIComponent(jobId);
  const keyBase = `users/${cleanUser}/generated/${cleanJob}`;
  let extension = assetType === 'video' ? 'mp4' : 'png';
  try {
    const head = await fetch(sourceUrl, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    if (head.ok) extension = extensionForMime(head.headers.get('content-type') || '', assetType);
  } catch {
    // The ingest Worker or GET request remains authoritative when providers reject HEAD.
  }
  const key = `${keyBase}.${extension}`;
  const workerResult = await ingestWithWorker(sourceUrl, key, assetType);
  if (workerResult) return workerResult;
  return ingestDirectly(sourceUrl, key, assetType);
};
