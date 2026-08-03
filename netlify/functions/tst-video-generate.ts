import type { Handler } from '@netlify/functions';
import { getAuthenticatedRequestErrorStatus, requireAdminUser } from './_supabase';
import { normalizeTstOutboundPayload } from './_tst-payload-normalizer';
import { getTstVideoGeneratePath } from './_tst-generate-endpoints';
import { validateQueuePayloadAgainstLiveCatalog } from './_tst-live-catalog';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...jsonHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: jsonHeaders, body: 'Method Not Allowed' };
  }

  try {
    await requireAdminUser(event);
    const TST_API_KEY = process.env.TST_API_KEY;
    if (!TST_API_KEY) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Missing TST_API_KEY environment variable' }),
      };
    }

    const payload = normalizeTstOutboundPayload(JSON.parse(event.body || '{}'));
    await validateQueuePayloadAgainstLiveCatalog('video_generate', payload);
    const response = await fetch(`https://api.tramsangtao.com/v1${getTstVideoGeneratePath(payload.model)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });

    const rawBody = await response.text();
    let data: unknown = {};

    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { raw: rawBody };
    }

    return {
      statusCode: response.status,
      headers: jsonHeaders,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    const statusCode = String(error?.message || '').startsWith('INVALID_TST_CONFIG:')
      ? 400
      : error?.message === 'Forbidden'
        ? 403
        : getAuthenticatedRequestErrorStatus(error);
    if (statusCode >= 500) console.error('TST video generate proxy error:', error);
    return {
      statusCode,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};
