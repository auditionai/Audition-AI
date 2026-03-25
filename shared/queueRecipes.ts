export type QueueRecipeKind =
  | 'image_generate_recipe_v1'
  | 'image_edit_recipe_v1'
  | 'video_generate_recipe_v1'
  | 'motion_generate_recipe_v1';

export type QueueProcessingStage =
  | 'queued'
  | 'preparing'
  | 'uploading_refs'
  | 'synthesizing_prompt'
  | 'building_payload'
  | 'dispatching'
  | 'submitted'
  | 'polling'
  | 'completed'
  | 'failed';

export interface QueueProgressLogEntry {
  at: string;
  stage: QueueProcessingStage;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface QueueNotificationMediaEntry {
  url: string;
  role: 'character' | 'sample' | 'style' | 'source' | 'keyframe' | 'motion' | 'reference';
  kind: 'image' | 'video';
  userProvided?: boolean;
}

export type ImageRenderReferenceRole = 'sample' | 'character' | 'style';

export interface ImageRenderReferenceEntry {
  role: ImageRenderReferenceRole;
  source: string;
  indexLabel: string;
}

export interface ImageGenerateRecipePayload {
  recipeType: 'image_generate_recipe_v1';
  modelId: string;
  prompt: string;
  characterCount?: number;
  resolution?: string;
  aspectRatio?: string;
  speed?: string;
  serverId?: string;
  negativePrompt?: string;
  characterImages?: string[];
  sampleImage?: string | null;
  styleImage?: string | null;
  stylePrompt?: string | null;
  referenceImages?: string[];
  __stage?: QueueProcessingStage;
  __logs?: QueueProgressLogEntry[];
  __uploadCursor?: number;
  __uploadSources?: string[];
  __uploadedUrls?: string[];
  __directorSources?: string[];
  __synthesizedPrompt?: string;
  __notifyInputMedia?: QueueNotificationMediaEntry[];
}

const normalizeValue = (value?: string | null) => (value || '').trim().toLowerCase();

export const getEffectiveImageGenerationResolution = (
  modelId?: string | null,
  speed?: string | null,
  resolution?: string | null,
) => {
  const normalizedModelId = normalizeValue(modelId);
  const normalizedSpeed = normalizeValue(speed);
  const normalizedResolution = normalizeValue(resolution);

  if (
    normalizedModelId === 'nano-banana-pro' &&
    normalizedSpeed === 'slow' &&
    normalizedResolution === '4k'
  ) {
    return '2K';
  }

  return resolution || undefined;
};

export interface ImageEditRecipePayload {
  recipeType: 'image_edit_recipe_v1';
  modelId: string;
  prompt: string;
  sourceImage: string;
  mimeType?: string;
  resolution?: string;
  aspectRatio?: string;
  speed?: string;
  serverId?: string;
}

export interface VideoGenerateRecipePayload {
  recipeType: 'video_generate_recipe_v1';
  modelId: string;
  prompt: string;
  duration: string;
  resolution?: string;
  aspectRatio?: string;
  speed?: string;
  serverId?: string;
  keyframeImage?: string | null;
  audio?: boolean;
}

export interface MotionGenerateRecipePayload {
  recipeType: 'motion_generate_recipe_v1';
  modelId: string;
  prompt?: string;
  resolution?: string;
  speed?: string;
  serverId?: string;
  characterImage: string;
  motionVideoDataUrl: string;
}

export type QueueRecipePayload =
  | ImageGenerateRecipePayload
  | ImageEditRecipePayload
  | VideoGenerateRecipePayload
  | MotionGenerateRecipePayload;

const RECIPE_TYPES = new Set<QueueRecipeKind>([
  'image_generate_recipe_v1',
  'image_edit_recipe_v1',
  'video_generate_recipe_v1',
  'motion_generate_recipe_v1',
]);

export const isQueueRecipePayload = (payload: unknown): payload is QueueRecipePayload => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const recipeType = (payload as { recipeType?: string }).recipeType;
  return typeof recipeType === 'string' && RECIPE_TYPES.has(recipeType as QueueRecipeKind);
};

const IMAGE_QUALITY_BOOSTERS =
  'masterpiece, best quality, ultra-detailed, 8k, stylized 3D game render, Korean MMO 3D style, stylized 3D skin texture, smooth game-engine materials, clean sculpted 3D facial planes, stylized MMO avatar topology, BJD-inspired stylized proportions, non-photorealistic 3D character, ray tracing, hdr, cinematic lighting, unreal engine 5 render';
const IMAGE_NEGATIVE_PROMPT =
  'low quality, bad anatomy, worst quality, blur, grain, watermark, text, signature, bad hands, bad face, mixed backgrounds, conflicting styles, extra characters, unwanted people from style reference, real people, photorealistic humans, photograph, realistic photography, real life, semi-realistic human, cinematic human portrait, live action, realistic skin pores, natural skin texture, DSLR, realistic male model, realistic female model, hyperreal face, realistic eyelashes, realistic fabric, anime, cartoon, 2d, flat shading, floating character, disconnected limbs, hands in the air, feet not touching the ground, floating objects, unnatural posture, floating in mid-air, levitating, hovering, disconnected from background, bad perspective, illogical physics';
const IMAGE_ROLE_LOCK_CONSTRAINTS =
  'STRICT ROLE LOCK: CHARACTER REFERENCES are the only source of truth for face, hair, skin tone, head shape, body structure, outfit, shoes, accessories, and overall identity. CHARACTER REFERENCES are NOT pose references and must never preserve their original standing pose, limb placement, framing, or background. SAMPLE IMAGE is the only source for pose, camera angle, framing, hand placement, spacing between subjects, left-to-right arrangement, relative heights, body lean, limb placement, and background composition. The renderer must transplant the exact character from the character references into the sample composition, rather than returning a near-unchanged copy of any uploaded character reference. STYLE IMAGE has already been analyzed upstream and converted into style instructions only. Any style guidance derived from that image may influence only render quality, lighting behavior, material response, color grading, stylized skin shading, broad adult 3D proportions, hand/face topology language, and final artistic finish. Style guidance must never transfer pose, clothing, hairstyle, accessories, face, character identity, gender presentation, number of characters, or composition. If the sample image is a real human photo, translate only its composition into the stylized 3D game-avatar language from the character references plus the extracted style instructions. The final subject must stay a stylized 3D game character and must never drift toward a real human, semi-realistic portrait, or photographic anatomy. Preserve the game-avatar topology, stylized skin shading, stylized hands, stylized facial structure, and clean 3D render finish from the style guidance. Do not humanize, beautify, reinterpret, invent facial structure, hair texture, skin texture, clothing details, or invent a new group arrangement. For multi-character scenes, preserve the exact sample choreography instead of collapsing everyone into a default straight lineup.';

export const shouldLockSampleCompositionForMultiCharacter = (payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'sampleImage'>) =>
  Boolean(payload.sampleImage) && (payload.characterImages?.length || 0) >= 2;

export const getImageDirectorSources = (payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'sampleImage' | 'styleImage'>) =>
  [
    ...(payload.characterImages || []),
    ...(payload.sampleImage ? [payload.sampleImage] : []),
    ...(payload.styleImage ? [payload.styleImage] : []),
  ].filter((value): value is string => Boolean(value));

export const getImageRenderReferenceEntries = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'sampleImage' | 'styleImage'>,
): ImageRenderReferenceEntry[] => {
  const entries: ImageRenderReferenceEntry[] = [];

  (payload.characterImages || [])
    .filter((value): value is string => Boolean(value))
    .forEach((source, index) => {
      entries.push({
        role: 'character',
        source,
        indexLabel: `CHARACTER REFERENCE ${index + 1}`,
      });
    });

  // Style images remain available to the director for prompt synthesis,
  // but are intentionally excluded from direct renderer references because
  // avatar-style presets can leak face, outfit, and pose into the result.
  if (payload.sampleImage) {
    entries.push({
      role: 'sample',
      source: payload.sampleImage,
      indexLabel: 'SAMPLE IMAGE',
    });
  }

  return entries;
};

export const getImageRenderReferenceSources = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'sampleImage' | 'styleImage'>,
) => getImageRenderReferenceEntries(payload).map((entry) => entry.source);

const buildImageReferenceOrderDirective = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'sampleImage' | 'styleImage'>,
) => {
  const entries = getImageRenderReferenceEntries(payload);
  if (entries.length === 0) {
    return '';
  }

  const roleLines = entries.map((entry, index) => {
    const number = index + 1;

    switch (entry.role) {
      case 'sample':
        return `- Image ${number}: ${entry.indexLabel}. This is the PRIMARY composition anchor. Copy pose, camera angle, framing, hand placement, body lean, environment layout, and background composition from this image only. Do not copy identity, outfit, facial anatomy, skin texture, or realism from it.`;
      case 'character':
        return `- Image ${number}: ${entry.indexLabel}. Copy identity only: face, hair, head shape, skin tone, body structure, outfit, shoes, accessories, and tattoos. This image is NOT a pose reference. Ignore its current standing pose, limb placement, framing, and background.`;
      case 'style':
        return `- Image ${number}: ${entry.indexLabel}. Copy only render language: render quality, shader behavior, lighting response, material quality, stylized skin shading, stylized facial/hand planes, and broad adult game-avatar body language. Do not copy pose, outfit, hairstyle, identity, gender, character count, or composition.`;
      default:
        return `- Image ${number}: Direct reference image.`;
    }
  });

  return [
    'DIRECT VISUAL REFERENCE ORDER (the renderer receives these reference images in this exact order):',
    ...roleLines,
    'HARD CONFLICT RULES:',
    '- If CHARACTER REFERENCES conflict with the SAMPLE IMAGE, keep identity/outfit from CHARACTER REFERENCES but re-pose the final character to match the SAMPLE IMAGE exactly.',
    '- The final image must never be a near-unchanged copy of a standing CHARACTER REFERENCE unless the SAMPLE IMAGE itself is also a standing front-view pose.',
    '- Any extracted style guidance may improve render quality only. It must not override pose, composition, identity, outfit, or subject count.',
  ].join('\n');
};

export const buildImageProviderPrompt = (
  prompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'sampleImage' | 'styleImage'>,
  customNegativePrompt?: string,
) => {
  const mergedNegativePrompt = customNegativePrompt?.trim()
    ? `${IMAGE_NEGATIVE_PROMPT}, ${customNegativePrompt.trim()}`
    : IMAGE_NEGATIVE_PROMPT;
  const referenceOrderDirective = buildImageReferenceOrderDirective(payload);

  return `STRICT RENDER DIRECTIVE:\n${IMAGE_ROLE_LOCK_CONSTRAINTS}\n\n${referenceOrderDirective}\n\nPRIMARY COMMAND PROMPT:\n${prompt}\n\nQUALITY TARGET:\n${IMAGE_QUALITY_BOOSTERS}\n\nNegative Prompt: ${mergedNegativePrompt}`;
};

export const getRecipeValidationPayload = (payload: QueueRecipePayload) => {
  switch (payload.recipeType) {
    case 'image_generate_recipe_v1':
      return {
        model: payload.modelId,
        resolution: getEffectiveImageGenerationResolution(payload.modelId, payload.speed, payload.resolution)?.toLowerCase(),
        aspect_ratio: payload.aspectRatio,
        speed: payload.speed,
        server_id: payload.serverId,
      };
    case 'image_edit_recipe_v1':
      return {
        model: payload.modelId,
        resolution: payload.resolution?.toLowerCase(),
        aspect_ratio: payload.aspectRatio,
        speed: payload.speed,
        server_id: payload.serverId,
      };
    case 'video_generate_recipe_v1':
      return {
        model: payload.modelId,
        duration: payload.duration?.toLowerCase(),
        resolution: payload.resolution?.toLowerCase(),
        aspect_ratio: payload.aspectRatio,
        speed: payload.speed,
        server_id: payload.serverId,
        audio: payload.audio,
      };
    case 'motion_generate_recipe_v1':
      return {
        model: payload.modelId,
        resolution: payload.resolution?.toLowerCase(),
        speed: payload.speed,
        server_id: payload.serverId,
      };
    default:
      return {};
  }
};
