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
  | 'verifying_output'
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

export type CharacterReferenceKind = 'body' | 'face' | 'reference';
export type CharacterReferenceGender = 'female' | 'male';

export interface CharacterReferenceSourceEntry {
  source: string;
  kind: CharacterReferenceKind;
}

export interface CharacterReferenceGroup {
  characterIndex: number;
  gender?: CharacterReferenceGender;
  references: CharacterReferenceSourceEntry[];
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
  characterReferenceGroups?: CharacterReferenceGroup[];
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
  __outputVerificationRetryCount?: number;
  __lastOutputVerificationSummary?: string;
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
  motionVideoDurationSeconds?: number | null;
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
  'low quality, bad anatomy, worst quality, blur, grain, watermark, text, signature, bad hands, bad face, mixed backgrounds, conflicting styles, extra characters, unwanted people from style reference, real people, photorealistic humans, photograph, realistic photography, real life, semi-realistic human, cinematic human portrait, live action, realistic skin pores, natural skin texture, DSLR, realistic male model, realistic female model, hyperreal face, realistic eyelashes, realistic fabric, anime, cartoon, 2d, flat shading, floating character, disconnected limbs, hands in the air, feet not touching the ground, floating objects, unnatural posture, floating in mid-air, levitating, hovering, disconnected from background, bad perspective, illogical physics, panel layout, split screen, tiled image, image grid, collage, storyboard, diptych, triptych, quadrants, four panels, four-up layout, contact sheet';
const IMAGE_ROLE_LOCK_CONSTRAINTS =
  'STRICT ROLE LOCK: CHARACTER REFERENCES are the only source of truth for face, hair, skin tone, head shape, body structure, outfit, shoes, accessories, gender, and overall identity. Each CHARACTER slot is a required final subject. If multiple CHARACTER REFERENCE images belong to the same character slot, they all describe the SAME final character and must be merged into one identity, never split into extra people. CHARACTER REFERENCES are NOT pose references and must never preserve their original standing pose, limb placement, framing, or background. SAMPLE IMAGE is a processed pose/composition reference and is the only source for pose, camera angle, framing, hand placement, spacing between subjects, left-to-right arrangement, relative heights, body lean, limb placement, and background composition. The renderer must transplant the exact uploaded character from each character slot into the sample composition, rather than returning a near-unchanged copy of any uploaded character reference. STYLE IMAGE may influence only render quality, lighting behavior, material response, color grading, stylized skin shading, broad adult 3D proportions, hand/face topology language, and final artistic finish. STYLE IMAGE must never transfer pose, clothing, hairstyle, accessories, face, character identity, gender presentation, number of characters, composition, panel layout, tiling, or black studio background. The final image must contain exactly the requested number of characters, no more and no less, and each final subject must map one-to-one to a distinct uploaded character slot. Never replace a missing slot with a duplicated character, a blended identity, a sample person, or a style person. If the sample image is a real human photo, translate only its composition into the stylized 3D game-avatar language from the character and style references. The final subject must stay a stylized 3D game character and must never drift toward a real human, semi-realistic portrait, or photographic anatomy. Preserve the game-avatar topology, stylized skin shading, stylized hands, stylized facial structure, and clean 3D render finish from the style reference. Do not humanize, beautify, reinterpret, invent facial structure, hair texture, skin texture, clothing details, invent a new group arrangement, or return a split-panel / grid / collage layout. For multi-character scenes, preserve the exact sample choreography instead of collapsing everyone into a default straight lineup.';

export const shouldLockSampleCompositionForMultiCharacter = (payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'sampleImage'>) =>
  Boolean(payload.sampleImage) && (payload.characterImages?.length || 0) >= 2;

const buildFallbackCharacterReferenceGroups = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount'>,
): CharacterReferenceGroup[] => {
  const flatReferences = (payload.characterImages || []).filter((value): value is string => Boolean(value));
  const expectedCharacters = Math.max(0, Math.floor(Number(payload.characterCount || 0))) || flatReferences.length;

  if (flatReferences.length === 0 || expectedCharacters <= 0) {
    return [];
  }

  const groups: CharacterReferenceGroup[] = [];
  let cursor = 0;
  const remainingCharacters = expectedCharacters;

  for (let index = 0; index < remainingCharacters; index += 1) {
    const charactersLeft = remainingCharacters - index;
    const referencesLeft = flatReferences.length - cursor;
    const size = Math.max(1, Math.ceil(referencesLeft / charactersLeft));
    const refs = flatReferences.slice(cursor, cursor + size).map((source) => ({
      source,
      kind: 'reference' as const,
    }));
    cursor += size;
    groups.push({
      characterIndex: index + 1,
      references: refs,
    });
  }

  return groups.filter((group) => group.references.length > 0);
};

export const getImageCharacterReferenceGroups = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups'>,
) => {
  const explicitGroups = (payload.characterReferenceGroups || [])
    .map((group, index) => ({
      characterIndex: Math.max(1, Math.floor(Number(group.characterIndex || index + 1))),
      gender: group.gender === 'female' || group.gender === 'male' ? group.gender : undefined,
      references: (group.references || []).filter(
        (entry): entry is CharacterReferenceSourceEntry =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof entry.source === 'string' &&
          entry.source.trim().length > 0,
      ),
    }))
    .filter((group) => group.references.length > 0)
    .sort((a, b) => a.characterIndex - b.characterIndex);

  if (explicitGroups.length > 0) {
    return explicitGroups;
  }

  return buildFallbackCharacterReferenceGroups(payload);
};

export const validateImageGenerateReferenceIntegrity = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups'>,
) => {
  const groups = getImageCharacterReferenceGroups(payload);
  const expectedCharacters = Math.max(0, Math.floor(Number(payload.characterCount || 0))) || groups.length;

  if (groups.length === 0) {
    throw new Error('CRITICAL FAILURE: Character reference groups are missing.');
  }

  if (expectedCharacters > 0 && groups.length !== expectedCharacters) {
    throw new Error(`CRITICAL FAILURE: Expected ${expectedCharacters} character reference groups but received ${groups.length}.`);
  }

  const hasEmptyGroup = groups.some((group) => group.references.length === 0);
  if (hasEmptyGroup) {
    throw new Error('CRITICAL FAILURE: One or more character reference groups are empty.');
  }

  const indices = groups.map((group) => group.characterIndex);
  const uniqueIndices = new Set(indices);
  if (uniqueIndices.size !== indices.length) {
    throw new Error('CRITICAL FAILURE: Duplicate character slot indexes detected.');
  }

  if (expectedCharacters > 0) {
    for (let index = 1; index <= expectedCharacters; index += 1) {
      if (!uniqueIndices.has(index)) {
        throw new Error(`CRITICAL FAILURE: Missing character reference group for slot ${index}.`);
      }
    }
  }

  return groups;
};

export const getImageDirectorSources = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
) =>
  [
    ...getImageCharacterReferenceGroups(payload).flatMap((group) => group.references.map((entry) => entry.source)),
    ...(payload.sampleImage ? [payload.sampleImage] : []),
    ...(payload.styleImage ? [payload.styleImage] : []),
  ].filter((value): value is string => Boolean(value));

export const getImageRenderReferenceEntries = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
): ImageRenderReferenceEntry[] => {
  const entries: ImageRenderReferenceEntry[] = [];

  getImageCharacterReferenceGroups(payload).forEach((group) => {
    group.references.forEach((reference, referenceIndex) => {
      const kindLabel =
        reference.kind === 'body'
          ? 'BODY'
          : reference.kind === 'face'
            ? 'FACE LOCK'
            : `REFERENCE ${referenceIndex + 1}`;
      const genderLabel = group.gender ? ` ${group.gender.toUpperCase()}` : '';
      entries.push({
        role: 'character',
        source: reference.source,
        indexLabel: `CHARACTER ${group.characterIndex}${genderLabel} ${kindLabel}`,
      });
    });
  });

  if (payload.sampleImage) {
    entries.push({
      role: 'sample',
      source: payload.sampleImage,
      indexLabel: 'SAMPLE IMAGE',
    });
  }

  if (payload.styleImage) {
    entries.push({
      role: 'style',
      source: payload.styleImage,
      indexLabel: 'STYLE IMAGE',
    });
  }

  return entries;
};

export const getImageRenderReferenceSources = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
) => getImageRenderReferenceEntries(payload).map((entry) => entry.source);

const buildImageReferenceOrderDirective = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
) => {
  const entries = getImageRenderReferenceEntries(payload);
  const hasSample = Boolean(payload.sampleImage);
  if (entries.length === 0) {
    return hasSample
      ? ''
      : [
          'COMPOSITION PRIORITY:',
          '- No SAMPLE IMAGE is provided.',
          '- Use the PRIMARY COMMAND PROMPT as the highest-priority source for pose, camera angle, framing, action, scene layout, and background details.',
          '- CHARACTER REFERENCES still control identity only.',
          '- STYLE IMAGE may affect render quality only and must never override prompt-driven composition.',
        ].join('\n');
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
    hasSample
      ? '- COMPOSITION PRIORITY: SAMPLE IMAGE first, then PRIMARY COMMAND PROMPT for secondary scene details that do not break the sample composition.'
      : '- COMPOSITION PRIORITY: No SAMPLE IMAGE is present, so PRIMARY COMMAND PROMPT is the main source for pose, framing, action, scene layout, and background.',
    'HARD CONFLICT RULES:',
    `- The final image must contain exactly ${Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)))} character(s). Never add or remove subjects.`,
    '- Every uploaded CHARACTER slot is mandatory. Each slot must appear exactly once in the final image as its own subject.',
    '- If multiple CHARACTER REFERENCE images share the same CHARACTER number, they all belong to the same final subject and must be merged into one identity.',
    '- Never duplicate one uploaded character to fill another slot. Never omit a slot and replace it with a sample person, style person, or invented/blended subject.',
    hasSample
      ? '- If CHARACTER REFERENCES conflict with the SAMPLE IMAGE, keep identity/outfit from CHARACTER REFERENCES but re-pose the final character to match the SAMPLE IMAGE exactly.'
      : '- Without a SAMPLE IMAGE, never ignore the PRIMARY COMMAND PROMPT and fall back to a default standing pose or empty black background unless the prompt explicitly asks for that.',
    hasSample
      ? '- The final image must never be a near-unchanged copy of a standing CHARACTER REFERENCE unless the SAMPLE IMAGE itself is also a standing front-view pose.'
      : '- The final image must never be a near-unchanged copy of a standing CHARACTER REFERENCE when the PRIMARY COMMAND PROMPT asks for a different pose, scene, framing, or background.',
    '- STYLE IMAGE may improve render quality only. It must not override pose, composition, identity, outfit, or subject count.',
    '- Never output a split-screen, image grid, collage, storyboard, or panel layout. Always render one single continuous final frame.',
  ].join('\n');
};

export const buildImageProviderPrompt = (
  prompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
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
