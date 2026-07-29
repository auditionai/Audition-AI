import type { Handler } from '@netlify/functions';
import { processDirectImageEditJob } from './_direct-image-edit-processor';
import { verifyInternalRequest } from './_internal-request-auth';

type DirectImageEditBackgroundBody = {
  jobId?: string;
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

const isAuthorizedEvent = (body: string, headers: Record<string, string | undefined>) =>
  verifyInternalRequest(
    'direct-image-edit-background',
    body,
    (name) => headers[name] || headers[name.toLowerCase()] || '',
  );

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

  if (!isAuthorizedEvent(event.body || '', event.headers)) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized internal request' }),
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

  if (!isAuthorizedEvent(event.body || '', event.headers)) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized internal request' }),
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

  const body = await request.text();
  if (!verifyInternalRequest(
    'direct-image-edit-background',
    body,
    (name) => request.headers.get(name),
  )) {
    throw new Error('Unauthorized internal request');
  }

  const parsed = JSON.parse(body || '{}') as DirectImageEditBackgroundBody;
  const jobId = String(parsed.jobId || '').trim();
  if (!jobId) {
    throw new Error('Missing jobId');
  }

  await runDirectImageEditBackground(jobId);
};
