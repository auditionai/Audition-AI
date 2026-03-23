import type { Handler } from '@netlify/functions';

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
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const TST_API_KEY = process.env.TST_API_KEY;
    if (!TST_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing TST_API_KEY environment variable' })
      };
    }

    const payload = JSON.parse(event.body || '{}');
    const startedAt = Date.now();

    const response = await fetch('https://api.tramsangtao.com/v1/image/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TST_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(295000)
    });

    const rawBody = await response.text();
    let data: unknown = {};

    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = {
        raw: rawBody,
      };
    }

    console.log('TST generate upstream completed', {
      status: response.status,
      durationMs: Date.now() - startedAt,
    });

    return {
      statusCode: response.status,
      headers: jsonHeaders,
      body: JSON.stringify(data)
    };

  } catch (error: any) {
    console.error("TST API Proxy Error:", error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
