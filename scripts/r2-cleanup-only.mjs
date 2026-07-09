import 'dotenv/config';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const getArg = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const requiredEnv = (key, aliases = []) => {
  const value = [key, ...aliases].map((name) => process.env[name]).find(Boolean);
  if (!value) {
    throw new Error(`Missing ${[key, ...aliases].join(' or ')}`);
  }
  return value;
};

const parseDate = (value, label, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}. Use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid ${label}.`);
  }
  return date;
};

const startDateRaw = getArg('start');
const endDateRaw = getArg('end');
const prefix = getArg('prefix').replace(/^\/+/, '');
const execute = hasFlag('execute');
const maxObjects = Number.parseInt(getArg('max', '1000'), 10);

if (!startDateRaw || !endDateRaw) {
  throw new Error('Usage: npm run r2:cleanup -- --start=2025-01-01 --end=2026-06-30 --prefix=inputs/ [--execute]');
}

if (!prefix || prefix === '/') {
  throw new Error('Refusing to scan/delete without a specific --prefix. Example: --prefix=inputs/');
}

if (!Number.isFinite(maxObjects) || maxObjects <= 0 || maxObjects > 10000) {
  throw new Error('--max must be between 1 and 10000.');
}

const startDate = parseDate(startDateRaw, '--start');
const endDate = parseDate(endDateRaw, '--end', true);
if (startDate > endDate) {
  throw new Error('--start must be before or equal to --end.');
}

const endpoint = requiredEnv('R2_ENDPOINT', ['VITE_R2_ENDPOINT']);
const accessKeyId = requiredEnv('R2_ACCESS_KEY_ID', ['VITE_R2_ACCESS_KEY_ID']);
const secretAccessKey = requiredEnv('R2_SECRET_ACCESS_KEY', ['VITE_R2_SECRET_ACCESS_KEY']);
const bucket = requiredEnv('R2_BUCKET_NAME', ['VITE_R2_BUCKET_NAME']);

const r2 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const matches = [];
let scanned = 0;
let continuationToken;

do {
  const response = await r2.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    ContinuationToken: continuationToken,
    MaxKeys: 1000,
  }));

  for (const object of response.Contents || []) {
    scanned += 1;
    if (!object.Key || !object.LastModified) continue;
    if (object.LastModified >= startDate && object.LastModified <= endDate) {
      matches.push({
        Key: object.Key,
        LastModified: object.LastModified.toISOString(),
        Size: object.Size || 0,
      });
      if (matches.length >= maxObjects) break;
    }
  }

  if (matches.length >= maxObjects) break;
  continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
} while (continuationToken);

console.log(JSON.stringify({
  bucket,
  prefix,
  range: { start: startDate.toISOString(), end: endDate.toISOString() },
  mode: execute ? 'execute' : 'dry-run',
  scanned,
  matched: matches.length,
  totalBytes: matches.reduce((sum, item) => sum + item.Size, 0),
  samples: matches.slice(0, 20),
}, null, 2));

if (!execute || matches.length === 0) {
  if (!execute) {
    console.log('Dry-run only. Re-run with --execute to delete matched R2 objects.');
  }
  process.exit(0);
}

let deleted = 0;
for (let i = 0; i < matches.length; i += 500) {
  const chunk = matches.slice(i, i + 500);
  await r2.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: {
      Objects: chunk.map(({ Key }) => ({ Key })),
      Quiet: true,
    },
  }));
  deleted += chunk.length;
  console.log(`Deleted ${deleted}/${matches.length}`);
}

console.log(`Done. Deleted ${deleted} R2 objects. Supabase was not touched.`);
