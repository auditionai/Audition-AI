import type { Handler } from '@netlify/functions';
import { processDirectImageEditJob } from './_direct-image-edit-processor';

type DirectImageEditBackgroundBody = {
  jobId?: string;
};

const getJobIdFromRequest = async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as DirectImageEditBackgroundBody;
  return String(body.jobId || '').trim();
};

const runDirectImageEditBackground = async (jobId: string) => {
  try {
    await processDirectImageEditJob(jobId);
  } catch (error: any) {
    console.error('[direct-image-edit-background] failed:', error);
    throw error;
  }
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

    await runDirectImageEditBackground(jobId);
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

// Keep local dev imports working while exposing the standard Netlify function entrypoint.
export const localHandler = handler;

export default async (request: Request) => {
  if (request.method !== 'POST') {
    throw new Error('Method Not Allowed');
  }

  const jobId = await getJobIdFromRequest(request);
  if (!jobId) {
    throw new Error('Missing jobId');
  }

  await runDirectImageEditBackground(jobId);
};
