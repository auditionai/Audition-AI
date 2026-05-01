import type { Handler } from '@netlify/functions';
import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODEL = 'gemini-3.1-pro-preview';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error?.message || data?.error || data?.detail || data?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const toInlineImagePart = async (source: string) => {
  if (!source) throw new Error('Missing reference image.');

  let mimeType = 'image/jpeg';
  let base64Data = source;

  if (source.startsWith('http')) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch reference image: ${await parseErrorMessage(response)}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    mimeType = response.headers.get('content-type') || mimeType;
    base64Data = Buffer.from(arrayBuffer).toString('base64');
  } else if (source.startsWith('data:')) {
    const [header, body] = source.split(',', 2);
    base64Data = body || '';
    mimeType = header.match(/^data:(.*?);base64$/)?.[1] || mimeType;
  } else {
    base64Data = source.replace(/^data:[^;]+;base64,/, '');
  }

  if (!base64Data.trim()) throw new Error('Reference image data is empty.');

  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
};

const clampDurationSeconds = (value: unknown) => {
  const parsed = Number(String(value || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(30, Math.max(3, Math.round(parsed)));
};

const buildDirectorInstruction = (durationSeconds: number, userPrompt: string) => [
  'You are a cinematic AI video director for an image-to-video generation pipeline.',
  'Analyze the uploaded reference image and write a precise video prompt/script for the selected duration.',
  'Output language rule: the final script MUST be written entirely in Vietnamese.',
  'Do not answer in English. Do not mix English sentences into the script, except unavoidable proper names, model names, or brand labels visible in the image.',
  `The target video duration is ${durationSeconds} seconds. Structure the motion timing to fit this duration.`,
  userPrompt.trim() ? `User idea to incorporate: ${userPrompt.trim()}` : '',
  '',
  'Hard constraints that must be included in the final script:',
  '- Do not create a real human video.',
  '- Do not invent a new character.',
  '- Preserve the exact face, facial proportions, makeup, accessories, outfit design, outfit colors, body identity, and character quality from the uploaded reference image.',
  '- Do not deform the face, eyes, nose, mouth, hands, outfit, or character silhouette.',
  '- Do not change clothing colors, logos, patterns, or material identity.',
  '- The character quality in the video must remain equivalent to the uploaded reference image.',
  '- Do not make the character look like a child, baby, toddler, or children cartoon.',
  '- Choose camera movement, background motion, music, and sound design that match the scene context.',
  '',
  'Write only the final Vietnamese prompt/script. No markdown, no JSON, no explanation.',
  'The output should be detailed enough for Seedance/Kling/Grok video generation, but stay under 3000 characters.',
].filter(Boolean).join('\n');

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...jsonHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: jsonHeaders, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const imageSource = String(body.imageSource || '').trim();
    const durationSeconds = clampDurationSeconds(body.durationSeconds);
    const userPrompt = String(body.userPrompt || '').trim();
    const imagePart = await toInlineImagePart(imageSource);
    const promptPart = { text: buildDirectorInstruction(durationSeconds, userPrompt) };

    const script = await runWithVertexCredentialFailover({
      taskName: 'video script director',
      operation: async ({ projectId, accessToken }) => {
        const response = await fetch(
          `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${VERTEX_MODEL}:generateContent`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [imagePart, promptPart] }],
              generationConfig: {
                temperature: 0.45,
                topP: 0.8,
                maxOutputTokens: 1600,
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
          throw new Error('Vertex AI did not return a video script.');
        }
        return text.slice(0, 3000);
      },
    });

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ script }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error?.message || 'Failed to generate video script.' }),
    };
  }
};
