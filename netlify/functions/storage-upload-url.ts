import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Handler } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const getEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
};

const R2_ENDPOINT = getEnv('R2_ENDPOINT');
const R2_ACCESS_KEY_ID = getEnv('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = getEnv('R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = getEnv('R2_BUCKET_NAME');
const R2_PUBLIC_URL = getEnv('R2_PUBLIC_URL', 'VITE_R2_PUBLIC_URL').replace(/\/+$/, '');

const isR2Configured = () =>
  Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL);

const getR2Client = () => {
  if (!isR2Configured()) {
    throw new Error('R2StorageNotConfigured');
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

const cleanSegment = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\w./-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[/.-]+|[/.-]+$/g, '')
    .slice(0, 180);

const extensionForMime = (contentType: string) => {
  const normalized = contentType.split(';', 1)[0].trim().toLowerCase();
  const known: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return known[normalized] || 'bin';
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const { user } = await requireAuthenticatedUser(event, { checkAccountStatus: true });

    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ready: true, provider: isR2Configured() ? 'r2' : 'supabase' }),
      };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    const body = JSON.parse(event.body || '{}') as { folder?: string; contentType?: string };
    const contentType = String(body.contentType || '').trim().toLowerCase();
    if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(contentType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Loại tệp không được hỗ trợ.' }),
      };
    }

    const requestedFolder = cleanSegment(String(body.folder || 'inputs')) || 'inputs';
    const key = `users/${user.id}/${requestedFolder}/${Date.now()}-${randomUUID()}.${extensionForMime(contentType)}`;

    if (!isR2Configured()) {
      const admin = getServiceRoleClient();
      const bucket = admin.storage.from('images');
      const { data, error } = await bucket.createSignedUploadUrl(key, { upsert: false });
      if (error || !data?.signedUrl || !data?.token) {
        throw error || new Error('Không thể tạo URL tải lên dự phòng.');
      }
      const { data: publicData } = bucket.getPublicUrl(key);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          provider: 'supabase',
          path: data.path || key,
          token: data.token,
          publicUrl: publicData.publicUrl,
          expiresIn: 7200,
        }),
      };
    }

    const r2 = getR2Client();
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        provider: 'r2',
        uploadUrl,
        publicUrl: `${R2_PUBLIC_URL}/${key}`,
        expiresIn: 300,
      }),
    };
  } catch (error: any) {
    const message = String(error?.message || 'Internal Server Error');
    const statusCode =
      message === 'Unauthorized' ? 401 :
      message === 'AccountLocked' ? 403 :
      500;
    console.error('[storage-upload-url] failed:', message);
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: message,
      }),
    };
  }
};
