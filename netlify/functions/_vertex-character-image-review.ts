import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODEL = 'gemini-3.1-pro-preview';

export type CharacterImageReviewIssue =
  | 'no_character'
  | 'multiple_characters'
  | 'blurry_subject'
  | 'noisy_subject'
  | 'low_detail'
  | 'background_not_removed'
  | 'busy_background'
  | 'too_dark'
  | 'too_bright'
  | 'uncertain';

type SubjectSharpness = 'clear' | 'soft' | 'blurry' | 'unknown';
type NoiseLevel = 'low' | 'medium' | 'high' | 'unknown';
type DetailLevel = 'clear' | 'partial' | 'poor' | 'unknown';
type BackgroundStatus =
  | 'transparent_like'
  | 'solid_black'
  | 'solid_white'
  | 'clean_studio'
  | 'mixed'
  | 'busy'
  | 'unknown';

export interface CharacterImageReviewResult {
  summary: string;
  detectedCharacterCount: number | null;
  subjectSharpness: SubjectSharpness;
  noiseLevel: NoiseLevel;
  detailLevel: DetailLevel;
  backgroundStatus: BackgroundStatus;
  needsSharpen: boolean;
  needsBackgroundRemoval: boolean;
  issues: CharacterImageReviewIssue[];
}

const REVIEW_ISSUES = new Set<CharacterImageReviewIssue>([
  'no_character',
  'multiple_characters',
  'blurry_subject',
  'noisy_subject',
  'low_detail',
  'background_not_removed',
  'busy_background',
  'too_dark',
  'too_bright',
  'uncertain',
]);

const SHARPNESS_VALUES = new Set<SubjectSharpness>(['clear', 'soft', 'blurry', 'unknown']);
const NOISE_VALUES = new Set<NoiseLevel>(['low', 'medium', 'high', 'unknown']);
const DETAIL_VALUES = new Set<DetailLevel>(['clear', 'partial', 'poor', 'unknown']);
const BACKGROUND_VALUES = new Set<BackgroundStatus>([
  'transparent_like',
  'solid_black',
  'solid_white',
  'clean_studio',
  'mixed',
  'busy',
  'unknown',
]);

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
    throw new Error(`Character review response was not valid JSON: ${text}`);
  }

  return candidate.slice(start, end + 1);
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

const buildReviewInstruction = () => {
  const sections = [
    'You are a strict quality reviewer for uploaded character images used in a paid AI image-generation pipeline.',
    'Review exactly one uploaded image and decide whether it needs sharpening and/or background removal before generation.',
    'Be conservative. If the image is not clearly production-ready for identity locking, flag it.',
    'Phone photos of a game screen, blurry screenshots, noisy captures, images with visible UI, and images where the character sits inside a game card or frame must be flagged.',
    '',
    'RULES:',
    '- Count the visible main character subjects. Reject clean status if there are 0 or 2+ distinct main characters.',
    '- Evaluate subject sharpness, visible detail quality, and visible noise/compression.',
    '- Determine whether the background is already clean enough for identity locking.',
    '- Treat these as already background-removed or background-safe: transparent-like cutout, solid black background, solid white background, or very clean studio/plain background with strong subject separation.',
    '- Treat these as NOT background-removed: game scene, UI panels, text, buttons, menus, profile cards, lobby windows, room/interior, outdoor environment, clutter, or mixed complex backgrounds.',
    '- If the image is a photo of a monitor or phone screen, or shows moire/compression/noise, it is not clean and should usually need sharpening.',
    '- If the character is inside a purple profile card, shopping mall card, game frame, or any UI container, set needsBackgroundRemoval=true.',
    '- If the image is blurry, soft, noisy, low-detail, hard to read around face/clothes/accessories, or visually degraded by screenshot/monitor capture artifacts, set needsSharpen=true.',
    '- If the background is not already isolated/clean, set needsBackgroundRemoval=true.',
    '- Prefer false negatives over false positives only if the image is clearly sharp and already isolated. Otherwise flag it.',
    '',
    'Return JSON only with this exact schema:',
    '{',
    '  "summary": "short Vietnamese summary for the user",',
    '  "detectedCharacterCount": number | null,',
    '  "subjectSharpness": "clear|soft|blurry|unknown",',
    '  "noiseLevel": "low|medium|high|unknown",',
    '  "detailLevel": "clear|partial|poor|unknown",',
    '  "backgroundStatus": "transparent_like|solid_black|solid_white|clean_studio|mixed|busy|unknown",',
    '  "needsSharpen": boolean,',
    '  "needsBackgroundRemoval": boolean,',
    '  "issues": ["no_character|multiple_characters|blurry_subject|noisy_subject|low_detail|background_not_removed|busy_background|too_dark|too_bright|uncertain"]',
    '}',
  ];

  return sections.join('\n');
};

const normalizeIssues = (value: unknown): CharacterImageReviewIssue[] =>
  Array.isArray(value)
    ? value
        .map((entry) => String(entry || '').trim().toLowerCase() as CharacterImageReviewIssue)
        .filter((entry): entry is CharacterImageReviewIssue => REVIEW_ISSUES.has(entry))
    : [];

const normalizeReviewResult = (raw: any): CharacterImageReviewResult => {
  const subjectSharpness = String(raw?.subjectSharpness || '').trim().toLowerCase() as SubjectSharpness;
  const noiseLevel = String(raw?.noiseLevel || '').trim().toLowerCase() as NoiseLevel;
  const detailLevel = String(raw?.detailLevel || '').trim().toLowerCase() as DetailLevel;
  const backgroundStatus = String(raw?.backgroundStatus || '').trim().toLowerCase() as BackgroundStatus;
  const issues = normalizeIssues(raw?.issues);
  const normalizedSharpness = SHARPNESS_VALUES.has(subjectSharpness) ? subjectSharpness : 'unknown';
  const normalizedNoise = NOISE_VALUES.has(noiseLevel) ? noiseLevel : 'unknown';
  const normalizedDetail = DETAIL_VALUES.has(detailLevel) ? detailLevel : 'unknown';
  const normalizedBackground = BACKGROUND_VALUES.has(backgroundStatus) ? backgroundStatus : 'unknown';
  const safeBackground =
    normalizedBackground === 'transparent_like'
    || normalizedBackground === 'solid_black'
    || normalizedBackground === 'solid_white'
    || normalizedBackground === 'clean_studio';
  const heuristicNeedsSharpen =
    normalizedSharpness === 'soft'
    || normalizedSharpness === 'blurry'
    || normalizedNoise === 'medium'
    || normalizedNoise === 'high'
    || normalizedDetail === 'partial'
    || normalizedDetail === 'poor'
    || issues.includes('blurry_subject')
    || issues.includes('noisy_subject')
    || issues.includes('low_detail')
    || issues.includes('too_dark')
    || issues.includes('too_bright');
  const heuristicNeedsBackgroundRemoval =
    !safeBackground
    || issues.includes('background_not_removed')
    || issues.includes('busy_background');

  return {
    summary: typeof raw?.summary === 'string' ? raw.summary.trim() : '',
    detectedCharacterCount:
      typeof raw?.detectedCharacterCount === 'number' && Number.isFinite(raw.detectedCharacterCount)
        ? Math.max(0, Math.floor(raw.detectedCharacterCount))
        : null,
    subjectSharpness: normalizedSharpness,
    noiseLevel: normalizedNoise,
    detailLevel: normalizedDetail,
    backgroundStatus: normalizedBackground,
    needsSharpen: raw?.needsSharpen === true || heuristicNeedsSharpen,
    needsBackgroundRemoval: raw?.needsBackgroundRemoval === true || heuristicNeedsBackgroundRemoval,
    issues,
  };
};

export const reviewCharacterImage = async (
  imageSource: string,
): Promise<CharacterImageReviewResult> => {
  const imagePart = await toInlineImagePart(imageSource);
  const promptPart = { text: buildReviewInstruction() };

  return runWithVertexCredentialFailover({
    taskName: 'character image review',
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
        throw new Error('Vertex AI did not return a character image review result.');
      }

      return normalizeReviewResult(JSON.parse(extractJsonPayload(text)));
    },
  });
};
