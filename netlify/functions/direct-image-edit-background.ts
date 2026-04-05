import type { Handler } from '@netlify/functions';
import { processDirectImageEditJob } from './_direct-image-edit-processor';

type DirectImageEditBackgroundBody = {
  jobId?: string;
};

const getJobIdFromRequest = async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as DirectImageEditBackgroundBody;
  return String(body.jobId || '').trim();
};

export default async (request: Request) => {
  if (request.method !== 'POST') {
    throw new Error('Method Not Allowed');
  }

  const jobId = await getJobIdFromRequest(request);
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

    await processDirectImageEditJob(jobId);
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
