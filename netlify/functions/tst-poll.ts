import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
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
      }
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
