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
  userPromptInput?: string;
  systemPromptPrefix?: string | null;
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

const CHARACTER_REFERENCE_KIND_PRIORITY: Record<CharacterReferenceKind, number> = {
  face: 0,
  body: 1,
  reference: 2,
};

const sortCharacterReferences = (references: CharacterReferenceSourceEntry[]) =>
  [...references].sort(
    (a, b) => CHARACTER_REFERENCE_KIND_PRIORITY[a.kind] - CHARACTER_REFERENCE_KIND_PRIORITY[b.kind],
  );

const LAYERED_SINGLE_SUBJECT_PROMPT_PATTERNS = [
  /\bdouble exposure\b/i,
  /\bdouble-exposure\b/i,
  /\bmultiple exposure\b/i,
  /\bsuperimpos(?:e|ed|ing|ition)\b/i,
  /\boverlay(?:ed|ing)?\b/i,
  /\bghost(?:ly|ed)?\b/i,
  /\bphantom\b/i,
  /\becho(?:es)?\b/i,
  /phơi sáng kép/i,
  /đa phơi sáng/i,
  /xếp chồng/i,
  /chồng lớp/i,
  /bóng ma/i,
  /bóng chồng/i,
  /hai tư thế/i,
  /nhiều lớp hình/i,
];

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
const COMPACT_IMAGE_QUALITY_BOOSTERS =
  'ultra-detailed, stylized 3D game render, Korean MMO 3D style, stylized MMO avatar topology, unreal engine 5 render, cinematic lighting, ray tracing, hdr';
const IMAGE_NEGATIVE_PROMPT =
  'low quality, bad anatomy, worst quality, blur, grain, watermark, text, signature, bad hands, bad face, mixed backgrounds, conflicting styles, extra characters, unwanted people from style reference, real people, photorealistic humans, photograph, realistic photography, real life, semi-realistic human, cinematic human portrait, live action, realistic skin pores, natural skin texture, DSLR, realistic male model, realistic female model, hyperreal face, realistic eyelashes, realistic fabric, anime, cartoon, 2d, flat shading, floating character, disconnected limbs, hands in the air, feet not touching the ground, floating objects, unnatural posture, floating in mid-air, levitating, hovering, disconnected from background, bad perspective, illogical physics, panel layout, split screen, tiled image, image grid, collage, storyboard, diptych, triptych, quadrants, four panels, four-up layout, contact sheet';
const IMAGE_ROLE_LOCK_CONSTRAINTS =
  'STRICT ROLE LOCK: CHARACTER REFERENCES are the only identity source for face, hair, skin tone, head shape, body structure, outfit, shoes, accessories, tattoos, gender, and overall avatar identity. FACE LOCK references, when present, are the highest-priority source for eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, and facial likeness. CHARACTER REFERENCES are NOT pose references. SAMPLE IMAGE is composition-only and controls pose, camera angle, framing, subject placement, body lean, hand placement, spacing, scene layout, and background composition only. SAMPLE IMAGE must never contribute face identity, hairstyle identity, makeup identity, or facial expression identity, even if the sample face is large, sharp, centered, or visually dominant. Never reproduce SAMPLE IMAGE as the final output, never borrow its identity, outfit, or realism, and never return any uploaded reference nearly unchanged. STYLE IMAGE is style-only and may influence only render quality, lighting behavior, material response, color grading, stylized skin shading, broad adult 3D body language, and final finish. STYLE IMAGE must never override identity, subject count, pose, composition, or outfit. The final image must keep one-to-one slot mapping for all uploaded characters, remain a stylized 3D game avatar, and never become a photorealistic or semi-realistic human.';
const REDUCED_IMAGE_ROLE_LOCK_CONSTRAINTS_NO_SAMPLE =
  'STRICT ROLE LOCK: No SAMPLE IMAGE is provided, so USER REQUEST is the primary source for pose, framing, action, scene layout, and background. CHARACTER REFERENCES still define identity only and are NOT pose references. FACE LOCK references, when present, are the highest-priority source for eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, and facial likeness. STYLE IMAGE is style-only and may influence only render quality, lighting behavior, material response, color grading, stylized skin shading, facial and hand planes, and final 3D finish. STYLE IMAGE must never override identity, pose, composition, camera framing, gender presentation, subject count, or outfit. Never return any uploaded reference nearly unchanged when the USER REQUEST asks for a different pose, scene, framing, or environment. Keep the result as a stylized 3D game avatar, not a photorealistic or semi-realistic human.';
const MAX_PROVIDER_PROMPT_LENGTH = 3200;
const MAX_NEGATIVE_PROMPT_LENGTH = 900;

const collapsePromptWhitespace = (value?: string | null) =>
  String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const trimProviderPrompt = (value: string) => {
  if (value.length <= MAX_PROVIDER_PROMPT_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_PROVIDER_PROMPT_LENGTH - 1).trimEnd()}…`;
};

const dedupeCsvPromptTerms = (...sources: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const ordered: string[] = [];

  sources.forEach((source) => {
    String(source || '')
      .split(',')
      .map((entry) => collapsePromptWhitespace(entry))
      .filter(Boolean)
      .forEach((entry) => {
        const key = entry.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        ordered.push(entry);
      });
  });

  return ordered.join(', ');
};

const getPrimaryUserRequestText = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput'>,
) => collapsePromptWhitespace(payload.userPromptInput || payload.prompt || '');

const trimPromptText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

export const shouldLockSampleCompositionForMultiCharacter = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage'>,
) =>
  Boolean(payload.sampleImage) &&
  Math.max(
    0,
    Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 0)),
  ) >= 2;

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
    .map((group) => ({
      ...group,
      references: sortCharacterReferences(group.references),
    }))
    .filter((group) => group.references.length > 0)
    .sort((a, b) => a.characterIndex - b.characterIndex);

  if (explicitGroups.length > 0) {
    return explicitGroups;
  }

  return buildFallbackCharacterReferenceGroups(payload);
};

export const allowsLayeredSingleSubjectComposition = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'characterImages' | 'characterCount' | 'characterReferenceGroups'>,
) => {
  const expectedCount = Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)));
  if (expectedCount !== 1) {
    return false;
  }

  const prompt = collapsePromptWhitespace(payload.prompt || '');
  if (!prompt) {
    return false;
  }

  return LAYERED_SINGLE_SUBJECT_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
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
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
) => {
  const entries = getImageRenderReferenceEntries(payload);
  const hasSample = Boolean(payload.sampleImage);
  const layeredSingleSubjectAllowed = allowsLayeredSingleSubjectComposition(payload);
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
        return `- Image ${number}: ${entry.indexLabel}. This is the PRIMARY composition anchor. It has already been processed into a composition-only guide. Copy pose, camera angle, framing, hand placement, body lean, environment layout, and background composition from this image only. Do not copy identity, outfit, facial anatomy, facial expression identity, hair identity, skin texture, text overlays, or realism from it. Never reproduce this reference as the final image.`;
      case 'character':
        return entry.indexLabel.includes('FACE LOCK')
          ? `- Image ${number}: ${entry.indexLabel}. This is the highest-priority face identity anchor. Copy exact eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, and facial likeness from this image. Override any conflicting face information from SAMPLE IMAGE, STYLE IMAGE, BODY references, or prompt phrasing.`
          : `- Image ${number}: ${entry.indexLabel}. Copy identity only: face, hair, head shape, skin tone, body structure, outfit, shoes, accessories, and tattoos. This image is NOT a pose reference. Ignore its current standing pose, limb placement, framing, and background.`;
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
    layeredSingleSubjectAllowed
      ? '- The final image must represent exactly 1 underlying uploaded character slot. Prompt-requested double exposure, ghost overlays, layered silhouettes, or superimposed echoes of that SAME character are allowed and do not count as extra characters.'
      : `- The final image must contain exactly ${Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)))} character(s). Never add or remove subjects.`,
    layeredSingleSubjectAllowed
      ? '- The uploaded CHARACTER slot remains mandatory and must stay the only underlying identity source. Do not invent a second distinct person.'
      : '- Every uploaded CHARACTER slot is mandatory. Each slot must appear exactly once in the final image as its own subject.',
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

const buildReducedImageReferenceOrderDirectiveWithoutSample = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'styleImage'>,
) => {
  const entries = getImageRenderReferenceEntries(payload);
  const layeredSingleSubjectAllowed = allowsLayeredSingleSubjectComposition(payload);

  if (entries.length === 0) {
    return [
      'DIRECT VISUAL REFERENCE ORDER:',
      '- No direct reference images are available.',
      '- USER REQUEST drives composition, camera, action, scene layout, and background.',
    ].join('\n');
  }

  const roleLines = entries.map((entry, index) => {
    const number = index + 1;

    switch (entry.role) {
      case 'character':
        return entry.indexLabel.includes('FACE LOCK')
          ? `- Image ${number}: ${entry.indexLabel}. Highest-priority face identity only: eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, and facial likeness.`
          : `- Image ${number}: ${entry.indexLabel}. Identity only: face, hair, skin tone, body structure, outfit, shoes, accessories, and tattoos. This image is NOT a pose reference.`;
      case 'style':
        return `- Image ${number}: ${entry.indexLabel}. Render language only: lighting, material response, color grading, stylized skin shading, facial/hand planes, and final 3D finish.`;
      default:
        return `- Image ${number}: Direct reference image.`;
    }
  });

  return [
    'DIRECT VISUAL REFERENCE ORDER:',
    ...roleLines,
    '- COMPOSITION PRIORITY: USER REQUEST is the main source for pose, framing, action, scene layout, and background because no SAMPLE IMAGE is present.',
    'SUBJECT RULES:',
    layeredSingleSubjectAllowed
      ? '- Keep exactly one underlying uploaded character slot. Prompt-requested double exposure / ghost overlays of that SAME character are allowed.'
      : `- Render exactly ${Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)))} character(s) with one-to-one slot mapping.`,
    layeredSingleSubjectAllowed
      ? '- Do not invent a second distinct person.'
      : '- Every uploaded CHARACTER slot is mandatory. Never add, remove, duplicate, blend, or replace a slot.',
    '- STYLE IMAGE must never override identity, subject count, or composition.',
    '- Never output a split-screen, image grid, collage, storyboard, or panel layout.',
  ].join('\n');
};

const buildCompactProviderReferenceSummary = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
) => {
  const entries = getImageRenderReferenceEntries(payload);
  if (entries.length === 0) {
    return 'No reference images available.';
  }

  return entries.map((entry, index) => {
    const number = index + 1;

    switch (entry.role) {
      case 'character':
        return entry.indexLabel.includes('FACE LOCK')
          ? `- Image ${number} = ${entry.indexLabel}: highest-priority face identity only, never pose.`
          : `- Image ${number} = ${entry.indexLabel}: identity only, never pose.`;
      case 'sample':
        return `- Image ${number} = ${entry.indexLabel}: composition only, never face identity, never outfit identity, never final output.`;
      case 'style':
        return `- Image ${number} = ${entry.indexLabel}: render style only, never pose, identity, outfit, or composition.`;
      default:
        return `- Image ${number} = ${entry.indexLabel}.`;
    }
  }).join('\n');
};

const buildDetailedImageProviderPrompt = (
  synthesizedPrompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
  mergedNegativePrompt: string,
) => {
  const referenceSummary = buildCompactProviderReferenceSummary(payload);
  const originalUserPrompt = getPrimaryUserRequestText(payload);
  const normalizedSynthesizedPrompt = synthesizedPrompt?.trim() || originalUserPrompt;
  const layeredSingleSubjectAllowed = allowsLayeredSingleSubjectComposition(payload);
  const characterCount = Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)));
  const compactNegativePrompt = trimPromptText(mergedNegativePrompt, MAX_NEGATIVE_PROMPT_LENGTH);

  return trimProviderPrompt([
    'RENDER ONE NEW FINAL IMAGE. Never return any uploaded reference unchanged.',
    IMAGE_ROLE_LOCK_CONSTRAINTS,
    `CHARACTER COUNT: EXACTLY ${characterCount}. One-to-one slot mapping is mandatory.`,
    '',
    'PRIMARY USER REQUEST:',
    originalUserPrompt || 'No additional user prompt provided.',
    '',
    'REFERENCE ORDER:',
    referenceSummary,
    layeredSingleSubjectAllowed
      ? '\nLAYERED SINGLE-SUBJECT EXCEPTION:\n- The user intentionally requests a double-exposure / ghost-overlay / superimposed-self composition.\n- Keep exactly one underlying uploaded character identity, but layered echoes of that SAME person are allowed when they are part of the requested artistic effect.\n- Do not invent a second distinct person.'
      : '',
    '',
    'DIRECTOR JSON SPEC (authoritative, English):',
    normalizedSynthesizedPrompt || 'No director synthesis available.',
    '',
    `QUALITY: ${COMPACT_IMAGE_QUALITY_BOOSTERS}`,
    '',
    `NEGATIVE: ${compactNegativePrompt}`,
  ].join('\n'));
};

const buildReducedImageProviderPromptWithoutSample = (
  synthesizedPrompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'styleImage'>,
  mergedNegativePrompt: string,
) => {
  const referenceSummary = buildCompactProviderReferenceSummary(payload);
  const originalUserPrompt = getPrimaryUserRequestText(payload);
  const normalizedSynthesizedPrompt = synthesizedPrompt?.trim() || originalUserPrompt;
  const layeredSingleSubjectAllowed = allowsLayeredSingleSubjectComposition(payload);
  const characterCount = Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)));
  const compactNegativePrompt = trimPromptText(mergedNegativePrompt, MAX_NEGATIVE_PROMPT_LENGTH);

  return trimProviderPrompt([
    'RENDER ONE NEW FINAL IMAGE. Never return any uploaded reference unchanged.',
    REDUCED_IMAGE_ROLE_LOCK_CONSTRAINTS_NO_SAMPLE,
    `CHARACTER COUNT: EXACTLY ${characterCount}. One-to-one slot mapping is mandatory.`,
    '',
    'PRIMARY USER REQUEST:',
    originalUserPrompt || 'No additional user prompt provided.',
    '',
    'REFERENCE ORDER:',
    referenceSummary,
    layeredSingleSubjectAllowed
      ? '\nLAYERED SINGLE-SUBJECT EXCEPTION:\n- Keep exactly one uploaded character identity.\n- Double exposure / ghost overlays / layered echoes of that SAME character are allowed.\n- Do not invent a second distinct person.'
      : '',
    '',
    'DIRECTOR JSON SPEC (authoritative, English):',
    normalizedSynthesizedPrompt || 'No director synthesis available.',
    '',
    `QUALITY: ${COMPACT_IMAGE_QUALITY_BOOSTERS}`,
    '',
    `NEGATIVE: ${compactNegativePrompt}`,
  ].join('\n'));
};

export const buildImageProviderPrompt = (
  synthesizedPrompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
  customNegativePrompt?: string,
) => {
  const mergedNegativePrompt = dedupeCsvPromptTerms(IMAGE_NEGATIVE_PROMPT, customNegativePrompt);

  if (payload.sampleImage) {
    return buildDetailedImageProviderPrompt(synthesizedPrompt, payload, mergedNegativePrompt);
  }

  return buildReducedImageProviderPromptWithoutSample(synthesizedPrompt, payload, mergedNegativePrompt);
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
