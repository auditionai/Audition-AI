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

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return Response.json({ error: 'Method Not Allowed' }, { status: 405 });

  const body = await request.text();
  if (!verifyInternalRequest(
    'direct-image-edit-background',
    body,
    (name) => request.headers.get(name),
  )) {
    return Response.json({ error: 'Unauthorized internal request' }, { status: 401 });
  }

  const parsed = JSON.parse(body || '{}') as DirectImageEditBackgroundBody;
  const jobId = String(parsed.jobId || '').trim();
  if (!jobId) {
    return Response.json({ error: 'Missing jobId' }, { status: 400 });
  }

  try {
    await runDirectImageEditBackground(jobId);
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
  return Response.json({ success: true });
};
