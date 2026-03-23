export type QueueRecipeKind =
  | 'image_generate_recipe_v1'
  | 'image_edit_recipe_v1'
  | 'video_generate_recipe_v1'
  | 'motion_generate_recipe_v1';

export interface ImageGenerateRecipePayload {
  recipeType: 'image_generate_recipe_v1';
  modelId: string;
  prompt: string;
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
}

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
  'STRICT ROLE LOCK: CHARACTER REFERENCES are the only source of truth for face, hair, skin tone, head shape, body structure, outfit, accessories, and overall identity. SAMPLE IMAGE is only for pose, camera angle, framing, hand placement, and background composition. STYLE IMAGE is only for render quality, lighting, material response, color grading, and final artistic finish. If the sample image is a real human photo, translate only its composition into the stylized 3D game-avatar language from the character and style references. The final subject must stay a stylized 3D game character and must never drift toward a real human, semi-realistic portrait, or photographic anatomy. Preserve the game-avatar topology, stylized skin shading, stylized hands, stylized facial structure, and clean 3D render finish from the style reference. Do not humanize, beautify, reinterpret, or invent facial structure, hair texture, skin texture, or clothing details.';

export const buildImageProviderPrompt = (prompt: string, customNegativePrompt?: string) => {
  const mergedNegativePrompt = customNegativePrompt?.trim()
    ? `${IMAGE_NEGATIVE_PROMPT}, ${customNegativePrompt.trim()}`
    : IMAGE_NEGATIVE_PROMPT;

  return `STRICT RENDER DIRECTIVE:\n${IMAGE_ROLE_LOCK_CONSTRAINTS}\n\nPRIMARY COMMAND PROMPT:\n${prompt}\n\nQUALITY TARGET:\n${IMAGE_QUALITY_BOOSTERS}\n\nNegative Prompt: ${mergedNegativePrompt}`;
};

export const getRecipeValidationPayload = (payload: QueueRecipePayload) => {
  switch (payload.recipeType) {
    case 'image_generate_recipe_v1':
      return {
        model: payload.modelId,
        resolution: payload.resolution?.toLowerCase(),
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
