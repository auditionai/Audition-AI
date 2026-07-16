import type { Handler } from '@netlify/functions';
import { getTstCatalogMetadata, getTstProviderModels } from './_tst-live-catalog';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const getResponseHeaders = (forceRefresh: boolean) => forceRefresh
  ? { ...jsonHeaders, 'Cache-Control': 'no-store' }
  : {
      ...jsonHeaders,
      'Cache-Control': 'public, max-age=60',
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=300, stale-while-revalidate=600',
    };

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...jsonHeaders,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: jsonHeaders, body: 'Method Not Allowed' };
  }

  try {
    const forceRefresh = event.queryStringParameters?.force === '1';
    const models = await getTstProviderModels(forceRefresh);
    const metadata = getTstCatalogMetadata();
    return {
      statusCode: 200,
      headers: getResponseHeaders(forceRefresh),
      body: JSON.stringify({
        models,
        fetchedAt: metadata.modelsFetchedAt,
        expiresAt: metadata.modelsExpiresAt,
        ttlMs: metadata.ttlMs,
      }),
    };
  } catch (error: any) {
    console.error('TST models proxy error:', error);
    return {
      statusCode: 500,
      headers: { ...jsonHeaders, 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};
