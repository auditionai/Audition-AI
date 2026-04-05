import { runWithVertexCredentialFailover } from './_vertex-credentials';

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
  resolution?: string;
  aspectRatio?: string;
};

const normalizeImageSize = (value?: string) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === '512') return '512';
  if (normalized === '1K') return '1K';
  if (normalized === '2K') return '2K';
  if (normalized === '4K') return '4K';
  return undefined;
};

const normalizeAspectRatio = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;

  const supportedAspectRatios = new Set([
    '1:1',
    '3:4',
    '4:3',
    '9:16',
    '16:9',
    '3:2',
    '2:3',
    '4:5',
    '5:4',
    '21:9',
    '9:21',
  ]);

  return supportedAspectRatios.has(normalized) ? normalized : undefined;
};

export const runVertexImageEdit = async ({
  sourceImage,
  instruction,
  modelId,
  mimeType,
  resolution,
  aspectRatio,
}: RunVertexImageEditParams): Promise<string> => {
  const preferPro = modelId.toLowerCase().includes('pro');
  const modelName = preferPro ? PRO_IMAGE_MODEL : FLASH_IMAGE_MODEL;
  const imageSize = normalizeImageSize(resolution);
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
  const imageConfig = {
    ...(normalizedAspectRatio ? { aspectRatio: normalizedAspectRatio } : {}),
    ...(imageSize ? { imageSize } : {}),
  };

  return runWithVertexCredentialFailover({
    taskName: `image editing (${modelName})`,
    operation: async ({ projectId, accessToken }) => {
      const response = await fetch(
        `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${modelName}:generateContent`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
              responseModalities: ['TEXT', 'IMAGE'],
              ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
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
    },
  });
};
