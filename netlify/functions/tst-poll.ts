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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
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

    const jobId = event.queryStringParameters?.jobId;
    if (!jobId) {
       return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing jobId parameter' })
      };
    }

    const response = await fetch(`https://api.tramsangtao.com/v1/jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TST_API_KEY}`
      },
      signal: AbortSignal.timeout(30000)
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
