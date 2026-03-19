import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
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

    const response = await fetch('https://api.tramsangtao.com/v1/image/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TST_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data)
    };

  } catch (error: any) {
    console.error("TST API Proxy Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
