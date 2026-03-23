import { GoogleAuth } from 'google-auth-library';
import { getServiceRoleClient } from './_supabase';

type VertexCredentialRow = {
  id: string;
  name: string | null;
  key_value: string | null;
  last_used_at?: string | null;
};

const FLASH_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error?.message || data?.error || data?.detail || data?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const isServiceAccountJson = (value: string) =>
  value.includes('project_id') && value.includes('private_key') && value.includes('client_email');

const getPreferredVertexCredential = async (preferPro: boolean) => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('api_keys')
    .select('id, name, key_value, last_used_at')
    .eq('status', 'active');

  if (error) {
    throw error;
  }

  const validCredentials = ((data || []) as VertexCredentialRow[]).filter((row) =>
    typeof row.key_value === 'string' && isServiceAccountJson(row.key_value),
  );

  if (validCredentials.length === 0) {
    throw new Error('Không tìm thấy Service Account JSON hợp lệ cho Vertex AI image editing.');
  }

  const sorted = [...validCredentials].sort((a, b) => {
    const aScore = preferPro && a.name?.includes('[PRO]') ? 1 : 0;
    const bScore = preferPro && b.name?.includes('[PRO]') ? 1 : 0;
    if (aScore !== bScore) return bScore - aScore;
    return new Date(a.last_used_at || 0).getTime() - new Date(b.last_used_at || 0).getTime();
  });

  const selected = sorted[0];
  const credentials = JSON.parse(selected.key_value || '{}');

  admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', selected.id)
    .then(() => {})
    .catch(() => {});

  return credentials;
};

const toInlineImagePart = async (source: string, fallbackMimeType?: string) => {
  if (!source) {
    throw new Error('Missing source image for editing.');
  }

  let mimeType = fallbackMimeType || 'image/jpeg';
  let base64Data = source;

  if (source.startsWith('http')) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch source image: ${await parseErrorMessage(response)}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type');
    mimeType = contentType || mimeType;
    base64Data = Buffer.from(arrayBuffer).toString('base64');
  } else if (source.startsWith('data:')) {
    const [header, body] = source.split(',', 2);
    base64Data = body || '';
    mimeType = header.match(/^data:(.*?);base64$/)?.[1] || mimeType;
  } else {
    base64Data = source.replace(/^data:[^;]+;base64,/, '');
  }

  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
};

type RunVertexImageEditParams = {
  sourceImage: string;
  instruction: string;
  modelId: string;
  mimeType?: string;
};

export const runVertexImageEdit = async ({
  sourceImage,
  instruction,
  modelId,
  mimeType,
}: RunVertexImageEditParams): Promise<string> => {
  const preferPro = modelId.toLowerCase().includes('pro');
  const modelName = preferPro ? PRO_IMAGE_MODEL : FLASH_IMAGE_MODEL;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const credentials = await getPreferredVertexCredential(preferPro);
      const projectId = credentials.project_id;

      const auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();
      const token = accessToken.token;

      if (!projectId || !token) {
        throw new Error('Failed to initialize Vertex AI credentials for image editing.');
      }

      const response = await fetch(
        `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${modelName}:generateContent`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  await toInlineImagePart(sourceImage, mimeType),
                  { text: instruction },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              topP: 0.8,
              maxOutputTokens: 8192,
            },
          }),
          signal: AbortSignal.timeout(120000),
        },
      );

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const data = await response.json();
      const imagePart = data?.candidates?.[0]?.content?.parts?.find((part: any) => part?.inlineData?.data);
      const inlineData = imagePart?.inlineData;

      if (!inlineData?.data) {
        throw new Error('Vertex AI image editing did not return image data.');
      }

      const outputMimeType = inlineData.mimeType || 'image/png';
      return `data:${outputMimeType};base64,${inlineData.data}`;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('Vertex AI image editing failed.');
};
