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
    'Be practical. Phone photos of a game screen, blurry screenshots, noisy captures, and images with busy UI/background should be flagged.',
    '',
    'RULES:',
    '- Count the visible main character subjects. Reject clean status if there are 0 or 2+ distinct main characters.',
    '- Evaluate subject sharpness, visible detail quality, and visible noise/compression.',
    '- Determine whether the background is already clean enough for identity locking.',
    '- Treat these as already background-removed or background-safe: transparent-like cutout, solid black background, solid white background, or very clean studio/plain background with strong subject separation.',
    '- Treat these as NOT background-removed: game scene, UI panels, text, buttons, room/interior, outdoor environment, clutter, or mixed complex backgrounds.',
    '- If the image is blurry, soft, noisy, low-detail, or hard to read around face/clothes/accessories, set needsSharpen=true.',
    '- If the background is not already isolated/clean, set needsBackgroundRemoval=true.',
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

  return {
    summary: typeof raw?.summary === 'string' ? raw.summary.trim() : '',
    detectedCharacterCount:
      typeof raw?.detectedCharacterCount === 'number' && Number.isFinite(raw.detectedCharacterCount)
        ? Math.max(0, Math.floor(raw.detectedCharacterCount))
        : null,
    subjectSharpness: SHARPNESS_VALUES.has(subjectSharpness) ? subjectSharpness : 'unknown',
    noiseLevel: NOISE_VALUES.has(noiseLevel) ? noiseLevel : 'unknown',
    detailLevel: DETAIL_VALUES.has(detailLevel) ? detailLevel : 'unknown',
    backgroundStatus: BACKGROUND_VALUES.has(backgroundStatus) ? backgroundStatus : 'unknown',
    needsSharpen: raw?.needsSharpen === true,
    needsBackgroundRemoval: raw?.needsBackgroundRemoval === true,
    issues: normalizeIssues(raw?.issues),
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
