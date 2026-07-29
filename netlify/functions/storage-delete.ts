import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const extractR2Key = (assetUrl: string) => {
  if (!assetUrl || !R2_PUBLIC_URL) return '';
  if (assetUrl.startsWith(`${R2_PUBLIC_URL}/`)) {
    return decodeURIComponent(assetUrl.slice(R2_PUBLIC_URL.length + 1));
  }
  try {
    const publicUrl = new URL(R2_PUBLIC_URL);
    const target = new URL(assetUrl);
    return publicUrl.host === target.host ? decodeURIComponent(target.pathname.replace(/^\/+/, '')) : '';
  } catch {
    return '';
  }
};

const extractSupabaseStoragePath = (assetUrl: string) => {
  try {
    const target = new URL(assetUrl);
    const marker = '/storage/v1/object/public/images/';
    const markerIndex = target.pathname.indexOf(marker);
    if (markerIndex < 0) return '';
    return decodeURIComponent(target.pathname.slice(markerIndex + marker.length));
  } catch {
    return '';
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { user } = await requireAuthenticatedUser(event, { checkAccountStatus: true });
    const body = JSON.parse(event.body || '{}') as { imageId?: string };
    const imageId = String(body.imageId || '').trim();
    if (!imageId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Thiếu mã tác phẩm.' }) };
    }

    const admin = getServiceRoleClient();
    const [{ data: image, error: imageError }, { data: requester, error: requesterError }] = await Promise.all([
      admin.from('generated_images').select('id, user_id, image_url').eq('id', imageId).maybeSingle(),
      admin.from('users').select('is_admin').eq('id', user.id).maybeSingle(),
    ]);
    if (imageError) throw imageError;
    if (requesterError) throw requesterError;
    if (!image) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Không tìm thấy tác phẩm.' }) };
    }
    if (image.user_id !== user.id && requester?.is_admin !== true) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Bạn không có quyền xóa tác phẩm này.' }) };
    }

    const r2Key = extractR2Key(String(image.image_url || ''));
    if (r2Key && R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME) {
      const r2 = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      });
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: r2Key }));
    } else {
      const storagePath = extractSupabaseStoragePath(String(image.image_url || ''));
      if (storagePath) {
        const { error: storageError } = await admin.storage.from('images').remove([storagePath]);
        if (storageError) throw storageError;
      }
    }

    const { error: deleteError } = await admin.from('generated_images').delete().eq('id', imageId);
    if (deleteError) throw deleteError;

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (error: any) {
    const message = String(error?.message || 'Internal Server Error');
    const statusCode = message === 'Unauthorized' ? 401 : message === 'AccountLocked' ? 403 : 500;
    console.error('[storage-delete] failed:', message);
    return { statusCode, headers, body: JSON.stringify({ error: message }) };
  }
};
