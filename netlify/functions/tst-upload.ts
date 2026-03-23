import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
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

    // Pass the multipart/form-data directly to Tramsangtao
    const response = await fetch('https://api.tramsangtao.com/v1/files/upload/image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TST_API_KEY}`,
        'Content-Type': event.headers['content-type'] || event.headers['Content-Type'] || ''
      },
      body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : event.body
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
    console.error("TST Upload Proxy Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
