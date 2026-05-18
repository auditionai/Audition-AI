import type { Handler } from '@netlify/functions';
import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODELS = Array.from(new Set([
  process.env.VERTEX_VIDEO_SCRIPT_MODEL,
  'gemini-3.1-flash-preview',
  'gemini-3.1-pro-preview',
].filter(Boolean))) as string[];
const VERTEX_VIDEO_SCRIPT_TIMEOUT_MS = 16_000;
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
    'Analyze the uploaded reference image first, then write a precise video prompt/script for the selected duration.',
    'Output language rule: the final script MUST be written entirely in Vietnamese.',
    'Do not answer in English. Do not mix English sentences into the script, except unavoidable proper names, model names, or brand labels visible in the image.',
    `The target video duration is ${durationSeconds} seconds. Structure the motion timing to fit this duration.`,
    `Selected target model: ${targetModel}. Optimize the script for this model and avoid impossible motion.`,
    `Requested style: ${style}.`,
    `Requested theme: ${theme}.`,
    `Requested sound/music mood: ${soundMood}.`,
    `Trend edit mode: ${trendEdit ? 'ON - use modern Douyin/TikTok/CapCut pacing when it fits the image.' : 'OFF - avoid Douyin/TikTok/CapCut formula unless the user explicitly asked for it.'}`,
    `Text overlay mode: ${textOverlay ? 'ON - include short text overlay instructions only where useful.' : 'OFF - do not include any text overlay, title card, caption, subtitles, or visible typography in the video script.'}`,
    voiceDialogue
      ? 'Dialogue/voice rule: include short natural Vietnamese voice-over or spoken lines only when it fits the scene. The voice must be standard Vietnamese.'
      : 'Dialogue/voice rule: do NOT include spoken dialogue, voice-over, or narrated speech. Use only visual action, ambience, music, and sound effects.',
    userPrompt.trim() ? `User idea to incorporate: ${userPrompt.trim()}` : '',
    '',
    'Reference image analysis requirements:',
    '- Identify visible character count, subject type, framing, camera angle, pose, expression, outfit, accessories, background, color palette, lighting, and mood.',
    '- Build the script around those observed details and the actual composition of the image. If it is a close portrait, prefer facial micro-motion and subtle camera movement. If it is full-body, use body movement that fits the pose. If the background is important, use depth and environment motion.',
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
    '- Start with one concise overall direction sentence.',
    '- Then write a numbered shot list by time range, for example: Canh 1 (0.0s-1.0s): ...',
    '- Each shot must include camera angle, camera/subject motion, subject action, transition, and sound/music cue.',
    textOverlay ? '- If text overlay mode is ON, a shot may include a Text overlay field when useful.' : '',
    '- End with a short negative instruction line preventing face/body/outfit deformation and unwanted extra limbs.',
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

const buildFallbackVideoScript = (
  durationSeconds: number,
  userPrompt: string,
  scriptOptions: Record<string, unknown>,
) => {
  const style = normalizeOption(scriptOptions.style, 'cinematic');
  const theme = normalizeOption(scriptOptions.theme, 'tự động theo ảnh tham chiếu');
  const soundMood = normalizeOption(scriptOptions.soundMood, 'phù hợp bối cảnh');
  const targetModel = normalizeOption(scriptOptions.targetModel, 'model video đang chọn');
  const voiceDialogue = Boolean(scriptOptions.voiceDialogue);
  const trendEdit = Boolean(scriptOptions.trendEdit);
  const textOverlay = Boolean(scriptOptions.textOverlay);
  const shotCount = trendEdit
    ? (durationSeconds <= 5 ? 5 : durationSeconds <= 10 ? 7 : 9)
    : (durationSeconds <= 5 ? 3 : durationSeconds <= 10 ? 4 : 6);
  const shotLength = Math.max(0.7, durationSeconds / shotCount);
  const cameras = trendEdit
    ? [
        'cận cảnh khuôn mặt, dolly-in nhẹ',
        'góc trung cảnh ngang hông, whip pan theo nhịp',
        'góc thấp điện ảnh, slow-motion highlight',
        'góc rộng bối cảnh, speed ramp chuyển cảnh',
        'cận chi tiết outfit/phụ kiện, flash cut theo beat',
      ]
    : [
        'cận cảnh tự nhiên, giữ đúng bố cục ảnh gốc',
        'trung cảnh ổn định để nhân vật chuyển động nhẹ',
        'góc nghiêng nhẹ tạo chiều sâu cho nền ảnh',
        'góc rộng vừa đủ để mở rộng không gian trong ảnh',
        'cận chi tiết trang phục/phụ kiện nếu ảnh thể hiện rõ',
      ];
  const transitions = trendEdit
    ? ['flash cut + light leak', 'match cut + motion blur', 'speed ramp ngắn', 'whip pan theo beat']
    : ['cắt mềm', 'dissolve nhẹ', 'match cut tự nhiên', 'camera drift liền mạch'];
  const actions = trendEdit
    ? [
        'nhân vật giữ thần thái tự tin, mắt và biểu cảm bám sát ảnh tham chiếu',
        'tay/chân chuyển động nhỏ theo pose gốc, không thêm chi thừa',
        'ánh sáng và nền chuyển động nhẹ tạo cảm giác premium',
        'camera bắt chất liệu trang phục và màu sắc đúng ảnh gốc',
      ]
    : [
        'nhân vật giữ biểu cảm và thần thái của ảnh tham chiếu, chỉ thêm chuyển động nhỏ tự nhiên',
        'camera tạo chiều sâu bằng ánh sáng và nền chuyển động rất nhẹ',
        'outfit, màu sắc, phụ kiện và tỉ lệ cơ thể được giữ nguyên',
        'hành động bám theo ý tưởng người dùng và không biến nhân vật thành người khác',
      ];

  const shots = Array.from({ length: shotCount }, (_, index) => {
    const start = (index * shotLength).toFixed(1);
    const end = Math.min(durationSeconds, (index + 1) * shotLength).toFixed(1);
    const textLine = textOverlay
      ? ` Text overlay: chữ ngắn theo chủ đề ${theme}, ưu tiên không dấu nếu lo lỗi font, đặt ở vùng trống và không che mặt.`
      : '';
    return `Cảnh ${index + 1} (${start}s-${end}s): ${cameras[index % cameras.length]}. ${actions[index % actions.length]}. Chuyển cảnh bằng ${transitions[index % transitions.length]}.${textLine} Âm thanh: ${soundMood}${trendEdit ? ', có whoosh/SFX theo nhịp' : ', âm nền và SFX vừa đủ theo bối cảnh'}.`;
  });

  return [
    `Video ${durationSeconds}s phong cách ${style}, tối ưu cho ${targetModel}, bám sát ảnh tham chiếu và ý tưởng người dùng.`,
    userPrompt.trim() ? `Ý tưởng người dùng cần giữ: ${userPrompt.trim()}` : '',
    `Chủ đề: ${theme}. Âm thanh: ${soundMood}. Chế độ trend edit: ${trendEdit ? 'bật' : 'tắt'}.`,
    voiceDialogue
      ? 'Có lời thoại/voice tiếng Việt ngắn, tự nhiên, phù hợp bối cảnh; không lấn át nhạc.'
      : 'Không có lời thoại hoặc voice-over; chỉ dùng hành động hình ảnh, nhạc nền và hiệu ứng âm thanh.',
    'Bắt buộc dùng ảnh tham chiếu làm nguồn nhân vật duy nhất: không tạo người thật, không đổi nhân vật, không đổi mặt, không đổi outfit, không đổi màu trang phục, không làm trẻ con hóa nhân vật.',
    ...shots,
    'Negative/lock: giữ nguyên mặt, makeup, tỉ lệ cơ thể, outfit, phụ kiện và chất lượng nhân vật từ ảnh tham chiếu; không méo mặt, không thừa tay chân, không mất tay chân, không kéo dài cổ, không đổi màu da/trang phục, không thêm nhân vật lạ.',
  ].filter(Boolean).join('\n').slice(0, 10000);
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
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (!text) {
            throw new Error('Vertex AI did not return a video script.');
          }
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
      const body = (() => {
        try {
          return JSON.parse(event.body || '{}');
        } catch {
          return {};
        }
      })();
      const durationSeconds = clampDurationSeconds(body.durationSeconds);
      const userPrompt = String(body.userPrompt || '').trim();
      const scriptOptions =
        body.scriptOptions && typeof body.scriptOptions === 'object'
          ? body.scriptOptions as Record<string, unknown>
          : {};
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          script: buildFallbackVideoScript(durationSeconds, userPrompt, scriptOptions),
          fallback: true,
          warning: 'Vertex AI took too long, returned a safe fallback video script.',
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
