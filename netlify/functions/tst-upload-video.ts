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
    return { statusCode: 405, headers: jsonHeaders, body: 'Method Not Allowed' };
  }

  try {
    const TST_API_KEY = process.env.TST_API_KEY;
    if (!TST_API_KEY) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Missing TST_API_KEY environment variable' }),
      };
    }

    const response = await fetch('https://api.tramsangtao.com/v1/files/upload/video', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TST_API_KEY}`,
        'Content-Type': event.headers['content-type'] || event.headers['Content-Type'] || '',
      },
      body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : event.body,
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
    console.error('TST video upload proxy error:', error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};
