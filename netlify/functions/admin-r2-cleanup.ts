import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_DB_ROWS = 200;
const MAX_R2_OBJECTS = 500;
const MAX_R2_SCAN_PAGES = 3;
const DELETE_CHUNK_SIZE = 500;

const getEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
};

const R2_ENDPOINT = getEnv('R2_ENDPOINT', 'VITE_R2_ENDPOINT');
const R2_ACCESS_KEY_ID = getEnv('R2_ACCESS_KEY_ID', 'VITE_R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = getEnv('R2_SECRET_ACCESS_KEY', 'VITE_R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = getEnv('R2_BUCKET_NAME', 'VITE_R2_BUCKET_NAME');
const R2_PUBLIC_URL = getEnv('R2_PUBLIC_URL', 'VITE_R2_PUBLIC_URL');

type CleanupBody = {
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
  includePublic?: boolean;
  includeOrphanR2?: boolean;
  prefix?: string;
};

type CandidateRow = {
  id: string;
  image_url?: string | null;
  created_at?: string | null;
  is_public?: boolean | null;
  status?: string | null;
  asset_type?: string | null;
  tool_name?: string | null;
};

const parseDateRange = (body: CleanupBody) => {
  const startRaw = String(body.startDate || '').trim();
  const endRaw = String(body.endDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
    throw new Error('Vui long chon day du ngay bat dau va ngay ket thuc.');
  }

  const start = new Date(`${startRaw}T00:00:00.000Z`);
  const endExclusive = new Date(`${endRaw}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime()) || start >= endExclusive) {
    throw new Error('Khoang ngay khong hop le.');
  }

  return {
    start,
    endExclusive,
    startIso: start.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
  };
};

const getR2Client = () => {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error('R2 chua duoc cau hinh tren server.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
};

const extractR2KeyFromUrl = (assetUrl?: string | null) => {
  const value = String(assetUrl || '').trim();
  if (!value || !R2_PUBLIC_URL) return null;

  if (value.startsWith(`${R2_PUBLIC_URL}/`)) {
    return decodeURIComponent(value.slice(R2_PUBLIC_URL.length + 1));
  }

  try {
    const publicUrl = new URL(R2_PUBLIC_URL);
    const asset = new URL(value);
    if (asset.host !== publicUrl.host) return null;
    const key = asset.pathname.replace(/^\/+/, '');
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
};

const deleteR2Objects = async (r2: S3Client, keys: string[]) => {
  let deleted = 0;
  const uniqueKeys = [...new Set(keys)].filter(Boolean);

  for (let i = 0; i < uniqueKeys.length; i += DELETE_CHUNK_SIZE) {
    const chunk = uniqueKeys.slice(i, i + DELETE_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    await r2.send(new DeleteObjectsCommand({
      Bucket: R2_BUCKET_NAME,
      Delete: {
        Objects: chunk.map((Key) => ({ Key })),
        Quiet: true,
      },
    }));
    deleted += chunk.length;
  }

  return deleted;
};

const loadProtectedKeys = async (includePublic: boolean) => {
  const admin = getServiceRoleClient();
  const protectedKeys = new Set<string>();

  if (!includePublic) {
    const { data, error } = await admin
      .from('generated_images')
      .select('image_url')
      .eq('is_public', true)
      .not('image_url', 'is', null)
      .limit(5000);

    if (error) throw error;
    for (const row of (data || []) as Array<{ image_url?: string | null }>) {
      const key = extractR2KeyFromUrl(row.image_url);
      if (key) protectedKeys.add(key);
    }
  }

  const { data: activeRows, error: activeError } = await admin
    .from('generated_images')
    .select('image_url')
    .in('status', ['queued', 'processing'])
    .not('image_url', 'is', null)
    .limit(5000);

  if (activeError) throw activeError;
  for (const row of (activeRows || []) as Array<{ image_url?: string | null }>) {
    const key = extractR2KeyFromUrl(row.image_url);
    if (key) protectedKeys.add(key);
  }

  return protectedKeys;
};

const listR2ObjectsByDate = async (
  r2: S3Client,
  start: Date,
  endExclusive: Date,
  prefix: string,
  protectedKeys: Set<string>,
) => {
  const keys: string[] = [];
  const samples: Array<{ key: string; lastModified?: string; size?: number }> = [];
  let continuationToken: string | undefined;
  let scanned = 0;
  let pages = 0;

  do {
    pages += 1;
    const response = await r2.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix || undefined,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    for (const object of response.Contents || []) {
      scanned += 1;
      const key = object.Key || '';
      const lastModified = object.LastModified;
      if (!key || !lastModified || protectedKeys.has(key)) continue;
      if (lastModified >= start && lastModified < endExclusive) {
        keys.push(key);
        if (samples.length < 20) {
          samples.push({ key, lastModified: lastModified.toISOString(), size: object.Size });
        }
      }
      if (keys.length >= MAX_R2_OBJECTS) break;
    }

    if (keys.length >= MAX_R2_OBJECTS) break;
    if (pages >= MAX_R2_SCAN_PAGES) break;
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return { keys, samples, scanned };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { user } = await requireAuthenticatedUser(event);
    const admin = getServiceRoleClient();
    const { data: requester, error: requesterError } = await admin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (requesterError) throw requesterError;
    if (!requester?.is_admin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const body = JSON.parse(event.body || '{}') as CleanupBody;
    const { start, endExclusive, startIso, endExclusiveIso } = parseDateRange(body);
    const dryRun = body.dryRun !== false;
    const includePublic = body.includePublic === true;
    const includeOrphanR2 = body.includeOrphanR2 === true;
    const prefix = String(body.prefix || '').trim().replace(/^\/+/, '');
    if (includeOrphanR2 && !prefix) {
      throw new Error('Vui long nhap prefix R2 khi quet file mo coi de tranh quet toan bucket.');
    }
    const protectedKeys = includeOrphanR2 ? await loadProtectedKeys(includePublic) : new Set<string>();

    let dbQuery = admin
      .from('generated_images')
      .select('id, image_url, created_at, is_public, status, asset_type, tool_name')
      .gte('created_at', startIso)
      .lt('created_at', endExclusiveIso)
      .not('status', 'in', '("queued","processing")')
      .order('created_at', { ascending: true })
      .limit(MAX_DB_ROWS);

    if (!includePublic) {
      dbQuery = dbQuery.eq('is_public', false);
    }

    const { data: rows, error: rowsError } = await dbQuery;
    if (rowsError) throw rowsError;

    const dbRows = (rows || []) as CandidateRow[];
    const dbR2Keys = dbRows
      .map((row) => extractR2KeyFromUrl(row.image_url))
      .filter((key): key is string => Boolean(key) && !protectedKeys.has(key));
    const dbSamples = dbRows.slice(0, 20).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      isPublic: !!row.is_public,
      status: row.status,
      assetType: row.asset_type || 'image',
      toolName: row.tool_name || '',
      r2Key: extractR2KeyFromUrl(row.image_url),
    }));

    const orphanResult = includeOrphanR2
      ? await listR2ObjectsByDate(getR2Client(), start, endExclusive, prefix, protectedKeys)
      : { keys: [] as string[], samples: [] as Array<{ key: string; lastModified?: string; size?: number }>, scanned: 0 };

    const allR2Keys = [...new Set([...dbR2Keys, ...orphanResult.keys])];
    let deletedR2Objects = 0;
    let deletedDbRows = 0;

    if (!dryRun) {
      if (allR2Keys.length > 0) {
        deletedR2Objects = await deleteR2Objects(getR2Client(), allR2Keys);
      }

      for (let i = 0; i < dbRows.length; i += DELETE_CHUNK_SIZE) {
        const ids = dbRows.slice(i, i + DELETE_CHUNK_SIZE).map((row) => row.id);
        if (ids.length === 0) continue;
        const { data: deletedRows, error: deleteError } = await admin
          .from('generated_images')
          .delete()
          .in('id', ids)
          .select('id');
        if (deleteError) throw deleteError;
        deletedDbRows += Array.isArray(deletedRows) ? deletedRows.length : ids.length;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dryRun,
        range: { startDate: body.startDate, endDate: body.endDate, startIso, endExclusiveIso },
        options: { includePublic, includeOrphanR2, prefix },
        limits: { maxDbRows: MAX_DB_ROWS, maxR2Objects: MAX_R2_OBJECTS },
        matched: {
          dbRows: dbRows.length,
          dbR2Objects: new Set(dbR2Keys).size,
          orphanR2Objects: orphanResult.keys.length,
          totalR2Objects: allR2Keys.length,
          r2Scanned: orphanResult.scanned,
        },
        deleted: { dbRows: deletedDbRows, r2Objects: deletedR2Objects },
        samples: { dbRows: dbSamples, r2Objects: orphanResult.samples },
      }),
    };
  } catch (error: any) {
    console.error('[admin-r2-cleanup] failed:', error);
    const statusCode = error?.message === 'Unauthorized' ? 401 : 500;
    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
