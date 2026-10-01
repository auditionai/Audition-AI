import 'dotenv/config';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const env = (...keys) => keys.map((key) => process.env[key]).find(Boolean);
const endpoint = env('R2_ENDPOINT', 'VITE_R2_ENDPOINT');
const accessKeyId = env('R2_ACCESS_KEY_ID', 'VITE_R2_ACCESS_KEY_ID');
const secretAccessKey = env('R2_SECRET_ACCESS_KEY', 'VITE_R2_SECRET_ACCESS_KEY');
const bucket = env('R2_BUCKET_NAME', 'VITE_R2_BUCKET_NAME');
const beforeRaw = process.argv.find((arg) => arg.startsWith('--before='))?.slice(9) || '2026-09-28';
const before = new Date(`${beforeRaw}T00:00:00.000Z`);
const execute = process.argv.includes('--execute');

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error('Missing R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME.');
}
if (!Number.isFinite(before.getTime())) throw new Error('Invalid --before=YYYY-MM-DD.');

const isVideo = (key = '') => /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(key) || /(^|\/)videos?(\/|$)/i.test(key);
const isPublish = (key = '') => /(^|\/)publish(?:ed|lish)(\/|$)/i.test(key);
const isImage = (key = '') => /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(key)
  || (/\.bin$/i.test(key) && /(^|\/)inputs(\/|$)/i.test(key));
const classify = (key = '') => isPublish(key) ? 'publish' : isVideo(key) ? 'video' : 'image_or_other';
const bytes = (items) => items.reduce((sum, item) => sum + (item.Size || 0), 0);

const r2 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
const objects = [];
let continuationToken;
do {
  const response = await r2.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken, MaxKeys: 1000 }));
  objects.push(...(response.Contents || []).filter((item) => item.Key && item.LastModified));
  continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
} while (continuationToken);

const groups = Object.fromEntries(['publish', 'video', 'image_or_other'].map((kind) => {
  const items = objects.filter((item) => classify(item.Key) === kind);
  const old = items.filter((item) => item.LastModified < before);
  return [kind, { objects: items.length, bytes: bytes(items), beforeCutoff: old.length, beforeCutoffBytes: bytes(old), samples: old.slice(0, 20).map((item) => ({ key: item.Key, lastModified: item.LastModified.toISOString(), size: item.Size || 0 })) }];
}));

const oldImageObjects = objects.filter((item) => item.LastModified < before && isImage(item.Key) && !isVideo(item.Key) && !isPublish(item.Key));
let deleted = 0;
if (execute) {
  for (let index = 0; index < oldImageObjects.length; index += 500) {
    const chunk = oldImageObjects.slice(index, index + 500);
    await r2.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: chunk.map((item) => ({ Key: item.Key })), Quiet: true },
    }));
    deleted += chunk.length;
  }
}

console.log(JSON.stringify({
  bucket,
  before: before.toISOString(),
  mode: execute ? 'execute' : 'dry-run',
  scanned: objects.length,
  totalBytes: bytes(objects),
  eligibleOldImages: { objects: oldImageObjects.length, bytes: bytes(oldImageObjects) },
  deleted,
  groups,
}, null, 2));
