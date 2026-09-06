import type { Handler } from '@netlify/functions';
import { fetchSafeRemoteAsset } from './_safe-remote-fetch';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'private, no-store',
};

const getPublicR2Url = () => String(process.env.R2_PUBLIC_URL || process.env.VITE_R2_PUBLIC_URL || '')
  .trim()
  .replace(/\/+$/, '');

const isAllowedReferenceUrl = (source: string) => {
  const publicR2Url = getPublicR2Url();
  return Boolean(publicR2Url && source.startsWith(`${publicR2Url}/`));
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const source = String(event.queryStringParameters?.source || '').trim();
    if (!isAllowedReferenceUrl(source)) {
      return { statusCode: 403, headers, body: 'Reference image source is not allowed.' };
    }

    const response = await fetchSafeRemoteAsset(source, { timeoutMs: 60_000, maxRedirects: 2 });
    if (!response.ok) {
      return { statusCode: 502, headers, body: `Reference image could not be retrieved (${response.status}).` };
    }

    const contentType = String(response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!contentType.startsWith('image/')) {
      return { statusCode: 415, headers, body: 'Reference source is not an image.' };
    }
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return { statusCode: 413, headers, body: 'Reference image is too large.' };
    }

    const image = Buffer.from(await response.arrayBuffer());
    if (!image.length || image.length > MAX_IMAGE_BYTES) {
      return { statusCode: 413, headers, body: 'Reference image is empty or too large.' };
    }

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': contentType },
      body: image.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error: any) {
    return { statusCode: 500, headers, body: String(error?.message || 'Unable to proxy reference image.') };
  }
};
