import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODEL = 'gemini-3.1-pro-preview';

export type VideoInputReviewIssue =
  | 'no_character'
  | 'multiple_characters'
  | 'blurry_subject'
  | 'small_subject'
  | 'occluded_subject'
  | 'missing_character_details'
  | 'unclear_background'
  | 'missing_scene_details'
  | 'too_dark'
  | 'too_bright'
  | 'uncertain';

type VideoInputReviewMode = 'video_keyframe' | 'motion_character';

type SubjectSharpness = 'clear' | 'soft' | 'blurry' | 'unknown';
type BackgroundClarity = 'clear' | 'partial' | 'unclear' | 'unknown';

export interface VideoInputReviewResult {
  approved: boolean;
  summary: string;
  detectedPersonCount: number | null;
  subjectSharpness: SubjectSharpness;
  characterDetailsClear: boolean;
  backgroundClarity: BackgroundClarity;
  sceneDetailsClear: boolean;
  issues: VideoInputReviewIssue[];
}

const REVIEW_ISSUES = new Set<VideoInputReviewIssue>([
  'no_character',
  'multiple_characters',
  'blurry_subject',
  'small_subject',
  'occluded_subject',
  'missing_character_details',
  'unclear_background',
  'missing_scene_details',
  'too_dark',
  'too_bright',
  'uncertain',
]);

const SUBJECT_SHARPNESS_VALUES = new Set<SubjectSharpness>(['clear', 'soft', 'blurry', 'unknown']);
const BACKGROUND_CLARITY_VALUES = new Set<BackgroundClarity>(['clear', 'partial', 'unclear', 'unknown']);

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error?.message || data?.error || data?.detail || data?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const extractJsonPayload = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Input review response was not valid JSON: ${text}`);
  }

  return candidate.slice(start, end + 1);
};

const normalizeIssueList = (value: unknown): VideoInputReviewIssue[] =>
  Array.isArray(value)
    ? value
        .map((entry) => String(entry || '').trim().toLowerCase() as VideoInputReviewIssue)
        .filter((entry): entry is VideoInputReviewIssue => REVIEW_ISSUES.has(entry))
    : [];

const normalizeSubjectSharpness = (value: unknown): SubjectSharpness => {
  const normalized = String(value || '').trim().toLowerCase() as SubjectSharpness;
  return SUBJECT_SHARPNESS_VALUES.has(normalized) ? normalized : 'unknown';
};

const normalizeBackgroundClarity = (value: unknown): BackgroundClarity => {
  const normalized = String(value || '').trim().toLowerCase() as BackgroundClarity;
  return BACKGROUND_CLARITY_VALUES.has(normalized) ? normalized : 'unknown';
};

const normalizeReviewResult = (raw: any): VideoInputReviewResult => ({
  approved: raw?.approved === true,
  summary: typeof raw?.summary === 'string' ? raw.summary.trim() : '',
  detectedPersonCount:
    typeof raw?.detectedPersonCount === 'number' && Number.isFinite(raw.detectedPersonCount)
      ? Math.max(0, Math.floor(raw.detectedPersonCount))
      : null,
  subjectSharpness: normalizeSubjectSharpness(raw?.subjectSharpness),
  characterDetailsClear: raw?.characterDetailsClear === true,
  backgroundClarity: normalizeBackgroundClarity(raw?.backgroundClarity),
  sceneDetailsClear: raw?.sceneDetailsClear === true,
  issues: normalizeIssueList(raw?.issues),
});

const toInlineImagePart = async (source: string) => {
  if (!source) {
    throw new Error('Missing image source');
  }

  let mimeType = 'image/jpeg';
  let base64Data = source;

  if (source.startsWith('http')) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch review image: ${await parseErrorMessage(response)}`);
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

  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
};

const buildReviewInstruction = (mode: VideoInputReviewMode) => {
  const isMotion = mode === 'motion_character';

  const sections = [
    'You are a strict pre-flight reviewer for video generation inputs.',
    'Fail closed. If you are unsure, reject the input.',
    'Review the single uploaded image and decide whether it is good enough for a paid AI video pipeline.',
    '',
    isMotion
      ? 'MOTION CONTROL RULES: approve only when the image contains exactly 1 clearly visible person/character, the subject is sharp enough to preserve identity/outfit/body details, and the background/context is clear enough for motion transfer.'
      : 'VIDEO KEYFRAME RULES: approve only when the image contains at least 1 clearly visible main person/character, the subject is sharp enough to preserve identity/outfit/body details, and the background/context is clear enough for video generation.',
    'Reject blurry, tiny, dark, overexposed, heavily occluded, low-detail, or low-context images.',
    isMotion
      ? 'Reject if there are 0 visible people or 2+ visible people.'
      : 'If multiple people exist, only approve when at least one main character is clearly readable and the scene/background is still sufficiently clear.',
    '',
    'Return JSON only with this exact schema:',
    '{',
    '  "approved": boolean,',
    '  "summary": "short Vietnamese summary for the user",',
    '  "detectedPersonCount": number | null,',
    '  "subjectSharpness": "clear|soft|blurry|unknown",',
    '  "characterDetailsClear": boolean,',
    '  "backgroundClarity": "clear|partial|unclear|unknown",',
    '  "sceneDetailsClear": boolean,',
    '  "issues": ["no_character|multiple_characters|blurry_subject|small_subject|occluded_subject|missing_character_details|unclear_background|missing_scene_details|too_dark|too_bright|uncertain"]',
    '}',
    '',
    'Use "approved": false whenever any required rule fails.',
  ];

  return sections.join('\n');
};

const reviewImageInput = async (
  imageSource: string,
  mode: VideoInputReviewMode,
): Promise<VideoInputReviewResult> => {
  const imagePart = await toInlineImagePart(imageSource);
  const promptPart = { text: buildReviewInstruction(mode) };

  return runWithVertexCredentialFailover({
    taskName: mode === 'motion_character' ? 'motion control input review' : 'video keyframe input review',
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
              temperature: 0.0,
              topP: 0.1,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
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
        throw new Error('Vertex AI did not return an input review result.');
      }

      return normalizeReviewResult(JSON.parse(extractJsonPayload(text)));
    },
  });
};

const readBoxType = (view: DataView, offset: number) =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );

const readBigUint64Safe = (view: DataView, offset: number) => {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  return high * 2 ** 32 + low;
};

const findBox = (
  view: DataView,
  start: number,
  end: number,
  targetType: string,
): { payloadStart: number; payloadEnd: number } | null => {
  let offset = start;

  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = readBoxType(view, offset + 4);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) return null;
      size = readBigUint64Safe(view, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (!Number.isFinite(size) || size < headerSize) {
      return null;
    }

    const boxEnd = offset + size;
    if (boxEnd > end) {
      return null;
    }

    if (type === targetType) {
      return {
        payloadStart: offset + headerSize,
        payloadEnd: boxEnd,
      };
    }

    offset = boxEnd;
  }

  return null;
};

const parseIsoBmffDurationSeconds = (arrayBuffer: ArrayBuffer): number | null => {
  const view = new DataView(arrayBuffer);
  const moov = findBox(view, 0, view.byteLength, 'moov');
  if (!moov) {
    return null;
  }

  const mvhd = findBox(view, moov.payloadStart, moov.payloadEnd, 'mvhd');
  if (!mvhd) {
    return null;
  }

  const version = view.getUint8(mvhd.payloadStart);
  if (version === 0) {
    const timescale = view.getUint32(mvhd.payloadStart + 12);
    const duration = view.getUint32(mvhd.payloadStart + 16);
    if (timescale <= 0) return null;
    return duration / timescale;
  }

  if (version === 1) {
    const timescale = view.getUint32(mvhd.payloadStart + 20);
    const duration = readBigUint64Safe(view, mvhd.payloadStart + 24);
    if (timescale <= 0) return null;
    return duration / timescale;
  }

  return null;
};

const loadBinarySource = async (source: string) => {
  if (!source) {
    throw new Error('Missing video source');
  }

  if (source.startsWith('http')) {
    const response = await fetch(source, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch motion video: ${await parseErrorMessage(response)}`);
    }

    return {
      mimeType: response.headers.get('content-type') || 'video/mp4',
      buffer: await response.arrayBuffer(),
    };
  }

  if (source.startsWith('data:')) {
    const [header, body] = source.split(',', 2);
    const mimeType = header.match(/^data:(.*?);base64$/)?.[1] || 'video/mp4';
    const decoded = Buffer.from(body || '', 'base64');
    return {
      mimeType,
      buffer: decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer,
    };
  }

  const decoded = Buffer.from(source.replace(/^data:[^;]+;base64,/, ''), 'base64');
  return {
    mimeType: 'video/mp4',
    buffer: decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer,
  };
};

export const inspectMotionVideoDurationSeconds = async (
  videoSource: string,
  declaredDurationSeconds?: number | null,
) => {
  try {
    const { buffer } = await loadBinarySource(videoSource);
    const parsed = parseIsoBmffDurationSeconds(buffer);
    if (parsed && Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  } catch (error) {
    console.warn('[video-input-review] Failed to inspect motion video duration from binary source', error);
  }

  if (typeof declaredDurationSeconds === 'number' && Number.isFinite(declaredDurationSeconds) && declaredDurationSeconds > 0) {
    return declaredDurationSeconds;
  }

  return null;
};

export const reviewVideoKeyframeInput = async (imageSource: string) =>
  reviewImageInput(imageSource, 'video_keyframe');

export const reviewMotionCharacterInput = async (imageSource: string) =>
  reviewImageInput(imageSource, 'motion_character');
