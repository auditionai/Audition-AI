import type { Handler } from '@netlify/functions';
import { processDirectImageEditJob } from './_direct-image-edit-processor';

type DirectImageEditBackgroundBody = {
  jobId?: string;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}') as DirectImageEditBackgroundBody;
    const jobId = String(body.jobId || '').trim();
    if (!jobId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing jobId' }),
      };
    }

    const result = await processDirectImageEditJob(jobId);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result }),
    };
  } catch (error: any) {
    console.error('[direct-image-edit-background] failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
