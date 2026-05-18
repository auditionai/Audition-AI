import type { Handler } from '@netlify/functions';
import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODELS = Array.from(new Set([
  process.env.VERTEX_VIDEO_SCRIPT_MODEL,
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-preview',
].filter(Boolean))) as string[];
const VERTEX_VIDEO_SCRIPT_TIMEOUT_MS = 55_000;
const VIDEO_SCRIPT_DEADLINE_ERROR = 'VIDEO_SCRIPT_VERTEX_DEADLINE';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const parseErrorMessage = async (response: Response) => {
  const text = await response.text().catch(() => '');
  if (!text) return `${response.status} ${response.statusText}`;

  try {
    const data = JSON.parse(text);
    return data?.error?.message || data?.error || data?.detail || data?.message || text.slice(0, 700);
  } catch {
    return text.slice(0, 700);
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

const normalizeOption = (value: unknown, fallback = 'auto from reference image') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const isModelUnavailableError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('not found') ||
    normalized.includes('model') && normalized.includes('not supported') ||
    normalized.includes('publisher model') && normalized.includes('does not exist')
  );
};

const extractCandidateText = (data: any) => {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();

    if (text) return text;
  }

  return '';
};

const sanitizeDirectorScript = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => !/^(Chủ đề|Âm thanh|Chế độ trend edit|Trend edit mode|Text overlay mode|Selected target model|Model kịch bản)\s*:/i.test(line.trim()))
    .join('\n')
    .trim();

const validateDirectorScript = (value: string) => {
  if (!/Quan sát ảnh tham chiếu\s*:/i.test(value)) {
    throw new Error('AI chưa trả về phần quan sát ảnh tham chiếu đủ rõ. Vui lòng bấm tạo lại để AI phân tích ảnh trực tiếp.');
  }
  if (/Chế độ trend edit\s*:/i.test(value)) {
    throw new Error('AI trả về cấu hình nội bộ thay vì kịch bản video. Vui lòng bấm tạo lại.');
  }
};

const buildDirectorInstruction = (
  durationSeconds: number,
  userPrompt: string,
  scriptOptions: Record<string, unknown>,
) => {
  const style = normalizeOption(scriptOptions.style, 'cinematic');
  const theme = normalizeOption(scriptOptions.theme, 'auto from reference image');
  const soundMood = normalizeOption(scriptOptions.soundMood, 'match the visual context');
  const targetModel = normalizeOption(scriptOptions.targetModel, 'selected video model');
  const voiceDialogue = Boolean(scriptOptions.voiceDialogue);
  const trendEdit = Boolean(scriptOptions.trendEdit);
  const textOverlay = Boolean(scriptOptions.textOverlay);
  const shotCountRule = trendEdit
    ? '- For 5s video: create exactly 5 compact shots. For 8-10s: create 6-8 shots. For 15s or longer: create 8-12 shots.'
    : '- Use a natural number of shots for the image and idea: 2-4 shots for 5s, 3-5 shots for 8-10s, 4-7 shots for 15s or longer. Do not over-cut simple scenes.';

  return [
    'You are a professional AI video director for an image-to-video generation pipeline.',
    'Analyze the uploaded reference image first, then write a precise video prompt/script for the selected duration. The final script must prove that you actually saw the image.',
    'Output language rule: the final script MUST be written entirely in Vietnamese.',
    'Do not answer in English. Do not mix English sentences into the script, except unavoidable proper names, model names, or brand labels visible in the image.',
    `The target video duration is ${durationSeconds} seconds. Structure the motion timing to fit this duration.`,
    `Internal target model context: ${targetModel}. Use this only to choose feasible camera/action detail. Do not print this model/config line in the final script.`,
    `Internal requested style: ${style}.`,
    `Internal requested theme: ${theme}.`,
    `Internal requested sound/music mood: ${soundMood}.`,
    `Trend edit mode: ${trendEdit ? 'ON - use modern Douyin/TikTok/CapCut pacing when it fits the image.' : 'OFF - avoid Douyin/TikTok/CapCut formula unless the user explicitly asked for it.'}`,
    `Text overlay mode: ${textOverlay ? 'ON - include short text overlay instructions only where useful.' : 'OFF - do not include any text overlay, title card, caption, subtitles, or visible typography in the video script.'}`,
    voiceDialogue
      ? 'Dialogue/voice rule: include short natural Vietnamese voice-over or spoken lines only when it fits the scene. The voice must be standard Vietnamese.'
      : 'Dialogue/voice rule: do NOT include spoken dialogue, voice-over, or narrated speech. Use only visual action, ambience, music, and sound effects.',
    userPrompt.trim() ? `User idea to incorporate: ${userPrompt.trim()}` : '',
    '',
    'Reference image analysis requirements:',
    '- Identify visible character count, subject type, framing, camera angle, pose, expression, outfit, accessories, background, color palette, lighting, and mood.',
    '- The final script MUST include a short "Quan sát ảnh tham chiếu" section with at least 6 concrete visible details from the image. Mention actual visible colors, clothing pieces, pose, expression, props/accessories, background elements, lighting, and framing. Do not write generic words like "outfit", "background", or "pose" without naming what is visible.',
    '- Build the script around those observed details and the actual composition of the image. If it is a close portrait, prefer facial micro-motion and subtle camera movement. If it is full-body, use body movement that fits the pose. If the background is important, use depth and environment motion.',
    '- Every shot must reuse at least one concrete observed detail from the image, for example the actual clothing color, accessory, posture, hand position, visible prop, background object, lighting direction, or camera crop.',
    '- Do not replace the subject with a different person or a real human actor.',
    '',
    trendEdit
      ? 'Trend-edit direction: use high-retention cinematic pacing, multiple camera angles, beat-synced cuts, whip pan, match cut, flash cut, speed ramp, motion blur, light leak, glow burst, slow-motion highlights, and modern Douyin/TikTok/CapCut language where appropriate.'
      : 'Natural direction: use restrained cinematic pacing, believable camera movement, smooth transitions, and scene-matched motion. Avoid repetitive trend-template wording, avoid forcing many angles, and keep the script calm if the uploaded image is calm.',
    '- Keep the character identity locked across every shot. Camera and scene can change, but face, outfit, colors, accessories, and body proportions must remain consistent.',
    shotCountRule,
    textOverlay
      ? '- Include text overlay only as optional visual graphics. Keep it short, place it away from the face, and prefer no-diacritic text if the user text may cause font issues.'
      : '- Do not mention text overlay anywhere in the final script.',
    '',
    'Required final script format:',
    '- Start with "Quan sát ảnh tham chiếu:" followed by 2-3 concise Vietnamese sentences describing concrete visible details from the uploaded image.',
    '- Then write one concise overall direction sentence for the video. Do not print internal settings such as model name, theme value, trend edit mode, or text overlay mode.',
    '- Then write a numbered shot list by time range, for example: Canh 1 (0.0s-1.0s): ...',
    '- Each shot must include camera angle, camera/subject motion, subject action, transition, and sound/music cue.',
    textOverlay ? '- If text overlay mode is ON, a shot may include a Text overlay field when useful.' : '',
    '- End with a short negative instruction line preventing face/body/outfit deformation and unwanted extra limbs.',
    '- Do not include lines like "Chủ đề: ...", "Âm thanh: ...", "Chế độ trend edit: ...", or "tối ưu cho model ...". Those are UI/internal settings, not useful video instructions.',
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
    'Write only the final Vietnamese prompt/script. No JSON, no explanation.',
    'The output should be detailed enough for Seedance/Kling/Grok video generation, but stay under 10000 characters.',
  ].filter(Boolean).join('\n');
};

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
    const scriptOptions =
      body.scriptOptions && typeof body.scriptOptions === 'object'
        ? body.scriptOptions as Record<string, unknown>
        : {};

    const imagePart = await toInlineImagePart(imageSource);
    const promptPart = { text: buildDirectorInstruction(durationSeconds, userPrompt, scriptOptions) };

    const script = await runWithVertexCredentialFailover({
      taskName: 'video script director',
      operation: async ({ projectId, accessToken }) => {
        let lastModelError = '';

        for (const modelName of VERTEX_MODELS) {
          let response: Response;
          try {
            response = await fetch(
              `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${modelName}:generateContent`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts: [imagePart, promptPart] }],
                  generationConfig: {
                    temperature: 0.7,
                    topP: 0.9,
                    maxOutputTokens: 2600,
                  },
                }),
                signal: AbortSignal.timeout(VERTEX_VIDEO_SCRIPT_TIMEOUT_MS),
              },
            );
          } catch (error: any) {
            if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
              throw new Error(VIDEO_SCRIPT_DEADLINE_ERROR);
            }
            throw error;
          }

          if (!response.ok) {
            const errorMessage = await parseErrorMessage(response);
            lastModelError = `${modelName}: ${errorMessage}`;
            if (isModelUnavailableError(errorMessage) && modelName !== VERTEX_MODELS[VERTEX_MODELS.length - 1]) {
              continue;
            }
            throw new Error(errorMessage);
          }

          const data = await response.json();
          const text = sanitizeDirectorScript(extractCandidateText(data));
          if (!text) {
            throw new Error('Vertex AI did not return a video script.');
          }
          validateDirectorScript(text);
          return text.slice(0, 10000);
        }

        throw new Error(lastModelError || 'No Vertex AI model is available for video script director.');
      },
    });

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ script }),
    };
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes(VIDEO_SCRIPT_DEADLINE_ERROR)) {
      return {
        statusCode: 504,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: 'AI chưa kịp phân tích ảnh tham chiếu để viết kịch bản. Vui lòng bấm tạo lại; hệ thống sẽ không trả kịch bản mẫu chung chung thay cho phân tích ảnh.',
        }),
      };
    }

    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error?.message || 'Failed to generate video script.' }),
    };
  }
};
