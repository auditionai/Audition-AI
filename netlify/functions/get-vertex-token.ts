import type { Handler } from '@netlify/functions';
import { GoogleAuth } from 'google-auth-library';
import { isVertexServiceAccountJson, runWithVertexCredentialFailover } from './_vertex-credentials';

const buildTokenFromCredential = async (serviceAccountJson: string) => {
  if (!serviceAccountJson || !isVertexServiceAccountJson(serviceAccountJson)) {
    throw new Error('Noi dung khong phai la file Service Account JSON hop le.');
  }

  const credentials = JSON.parse(serviceAccountJson);
  const projectId = credentials.project_id;

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  if (!projectId || !accessToken.token) {
    throw new Error('Khong the tao Access Token tu Service Account cung cap.');
  }

  return {
    accessToken: accessToken.token,
    projectId,
    location: 'global',
  };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const providedCredential = typeof body?.service_account_json === 'string' ? body.service_account_json : '';
    const useProvidedCredential = body?.useProvidedCredential === true;

    if (useProvidedCredential && providedCredential) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(await buildTokenFromCredential(providedCredential)),
      };
    }

    const tokenPayload = await runWithVertexCredentialFailover({
      taskName: 'vertex token generation',
      operation: async ({ projectId, accessToken }) => ({
        accessToken,
        projectId,
        location: 'global',
      }),
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(tokenPayload),
    };
  } catch (error: any) {
    console.error('Token Generation Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};
