import { runWithVertexCredentialFailover } from './_vertex-credentials';
import sharp from 'sharp';

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

type LoadedImageSource = {
  mimeType: string;
  base64Data: string;
  buffer: Buffer;
};

type PixelQualityMetrics = {
  width: number;
  height: number;
  minSide: number;
  centerLaplacianVariance: number;
};

const loadImageSource = async (source: string): Promise<LoadedImageSource> => {
  if (!source) {
    throw new Error('Missing image source');
  }

  let mimeType = 'image/jpeg';
  let base64Data = source;
  let buffer: Buffer;

  if (source.startsWith('http')) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch review image: ${await parseErrorMessage(response)}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    mimeType = response.headers.get('content-type') || mimeType;
    buffer = Buffer.from(arrayBuffer);
    base64Data = buffer.toString('base64');
  } else if (source.startsWith('data:')) {
    const [header, body] = source.split(',', 2);
    base64Data = body || '';
    mimeType = header.match(/^data:(.*?);base64$/)?.[1] || mimeType;
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    base64Data = source.replace(/^data:[^;]+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  }

  return {
    mimeType,
    base64Data,
    buffer,
  };
};

const toInlineImagePart = ({ mimeType, base64Data }: LoadedImageSource) => ({
  inlineData: {
    data: base64Data,
    mimeType,
  },
});

const analyzePixelQuality = async (buffer: Buffer): Promise<PixelQualityMetrics> => {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const resized = await sharp(buffer)
    .resize({ width: 256, height: 256, fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = resized.data;
  const sampleWidth = resized.info.width;
  const sampleHeight = resized.info.height;
  const x0 = Math.max(1, Math.floor(sampleWidth * 0.2));
  const x1 = Math.min(sampleWidth - 1, Math.floor(sampleWidth * 0.8));
  const y0 = Math.max(1, Math.floor(sampleHeight * 0.15));
  const y1 = Math.min(sampleHeight - 1, Math.floor(sampleHeight * 0.9));

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = y * sampleWidth + x;
      const laplacian = 4 * data[index] - data[index - 1] - data[index + 1] - data[index - sampleWidth] - data[index + sampleWidth];
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count += 1;
    }
  }

  const mean = count > 0 ? sum / count : 0;
  const variance = count > 0 ? (sumSq / count) - (mean * mean) : 0;

  return {
    width,
    height,
    minSide: Math.min(width || 0, height || 0),
    centerLaplacianVariance: variance,
  };
};

const buildReviewInstruction = () => {
  const sections = [
    'You are a strict quality reviewer for uploaded character images used in a paid AI image-generation pipeline.',
    'Review exactly one uploaded image and decide whether it needs sharpening and/or background removal before generation.',
    'Be conservative, but do not over-flag sharpening when the character itself is already readable.',
    'Phone photos of a game screen, blurry screenshots, noisy captures, images with visible UI, and images where the character sits inside a game card or frame must be flagged for background removal.',
    '',
    'RULES:',
    '- Count the visible main character subjects. Reject clean status if there are 0 or 2+ distinct main characters.',
    '- Evaluate subject sharpness, visible detail quality, and visible noise/compression.',
    '- Determine whether the background is already clean enough for identity locking.',
    '- Treat these as already background-removed or background-safe: transparent-like cutout, solid black background, solid white background, or very clean studio/plain background with strong subject separation.',
    '- Treat these as NOT background-removed: game scene, UI panels, text, buttons, menus, profile cards, lobby windows, room/interior, outdoor environment, clutter, or mixed complex backgrounds.',
    '- Do NOT set needsSharpen=true only because the image contains UI, a game card, a shopping mall frame, menus, buttons, or screenshot context.',
    '- If the character face, outfit edges, and accessories are still clearly readable, classify sharpness as clear enough even if the image is still inside a game UI.',
    '- If the image is a photo of a monitor or phone screen and the character becomes visibly soft, smeared, noisy, or low-detail, then set needsSharpen=true.',
    '- If the character is inside a purple profile card, shopping mall card, game frame, or any UI container, set needsBackgroundRemoval=true.',
    '- Set needsSharpen=true only when the subject is truly blurry/soft/noisy/low-detail enough that identity or outfit details are harder to lock.',
    '- If the background is not already isolated/clean, set needsBackgroundRemoval=true.',
    '',
    'REFERENCE CASES:',
    '- Case A: a sharp game screenshot with visible UI or purple profile card, but the character face, hair, outfit, and shoes are still readable -> needsSharpen=false, needsBackgroundRemoval=true.',
    '- Case B: a soft or noisy screenshot/phone photo where the face and outfit details look smeared or degraded -> needsSharpen=true, needsBackgroundRemoval=true.',
    '- Case C: a crisp cutout on black/white/transparent-like/plain clean background -> needsSharpen=false, needsBackgroundRemoval=false.',
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

const normalizeReviewResult = (raw: any, pixelMetrics?: PixelQualityMetrics): CharacterImageReviewResult => {
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
  const explicitSharpnessIssue =
    issues.includes('blurry_subject')
    || issues.includes('noisy_subject')
    || issues.includes('low_detail');
  const strongSharpnessIssue =
    normalizedSharpness === 'blurry'
    || normalizedNoise === 'high'
    || normalizedDetail === 'poor'
    || explicitSharpnessIssue
    || (normalizedSharpness === 'unknown' && normalizedNoise === 'high')
    || (normalizedSharpness === 'unknown' && normalizedDetail === 'poor');
  const moderateSharpnessIssue =
    normalizedSharpness === 'soft'
    && (
      normalizedNoise === 'medium'
      || normalizedDetail === 'partial'
      || normalizedNoise === 'unknown'
      || normalizedDetail === 'unknown'
    );
  const heuristicNeedsBackgroundRemoval =
    !safeBackground
    || issues.includes('background_not_removed')
    || issues.includes('busy_background');
  const pixelSuggestsSharpenStrong =
    !!pixelMetrics
    && (
      pixelMetrics.centerLaplacianVariance < 1200
      || (pixelMetrics.centerLaplacianVariance < 1550 && pixelMetrics.minSide < 450)
    );
  const pixelSuggestsSharpenModerate =
    !!pixelMetrics
    && heuristicNeedsBackgroundRemoval
    && (
      pixelMetrics.centerLaplacianVariance < 1700
      || (pixelMetrics.centerLaplacianVariance < 1900 && pixelMetrics.minSide < 350)
    );
  const backgroundOnlyLikely =
    heuristicNeedsBackgroundRemoval
    && !strongSharpnessIssue
    && normalizedDetail === 'clear'
    && normalizedNoise !== 'high'
    && !pixelSuggestsSharpenStrong
    && !pixelSuggestsSharpenModerate;
  const heuristicNeedsSharpen =
    strongSharpnessIssue
    || (moderateSharpnessIssue && !backgroundOnlyLikely)
    || pixelSuggestsSharpenStrong
    || (!backgroundOnlyLikely && pixelSuggestsSharpenModerate);
  const normalizedNeedsSharpen =
    (raw?.needsSharpen === true || heuristicNeedsSharpen)
    && !backgroundOnlyLikely;
  const mergedIssues = [...issues];
  if (normalizedNeedsSharpen && !mergedIssues.includes('low_detail') && (pixelSuggestsSharpenStrong || pixelSuggestsSharpenModerate)) {
    mergedIssues.push('low_detail');
  }

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
    needsSharpen: normalizedNeedsSharpen,
    needsBackgroundRemoval: raw?.needsBackgroundRemoval === true || heuristicNeedsBackgroundRemoval,
    issues: mergedIssues,
  };
};

export const reviewCharacterImage = async (
  imageSource: string,
): Promise<CharacterImageReviewResult> => {
  const loadedImage = await loadImageSource(imageSource);
  const imagePart = toInlineImagePart(loadedImage);
  const pixelMetrics = await analyzePixelQuality(loadedImage.buffer);
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

      return normalizeReviewResult(JSON.parse(extractJsonPayload(text)), pixelMetrics);
    },
  });
};
