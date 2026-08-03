import type { Handler } from '@netlify/functions';
import { getGommoProviderCatalog } from './_gommo-provider';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const forceRefresh = event.queryStringParameters?.force === '1';
    const gommo = await getGommoProviderCatalog(forceRefresh);
    return {
      statusCode: 200,
      headers: forceRefresh
        ? { ...headers, 'Cache-Control': 'no-store' }
        : { ...headers, 'Cache-Control': 'public, max-age=60', 'Netlify-CDN-Cache-Control': 'public, durable, max-age=300' },
      body: JSON.stringify({ gommo, fetchedAt: new Date().toISOString() }),
    };
  } catch (error: any) {
    console.error('[provider-catalog] Gommo catalog error:', error);
    return {
      statusCode: 502,
      headers: { ...headers, 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: error?.message || 'Failed to load provider catalog' }),
    };
  }
};
