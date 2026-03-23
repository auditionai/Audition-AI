import { GoogleAuth } from 'google-auth-library';
import { getServiceRoleClient } from './_supabase';
import type { ImageGenerateRecipePayload } from '../../shared/queueRecipes';

type VertexCredentialRow = {
  id: string;
  name: string | null;
  key_value: string | null;
  last_used_at?: string | null;
};

const VERTEX_MODEL = 'gemini-3.1-pro-preview';

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

const getPreferredVertexCredential = async () => {
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
    throw new Error('Không tìm thấy Service Account JSON [PRO] hợp lệ để phân tích ảnh.');
  }

  const sorted = [...validCredentials].sort((a, b) => {
    const aPro = a.name?.includes('[PRO]') ? 1 : 0;
    const bPro = b.name?.includes('[PRO]') ? 1 : 0;
    if (aPro !== bPro) return bPro - aPro;
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

const toInlineImagePart = async (source: string) => {
  if (!source) {
    throw new Error('Missing image source');
  }

  let mimeType = 'image/jpeg';
  let base64Data = source;

  if (source.startsWith('http')) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch reference image: ${await parseErrorMessage(response)}`);
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

const buildStrictImageDirectorInstruction = (
  payload: ImageGenerateRecipePayload,
  hasCharacters: boolean,
  hasSample: boolean,
  hasStyle: boolean,
) => {
  const sections: string[] = [];

  sections.push(
    'You are a master AI image generation director and forensic visual analyst.',
    'Your job is to analyze the provided reference images in strict role order and produce one final COMMAND PROMPT for the rendering engine.',
    'You must obey the role of each image exactly. Never mix roles. Never invent missing details.',
    'The final rendered subject must remain a stylized 3D game avatar, not a real human or semi-realistic portrait.',
    '',
    `USER CORE REQUEST: ${payload.prompt}`,
  );

  if (payload.stylePrompt?.trim()) {
    sections.push(`STYLE PRESET KEYWORDS: ${payload.stylePrompt.trim()}`);
  }

  if (payload.negativePrompt?.trim()) {
    sections.push(`USER NEGATIVE CONSTRAINTS: ${payload.negativePrompt.trim()}`);
  }

  sections.push('', 'REFERENCE ROLE ORDER:');

  let imageIndex = 1;
  if (hasCharacters) {
    sections.push(
      `- Images 1 to ${payload.characterImages!.length}: CHARACTER REFERENCE. Source of truth for face, hair, head shape, ear shape, body proportions, skin tone, clothing, shoes, accessories, gender, and identity. COPY EXACTLY. DO NOT INVENT. The character is already a stylized 3D game avatar. Preserve that topology and do not humanize it.`,
    );
    imageIndex += payload.characterImages!.length;
  }

  if (hasSample) {
    sections.push(`- Image ${imageIndex}: SAMPLE / POSE / BACKGROUND reference. COPY EXACTLY the pose, camera angle, framing, environment layout, and scene composition from this image. DO NOT steal identity, outfit, skin texture, facial anatomy, hair texture, or realism from it. If this sample is a real human photo, use it only as composition choreography.`);
    imageIndex += 1;
  }

  if (hasStyle) {
    sections.push(`- Image ${imageIndex}: STYLE reference. COPY EXACTLY the rendering quality, artistic material, lighting behavior, color grading, atmosphere, stylized skin shading, stylized hand treatment, stylized facial planes, and visual finish from this image. DO NOT steal subject identity from it.`);
  }

  sections.push(
    '',
    'OUTPUT REQUIREMENTS:',
    '1. Return ONLY the final command prompt.',
    '2. The final command prompt must explicitly command the renderer to COPY AND PASTE the character identity from the character references, including face shape, eyes, hair silhouette, body structure, skin tone, outfit, shoes, and accessories.',
    '3. The final command prompt must explicitly state that the subject must remain a stylized 3D game character / MMO avatar and must NOT become photorealistic, semi-realistic, or humanized.',
    '4. If a sample image is provided, the final command prompt must explicitly command the renderer to COPY the exact pose, framing, camera angle, and background from it, while forbidding any borrowing of real-human realism or identity from it.',
    '5. If a style image is provided, the final command prompt must explicitly command the renderer to COPY the exact render style, lighting, material quality, color grading, stylized skin shading, and stylized facial/hand treatment from it.',
    '6. The prompt must state that the renderer is FORBIDDEN from inventing extra characters, replacing the face, changing the hair, changing the outfit, improvising the composition, or blending the roles of the references.',
    '7. If multiple character references are provided, reconcile them into the same identity, prioritizing face fidelity, body fidelity, and outfit accuracy.',
    '8. Mention that the reference images will be provided again to the renderer in the same order.',
    '9. Explicitly forbid realistic human skin pores, realistic human facial anatomy, realistic photographic shading, and live-action body proportions if they conflict with the game-avatar look.',
    '',
    'Do not explain your reasoning. Output only the final command prompt.',
  );

  return sections.join('\n');
};

export const synthesizeStrictImagePrompt = async (payload: ImageGenerateRecipePayload) => {
  const characterImages = payload.characterImages || [];
  const hasCharacters = characterImages.length > 0;
  const hasSample = Boolean(payload.sampleImage);
  const hasStyle = Boolean(payload.styleImage);

  if (!hasCharacters) {
    throw new Error('CRITICAL FAILURE: Character reference images are missing.');
  }

  const orderedSources = [
    ...characterImages,
    ...(payload.sampleImage ? [payload.sampleImage] : []),
    ...(payload.styleImage ? [payload.styleImage] : []),
  ];

  const parts: Array<Record<string, unknown>> = await Promise.all(orderedSources.map((image) => toInlineImagePart(image)));

  parts.push({
    text: buildStrictImageDirectorInstruction(payload, hasCharacters, hasSample, hasStyle),
  });

  const credentials = await getPreferredVertexCredential();
  const projectId = credentials.project_id;

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const token = accessToken.token;

  if (!projectId || !token) {
    throw new Error('Failed to initialize Vertex AI credentials for image analysis.');
  }

  const response = await fetch(
    `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${VERTEX_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(180000),
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    throw new Error('Vertex AI did not return a synthesized image prompt.');
  }

  return text;
};
