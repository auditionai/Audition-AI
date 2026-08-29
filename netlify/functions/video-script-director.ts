import type { Handler } from '@netlify/functions';
import { grokText, type GrokImageInput } from './_grok';
import { getAuthenticatedRequestErrorStatus, requireAuthenticatedUser } from './_supabase';

const VIDEO_SCRIPT_DEADLINE_ERROR = 'VIDEO_SCRIPT_GROK_DEADLINE';
// The Cloudflare proxy in front of the site cuts synchronous requests at about
// 45 seconds. Keep this below that limit and constrain output for fast scripts.
const VIDEO_SCRIPT_GROK_TIMEOUT_MS = 32_000;
const VIDEO_SCRIPT_TOTAL_TIMEOUT_MS = 25_000;
const VIDEO_SCRIPT_MAX_TOKENS = 650;

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const toGrokImageInput = (source: string): GrokImageInput => {
  if (!source) throw new Error('Missing reference image.');
  // R2 URLs are public inputs. Passing the URL directly avoids downloading and
  // base64-encoding the image inside this synchronous Netlify function.
  if (source.startsWith('http')) {
    return { url: source };
  }
  if (!source.startsWith('data:')) {
    return { mimeType: 'image/jpeg', data: source };
  }
  const [header, data = ''] = source.split(',', 2);
  const mimeType = header.match(/^data:(.*?);base64$/)?.[1] || 'image/jpeg';
  if (!data.trim()) throw new Error('Reference image data is empty.');
  return { mimeType, data: source.startsWith('data:') ? data : source.replace(/^data:[^;]+;base64,/, '') };
};

const runVideoScriptWithDeadline = async <T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(VIDEO_SCRIPT_DEADLINE_ERROR));
    }, VIDEO_SCRIPT_TOTAL_TIMEOUT_MS);
  });
  try {
    // Do not wait for a gateway socket that ignores abort. The handler must be
    // free to return before Cloudflare's origin deadline.
    return await Promise.race([operation(controller.signal), deadline]);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(VIDEO_SCRIPT_DEADLINE_ERROR);
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
    .filter((line) => !/^(chu de|am thanh|che do trend edit|trend edit mode|text overlay mode|selected target model|model kich ban)\s*:/i.test(normalizeForValidation(line.trim())))
    .join('\n')
    .trim();

const normalizeForValidation = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase();

const validateDirectorScript = (value: string) => {
  const normalized = normalizeForValidation(value);
  if (!/quan sat anh tham chieu\s*:/i.test(normalized)) {
    throw new Error('AI chưa trả về phần quan sát ảnh tham chiếu đủ rõ. Vui lòng bấm tạo lại để AI phân tích ảnh trực tiếp.');
  }
  if (!/loai chu the\s*:/i.test(normalized)) {
    throw new Error('AI chưa phân loại loại chủ thể trong ảnh. Vui lòng bấm tạo lại để AI phân tích ảnh rõ hơn.');
  }
  if (/che do trend edit\s*:/i.test(normalized)) {
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
    '- The final script MUST include a line "Loai chu the:" near the top. Choose the most accurate label from: nhan vat 3D/game avatar, nguoi that, bup be/do choi vat ly, thu cung/dong vat, do vat/san pham, phong canh/khong co nhan vat. Include one short evidence phrase from the image, not a guess.',
    '- Character type rule: if the image shows stylized 3D/game/avatar characters, call them "nhan vat 3D" or "3D avatar". Do NOT call them dolls, toys, figurines, mannequins, or children cartoon unless the image is unmistakably a real physical toy photo.',
    '- When unsure about material/type, describe visual rendering style instead of inventing an object category. Prefer "nhan vat 3D phong cach game/anime" over "bup be".',
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
    '- Immediately after that, include "Loại chủ thể:" with the chosen subject type and visual evidence, for example "Loại chủ thể: nhân vật 3D/game avatar, vì khuôn mặt và chất liệu da/tóc là render phong cách game, không phải đồ chơi vật lý."',
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
    '- Preserve the subject as stylized 3D/avatar/game characters when the reference image has that look. Do not relabel them as dolls, toys, figurines, mannequins, or physical collectibles.',
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
    await requireAuthenticatedUser(event);
    const body = JSON.parse(event.body || '{}');
    const imageSource = String(body.imageSource || '').trim();
    const durationSeconds = clampDurationSeconds(body.durationSeconds);
    const userPrompt = String(body.userPrompt || '').trim();
    const scriptOptions =
      body.scriptOptions && typeof body.scriptOptions === 'object'
        ? body.scriptOptions as Record<string, unknown>
        : {};

    const imagePart = toGrokImageInput(imageSource);
    let script: string;
    try {
      script = sanitizeDirectorScript(await runVideoScriptWithDeadline((signal) => grokText(
        buildDirectorInstruction(durationSeconds, userPrompt, scriptOptions),
        [imagePart],
        VIDEO_SCRIPT_MAX_TOKENS,
        { timeoutMs: VIDEO_SCRIPT_GROK_TIMEOUT_MS, signal },
      )));
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error(VIDEO_SCRIPT_DEADLINE_ERROR);
      throw error;
    }
    if (!script) throw new Error('Grok did not return a video script.');
    validateDirectorScript(script);
    script = script.slice(0, 10000);

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
      statusCode: getAuthenticatedRequestErrorStatus(error),
      headers: jsonHeaders,
      body: JSON.stringify({ error: error?.message || 'Failed to generate video script.' }),
    };
  }
};
