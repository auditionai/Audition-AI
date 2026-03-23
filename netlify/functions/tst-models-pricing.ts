import type { Handler } from '@netlify/functions';
import { getTstCatalogMetadata, getTstProviderPricing } from './_tst-live-catalog';

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
    const pricing = await getTstProviderPricing(forceRefresh);
    const metadata = getTstCatalogMetadata();
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        pricing,
        fetchedAt: metadata.pricingFetchedAt,
        expiresAt: metadata.pricingExpiresAt,
        ttlMs: metadata.ttlMs,
      }),
    };
  } catch (error: any) {
    console.error('TST pricing proxy error:', error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};
