import type { BackgroundHandler, Handler } from '@netlify/functions';
import { processDirectImageEditJob } from './_direct-image-edit-processor';

type DirectImageEditBackgroundBody = {
  jobId?: string;
};

export const handler: BackgroundHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return;
  }

  if (event.httpMethod !== 'POST') {
    throw new Error('Method Not Allowed');
  }

  const body = JSON.parse(event.body || '{}') as DirectImageEditBackgroundBody;
  const jobId = String(body.jobId || '').trim();
  if (!jobId) {
    throw new Error('Missing jobId');
  }

  try {
    await processDirectImageEditJob(jobId);
  } catch (error: any) {
    console.error('[direct-image-edit-background] failed:', error);
    throw error;
  }
};

export const localHandler: Handler = async (event) => {
  try {
    await handler(event, {} as any);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error: any) {
    return {
      statusCode: /Method Not Allowed/i.test(String(error?.message || '')) ? 405 : 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
