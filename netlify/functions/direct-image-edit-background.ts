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

const parseJobIdFromEventBody = (body?: string | null) => {
  const parsed = JSON.parse(body || '{}') as DirectImageEditBackgroundBody;
  return String(parsed.jobId || '').trim();
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
    const jobId = parseJobIdFromEventBody(event.body);
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
    const jobId = parseJobIdFromEventBody(event.body);
    if (!jobId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing jobId' }),
      };
    }

    // Render web runs in a persistent Node process, so detach the processor and
    // acknowledge immediately instead of blocking the launcher request.
    setImmediate(() => {
      void runDirectImageEditBackground(jobId);
    });

    return {
      statusCode: 202,
      body: JSON.stringify({ success: true, accepted: true }),
    };
  } catch (error: any) {
    return {
      statusCode: /Method Not Allowed/i.test(String(error?.message || '')) ? 405 : 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};

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
