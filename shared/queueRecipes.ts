export type QueueRecipeKind =
  | 'image_generate_recipe_v1'
  | 'prompt_image_generate_recipe_v1'
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

export interface QueueVertexDiagnosticEntry {
  at: string;
  task: 'image_prompt_synthesis' | 'image_prompt_compression' | 'image_reference_analysis';
  status: 'success' | 'warning' | 'error';
  message: string;
  credentialName?: string;
  projectId?: string;
  model?: string;
  finishReasons?: string[];
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  safetyRatings?: string[];
}

export interface QueueNotificationMediaEntry {
  url: string;
  role: 'character' | 'sample' | 'style' | 'source' | 'keyframe' | 'motion' | 'reference';
  kind: 'image' | 'video';
  userProvided?: boolean;
}

export type ImageRenderReferenceRole = 'sample' | 'character' | 'style';
export type CharacterFacePriorityMode = 'portrait_headshot';

export interface ImageRenderReferenceEntry {
  role: ImageRenderReferenceRole;
  source: string;
  indexLabel: string;
  facePriorityMode?: CharacterFacePriorityMode;
}

export interface ImageRoleContractLayer {
  name: 'identity' | 'composition' | 'style';
  priority: number;
  title: string;
  summary: string;
  rules: string[];
}

export interface ImageRoleContract {
  characterCount: number;
  layeredSingleSubjectAllowed: boolean;
  shotType: 'close_up' | 'half_body' | 'full_body';
  renderEntries: ImageRenderReferenceEntry[];
  layers: ImageRoleContractLayer[];
  globalRules: string[];
}

export interface ImageRoleWeights {
  sampleComposition: number;
  sampleBackground: number;
  characterBodyIdentity: number;
  characterFaceIdentity: number;
  characterFaceDetail: number;
  styleRender: number;
}

export type CharacterReferenceKind = 'body' | 'face' | 'face_detail' | 'reference';
export type CharacterReferenceGender = 'female' | 'male';

export interface CharacterAppearanceProfile {
  skinToneHex?: string;
  skinToneDescriptor?: string;
}

export interface CharacterVisionAnalysis {
  characterIndex: number;
  summary?: string;
  skinToneDescriptor?: string;
  skinToneHexApprox?: string;
  faceIdentityNotes?: string[];
  makeupNotes?: string[];
  faceAccessoryNotes?: string[];
  hairNotes?: string[];
  outfitNotes?: string[];
  proIdentityTags?: string[];
  proFaceTags?: string[];
  proAppearanceTags?: string[];
}

export interface SampleVisionAnalysis {
  summary?: string;
  pose?: string;
  camera?: string;
  framing?: string;
  subjectPlacement?: string;
  background?: string;
  lighting?: string;
  limbLayout?: string;
  supportContact?: string;
  occlusionNotes?: string;
  proSceneTags?: string[];
  proPoseTags?: string[];
  proContactTags?: string[];
}

export interface StyleVisionAnalysis {
  summary?: string;
  renderStyle?: string;
  materialStyle?: string;
  lightingStyle?: string;
  colorGrading?: string;
  finish?: string;
  proStyleTags?: string[];
  proMaterialTags?: string[];
  proLightingTags?: string[];
}

export interface ImageVisionAnalysis {
  characters: CharacterVisionAnalysis[];
  sample?: SampleVisionAnalysis;
  style?: StyleVisionAnalysis;
}

export interface CharacterReferenceSourceEntry {
  source: string;
  kind: CharacterReferenceKind;
}

export interface CharacterReferenceGroup {
  characterIndex: number;
  gender?: CharacterReferenceGender;
  facePriorityMode?: CharacterFacePriorityMode;
  appearanceProfile?: CharacterAppearanceProfile;
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
  quality?: string;
  speed?: string;
  serverId?: string;
  negativePrompt?: string;
  characterImages?: string[];
  characterReferenceGroups?: CharacterReferenceGroup[];
  sampleImage?: string | null;
  sampleAnalysisImage?: string | null;
  styleImage?: string | null;
  styleAnalysisImage?: string | null;
  stylePrompt?: string | null;
  visionAnalysis?: ImageVisionAnalysis;
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
  __vertexDiagnostics?: QueueVertexDiagnosticEntry[];
}

export interface PromptImageGenerateRecipePayload {
  recipeType: 'prompt_image_generate_recipe_v1';
  modelId: string;
  prompt: string;
  referenceImages?: string[];
  resolution?: string;
  aspectRatio?: string;
  quality?: string;
  speed?: string;
  serverId?: string;
  __stage?: QueueProcessingStage;
  __logs?: QueueProgressLogEntry[];
  __notifyInputMedia?: QueueNotificationMediaEntry[];
}

const getCharacterReferenceKindPriority = (
  kind: CharacterReferenceKind,
  facePriorityMode?: CharacterFacePriorityMode,
) => {
  if (facePriorityMode === 'portrait_headshot') {
    const portraitPriority: Record<CharacterReferenceKind, number> = {
      face_detail: 0,
      face: 1,
      body: 2,
      reference: 3,
    };
    return portraitPriority[kind];
  }

  const defaultPriority: Record<CharacterReferenceKind, number> = {
    body: 0,
    face: 1,
    face_detail: 2,
    reference: 3,
  };
  return defaultPriority[kind];
};

const sortCharacterReferences = (
  references: CharacterReferenceSourceEntry[],
  facePriorityMode?: CharacterFacePriorityMode,
) =>
  [...references].sort(
    (a, b) =>
      getCharacterReferenceKindPriority(a.kind, facePriorityMode) -
      getCharacterReferenceKindPriority(b.kind, facePriorityMode),
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

export const isProImageGenerationModel = (modelId?: string | null) =>
  normalizeValue(modelId) === 'nano-banana-pro';

const PORTRAIT_HEADSHOT_PROMPT_PATTERNS = [
  /\bclose[\s-]?up\b/i,
  /\bhead[\s-]?shot\b/i,
  /\bportrait\b/i,
  /\bface[\s-]?shot\b/i,
  /\bbeauty shot\b/i,
  /\btight portrait\b/i,
  /\bmacro face\b/i,
  /cận mặt/i,
  /cận cảnh khuôn mặt/i,
  /góc mặt cận/i,
  /đặc tả gương mặt/i,
  /chân dung/i,
  /chân dung cận/i,
  /ảnh thẻ/i,
  /gương mặt là trung tâm/i,
];

export const resolveCharacterFacePriorityMode = (prompt?: string | null): CharacterFacePriorityMode | undefined => {
  const normalizedPrompt = collapsePromptWhitespace(prompt || '');
  if (!normalizedPrompt) {
    return undefined;
  }

  return PORTRAIT_HEADSHOT_PROMPT_PATTERNS.some((pattern) => pattern.test(normalizedPrompt))
    ? 'portrait_headshot'
    : undefined;
};

const CLOSE_UP_PROMPT_PATTERNS = [
  /\bclose[\s-]?up\b/i,
  /\bhead[\s-]?shot\b/i,
  /\btight portrait\b/i,
  /\bbeauty shot\b/i,
  /\bface[\s-]?shot\b/i,
  /\bmacro face\b/i,
  /\bextreme close[\s-]?up\b/i,
  /cận mặt/i,
  /cận cảnh khuôn mặt/i,
  /đặc tả gương mặt/i,
  /góc mặt cận/i,
  /chân dung cận/i,
];

const FULL_BODY_PROMPT_PATTERNS = [
  /\bfull[\s-]?body\b/i,
  /\bfull length\b/i,
  /\bwide shot\b/i,
  /\blong shot\b/i,
  /\bhead[\s-]?to[\s-]?toe\b/i,
  /\bfrom head to toe\b/i,
  /\bstanding full\b/i,
  /toàn thân/i,
  /nguyên người/i,
  /từ đầu đến chân/i,
];

const HALF_BODY_PROMPT_PATTERNS = [
  /\bhalf[\s-]?body\b/i,
  /\bmedium shot\b/i,
  /\bmid shot\b/i,
  /\bwaist up\b/i,
  /\bthree[\s-]?quarter\b/i,
  /bán thân/i,
  /nửa người/i,
  /từ eo trở lên/i,
];

const resolveImageShotType = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'sampleImage' | 'aspectRatio'>,
): ImageRoleContract['shotType'] => {
  const normalizedPrompt = collapsePromptWhitespace(
    [payload.userPromptInput, payload.prompt].filter(Boolean).join('\n'),
  );

  if (CLOSE_UP_PROMPT_PATTERNS.some((pattern) => pattern.test(normalizedPrompt))) {
    return 'close_up';
  }

  if (FULL_BODY_PROMPT_PATTERNS.some((pattern) => pattern.test(normalizedPrompt))) {
    return 'full_body';
  }

  if (HALF_BODY_PROMPT_PATTERNS.some((pattern) => pattern.test(normalizedPrompt))) {
    return 'half_body';
  }

  if (payload.sampleImage) {
    return payload.aspectRatio === '9:16' || payload.aspectRatio === '3:4'
      ? 'full_body'
      : 'half_body';
  }

  return 'half_body';
};

export const buildImageRoleWeights = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'sampleImage' | 'aspectRatio'>,
): ImageRoleWeights => {
  const shotType = resolveImageShotType(payload);
  const hasSample = Boolean(payload.sampleImage);

  if (shotType === 'close_up') {
    return {
      sampleComposition: hasSample ? 0.88 : 0,
      sampleBackground: hasSample ? 0.8 : 0,
      characterBodyIdentity: 0.62,
      characterFaceIdentity: 0.98,
      characterFaceDetail: 1,
      styleRender: 0.84,
    };
  }

  if (shotType === 'full_body') {
    return {
      sampleComposition: hasSample ? 1 : 0,
      sampleBackground: hasSample ? 1 : 0,
      characterBodyIdentity: 0.96,
      characterFaceIdentity: 0.74,
      characterFaceDetail: 0.42,
      styleRender: 0.82,
    };
  }

  return {
    sampleComposition: hasSample ? 0.96 : 0,
    sampleBackground: hasSample ? 0.94 : 0,
    characterBodyIdentity: 0.9,
    characterFaceIdentity: 0.9,
    characterFaceDetail: 0.68,
    styleRender: 0.82,
  };
};

const formatWeight = (value: number) => value.toFixed(2);

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
  | PromptImageGenerateRecipePayload
  | ImageEditRecipePayload
  | VideoGenerateRecipePayload
  | MotionGenerateRecipePayload;

const RECIPE_TYPES = new Set<QueueRecipeKind>([
  'image_generate_recipe_v1',
  'prompt_image_generate_recipe_v1',
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
  'masterpiece, best quality, ultra-detailed, 8k, premium stylized 3D fashion-game render, Korean MMO 3D style, crisp anti-aliased edges, clean high-fidelity game-engine materials, refined facial detail, sharp eye makeup detail, polished skin shading, premium cloth texture detail, clean accessory detail, adult-proportioned avatar anatomy, natural limb flow, believable weight distribution, non-photorealistic 3D character, ray tracing, hdr, cinematic lighting, unreal engine 5 render';
const COMPACT_IMAGE_QUALITY_BOOSTERS =
  'ultra-detailed, stylized 3D fashion-game render, Korean MMO 3D style, crisp edges, polished materials, adult-proportioned avatar anatomy, natural limb flow, unreal engine 5 render, cinematic lighting, ray tracing, hdr';
const IMAGE_NEGATIVE_PROMPT =
  'low quality, bad anatomy, worst quality, blur, grain, watermark, text, signature, bad hands, bad face, mixed backgrounds, conflicting styles, extra characters, unwanted people from style reference, real people, photorealistic humans, photograph, realistic photography, real life, semi-realistic human, cinematic human portrait, live action, realistic skin pores, natural skin texture, DSLR, realistic male model, realistic female model, hyperreal face, realistic eyelashes, realistic fabric, anime, cartoon, 2d, flat shading, floating character, disconnected limbs, hands in the air, feet not touching the ground, floating objects, unnatural posture, floating in mid-air, levitating, hovering, disconnected from background, bad perspective, illogical physics, extra arm, extra arms, extra hand, extra hands, extra leg, extra legs, extra foot, extra feet, duplicate hand, duplicate hands, duplicate foot, duplicate feet, duplicated limb, duplicated limbs, malformed feet, merged fingers, fused fingers, six fingers, seven fingers, broken wrist, twisted arm, twisted leg, long neck, elongated neck, stretched neck, giraffe neck, thin stretched neck, lowered shoulders, detached head, doll face, mannequin face, mannequin body, waxy skin, plastic skin, toy-like plastic sheen, glossy mannequin skin, hard specular skin, harsh facial planes, dark skin, darker skin, tanned skin, bronzed skin, yellow skin, orange skin, muddy skin tone, incorrect skin tone, skin tone shift, chibi proportions, giant eyes, baby face, stiff pose, rigid pose, stiff limbs, frozen posture, uncanny face, over-smoothed face, panel layout, split screen, tiled image, image grid, collage, storyboard, diptych, triptych, quadrants, four panels, four-up layout, contact sheet';
const IMAGE_ANATOMY_GUARD_CONSTRAINTS =
  'ANATOMY GUARD: Keep exactly one coherent body per character slot with natural adult-proportioned 3D anatomy. Never invent extra arms, extra hands, extra legs, extra feet, duplicated limbs, duplicated hands, duplicated feet, fused fingers, or malformed joints. Each visible hand must read as one coherent hand. Each visible foot must read as one coherent foot. If a hand, foot, or limb is partially hidden, keep it hidden naturally instead of hallucinating additional anatomy. Respect gravity, chair contact, ground contact, and believable joint bending.';
const IMAGE_NECK_SHOULDER_PROPORTION_LOCK_CONSTRAINTS =
  'NECK AND SHOULDER PROPORTION LOCK: Preserve the uploaded character reference head-to-neck-to-shoulder proportions exactly. Keep the same neck length, neck thickness, chin-to-collarbone distance, shoulder height, shoulder width, trapezius slope, and head placement relative to the torso. Never lengthen or stretch the neck for elegance, fashion posing, beauty stylization, camera angle, or style transfer. Do not lower the shoulders to create a longer neck. The head must sit naturally on the original short Audition-style 3D avatar neck.';
const IMAGE_SKIN_TONE_LOCK_CONSTRAINTS =
  'SKIN TONE LOCK: Match the exposed skin tone, brightness, and undertone from the uploaded character references exactly. Never darken the skin, never tan it, never bronze it, never shift it toward brown, never add warm orange cast, and never reinterpret complexion because of scene lighting or style. If the reference skin is fair/light, keep it fair/light in the final render while still preserving believable scene lighting.';
const AUDITION_SOFT_BEAUTY_RENDER_PROFILE =
  'SOFT BEAUTY RENDER PROFILE: Aim for premium Audition-fashion 3D beauty rendering with soft tonal transitions, natural facial shading, clean eye and lip definition, controlled saturation, elegant specular response, refined cloth and accessory separation, and expressive but non-rigid body flow. Avoid toy-like hardness, crushed contrast, oversaturated colors, thick plastic highlights, and frozen mannequin expression.';

const getShotAwareRenderProfile = (shotType: ImageRoleContract['shotType']) => {
  if (shotType === 'close_up') {
    return `${AUDITION_SOFT_BEAUTY_RENDER_PROFILE} CLOSE-UP WEIGHTING: prioritize eyes, lashes, brows, lips, skin transition, and subtle facial modeling. Allow the face to feel soft and alive, not overlocked or mask-like.`;
  }

  if (shotType === 'full_body') {
    return `${AUDITION_SOFT_BEAUTY_RENDER_PROFILE} FULL-BODY WEIGHTING: prioritize overall silhouette, natural limb flow, outfit texture, leg/arm coherence, and softer facial integration. Keep the face recognizable but do not overconcentrate detail into a stiff doll-like head.`;
  }

  return `${AUDITION_SOFT_BEAUTY_RENDER_PROFILE} HALF-BODY WEIGHTING: balance facial fidelity, torso flow, hand quality, material detail, and soft beauty shading.`;
};
const IMAGE_ROLE_LOCK_CONSTRAINTS =
  'STRICT ROLE LOCK: CHARACTER REFERENCES are the only identity source for face, hair, skin tone, head shape, body structure, outfit, shoes, accessories, tattoos, gender, and overall avatar identity. For non-portrait shots, BODY references are the primary source for full-body complexion, limb anatomy, and overall body proportions. FACE LOCK references, when present, are the highest-priority source for eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, facial proportions, and facial likeness. Preserve uploaded skin tone exactly; do not warm it, tan it, yellow it, orange it, or shift it to a different complexion. Preserve believable adult 3D anatomy from the character references; avoid doll-like proportions, rigid limbs, inflated eyes, or mannequin posture. CHARACTER REFERENCES are NOT pose references. SAMPLE IMAGE is composition-only and controls pose, camera angle, framing, subject placement, body lean, hand placement, spacing, scene layout, and background composition only. SAMPLE IMAGE must never contribute face identity, hairstyle identity, makeup identity, or facial expression identity, even if the sample face is large, sharp, centered, or visually dominant. Treat SAMPLE IMAGE as a structural guide, not a literal body copy. If the sample pose would create broken anatomy, repair the anatomy while preserving the composition. Never reproduce SAMPLE IMAGE as the final output, never borrow its identity, outfit, or realism, and never return any uploaded reference nearly unchanged. STYLE IMAGE is style-only and may influence only render quality, lighting behavior, material response, restrained color grading, and final finish. STYLE IMAGE must never override identity, skin tone, anatomy, subject count, pose, composition, or outfit. The final image must keep one-to-one slot mapping for all uploaded characters, remain a stylized 3D game avatar, and never become a photorealistic or semi-realistic human.';
const REDUCED_IMAGE_ROLE_LOCK_CONSTRAINTS_NO_SAMPLE =
  'STRICT ROLE LOCK: No SAMPLE IMAGE is provided, so USER REQUEST is the primary source for pose, framing, action, scene layout, and background. CHARACTER REFERENCES still define identity only and are NOT pose references. For non-portrait shots, BODY references are the primary source for full-body complexion, limb anatomy, and overall body proportions. FACE LOCK references, when present, are the highest-priority source for eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, facial proportions, and facial likeness. Preserve uploaded skin tone exactly; do not warm it, tan it, yellow it, orange it, or shift it to a different complexion. Preserve believable adult 3D anatomy from the character references; avoid doll-like proportions, rigid limbs, inflated eyes, or mannequin posture. STYLE IMAGE is style-only and may influence only render quality, lighting behavior, material response, restrained color grading, and final 3D finish. STYLE IMAGE must never override identity, skin tone, anatomy, pose, composition, camera framing, gender presentation, subject count, or outfit. Never return any uploaded reference nearly unchanged when the USER REQUEST asks for a different pose, scene, framing, or environment. Keep the result as a stylized 3D game avatar, not a photorealistic or semi-realistic human.';
export const DEFAULT_PROVIDER_PROMPT_MAX_LENGTH = 9999;
export const SERVER_3_PROVIDER_PROMPT_MAX_LENGTH = 3500;
const MAX_NEGATIVE_PROMPT_LENGTH = 9999;

const normalizeProviderServerId = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

export const isServer3PromptLimited = (serverId?: string | null) => {
  const normalized = normalizeProviderServerId(serverId);
  return normalized === '3' || normalized === 'vip3' || normalized === 'server3' || normalized === 'sv3';
};

export const getProviderPromptMaxLength = (serverId?: string | null) =>
  isServer3PromptLimited(serverId) ? SERVER_3_PROVIDER_PROMPT_MAX_LENGTH : DEFAULT_PROVIDER_PROMPT_MAX_LENGTH;

const collapsePromptWhitespace = (value?: string | null) =>
  String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const trimProviderPromptForServer = (value: string, serverId?: string | null) => {
  const maxLength = getProviderPromptMaxLength(serverId);
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
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

type ProviderPromptBudgetSection = {
  text: string;
  locked?: boolean;
  weight?: number;
};

const trimProviderSection = (value: string, maxLength: number) => {
  const normalized = collapsePromptWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, Math.max(0, maxLength));
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

const buildProviderPromptWithinServerBudget = (
  sections: ProviderPromptBudgetSection[],
  serverId?: string | null,
  transform?: (value: string) => string,
) => {
  const maxLength = getProviderPromptMaxLength(serverId);
  const normalizedSections = sections
    .map((section) => ({
      ...section,
      text: transform ? transform(section.text) : collapsePromptWhitespace(section.text),
      weight: Math.max(0.25, Number(section.weight || 1)),
    }))
    .filter((section) => section.text);

  const fullPrompt = normalizedSections.map((section) => section.text).join('\n\n');
  if (fullPrompt.length <= maxLength) {
    return fullPrompt;
  }

  const lockedSections = normalizedSections.filter((section) => section.locked);
  const flexibleSections = normalizedSections.filter((section) => !section.locked);
  const lockedPrompt = lockedSections.map((section) => section.text).join('\n\n');
  if (!flexibleSections.length) {
    return trimProviderPromptForServer(lockedPrompt || fullPrompt, serverId);
  }

  const separatorBudget = Math.max(0, (normalizedSections.length - 1) * 2);
  const flexibleBudget = maxLength - lockedPrompt.length - separatorBudget;
  if (flexibleBudget <= 0) {
    return trimProviderPromptForServer(lockedPrompt || fullPrompt, serverId);
  }

  const totalWeight = flexibleSections.reduce((sum, section) => sum + (section.weight || 1), 0);
  const flexibleByText = new Map<string, string>();
  let usedFlexibleBudget = 0;
  flexibleSections.forEach((section, index) => {
    const isLast = index === flexibleSections.length - 1;
    const remainingBudget = Math.max(0, flexibleBudget - usedFlexibleBudget);
    const weightedBudget = isLast
      ? remainingBudget
      : Math.max(120, Math.floor((flexibleBudget * (section.weight || 1)) / totalWeight));
    const sectionBudget = Math.min(section.text.length, Math.max(0, Math.min(weightedBudget, remainingBudget)));
    const trimmed = trimProviderSection(section.text, sectionBudget);
    flexibleByText.set(section.text, trimmed);
    usedFlexibleBudget += trimmed.length;
  });

  const budgetedPrompt = normalizedSections
    .map((section) => section.locked ? section.text : flexibleByText.get(section.text))
    .filter((value): value is string => Boolean(value))
    .join('\n\n');

  return trimProviderPromptForServer(budgetedPrompt, serverId);
};

const promptContainsAny = (promptText: string, terms: string[]) => {
  const normalized = promptText.toLowerCase();
  return terms.some((term) => normalized.includes(term));
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
      facePriorityMode: group.facePriorityMode === 'portrait_headshot'
        ? ('portrait_headshot' as const)
        : undefined,
      appearanceProfile: group.appearanceProfile && typeof group.appearanceProfile === 'object'
        ? {
            skinToneHex: typeof group.appearanceProfile.skinToneHex === 'string' ? group.appearanceProfile.skinToneHex : undefined,
            skinToneDescriptor: typeof group.appearanceProfile.skinToneDescriptor === 'string' ? group.appearanceProfile.skinToneDescriptor : undefined,
          }
        : undefined,
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
      references: sortCharacterReferences(group.references, group.facePriorityMode),
    }))
    .filter((group) => group.references.length > 0)
    .sort((a, b) => a.characterIndex - b.characterIndex);

  if (explicitGroups.length > 0) {
    return explicitGroups;
  }

  return buildFallbackCharacterReferenceGroups(payload);
};

const getCharacterVisionAnalysisMap = (payload: Pick<ImageGenerateRecipePayload, 'visionAnalysis'>) => {
  const entries = Array.isArray(payload.visionAnalysis?.characters) ? payload.visionAnalysis?.characters : [];
  return new Map(entries.map((entry) => [entry.characterIndex, entry]));
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
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'> & {
    modelId?: string | null;
  },
): ImageRenderReferenceEntry[] => {
  const buildCharacterEntry = (
    group: CharacterReferenceGroup,
    reference: CharacterReferenceSourceEntry,
    referenceIndex: number,
  ): ImageRenderReferenceEntry => {
    const kindLabel =
      reference.kind === 'body'
        ? 'BODY'
        : reference.kind === 'face_detail'
          ? 'FACE DETAIL LOCK'
        : reference.kind === 'face'
          ? 'FACE LOCK'
          : `REFERENCE ${referenceIndex + 1}`;
    const genderLabel = group.gender ? ` ${group.gender.toUpperCase()}` : '';
    return {
      role: 'character',
      source: reference.source,
      indexLabel: `CHARACTER ${group.characterIndex}${genderLabel} ${kindLabel}`,
      facePriorityMode: group.facePriorityMode === 'portrait_headshot' ? 'portrait_headshot' : undefined,
    };
  };

  const buildSampleEntry = (): ImageRenderReferenceEntry | null =>
    payload.sampleImage
      ? {
          role: 'sample',
          source: payload.sampleImage,
          indexLabel: 'SAMPLE IMAGE',
        }
      : null;

  const buildStyleEntry = (): ImageRenderReferenceEntry | null =>
    payload.styleImage
      ? {
          role: 'style',
          source: payload.styleImage,
          indexLabel: 'STYLE IMAGE',
        }
      : null;

  const characterGroups = getImageCharacterReferenceGroups(payload);
  const normalizedModelId = normalizeValue(payload.modelId);

  if (normalizedModelId === 'image-gpt-2') {
    const sampleEntry = buildSampleEntry();
    const styleEntry = buildStyleEntry();
    const bodyEntries = characterGroups
      .map((group) => {
        const bodyReference = group.references.find((reference) => reference.kind === 'body') || group.references[0];
        return bodyReference ? buildCharacterEntry(group, bodyReference, 0) : null;
      })
      .filter((entry): entry is ImageRenderReferenceEntry => Boolean(entry));
    const faceEntries = characterGroups
      .map((group) => {
        const faceReference =
          group.references.find((reference) => reference.kind === 'face_detail') ||
          group.references.find((reference) => reference.kind === 'face');
        return faceReference ? buildCharacterEntry(group, faceReference, 1) : null;
      })
      .filter((entry): entry is ImageRenderReferenceEntry => Boolean(entry));

    if (characterGroups.length <= 1) {
      return [
        ...bodyEntries.slice(0, 1),
        ...faceEntries.slice(0, 1),
        ...(sampleEntry ? [sampleEntry] : []),
        ...(styleEntry ? [styleEntry] : []),
      ].slice(0, 5);
    }

    if (characterGroups.length === 2) {
      if (sampleEntry) {
        return [
          sampleEntry,
          ...bodyEntries.slice(0, 2),
          ...(styleEntry ? [styleEntry] : []),
        ].slice(0, 5);
      }

      const characterPairs = characterGroups.flatMap((group) => {
        const bodyReference = group.references.find((reference) => reference.kind === 'body') || group.references[0];
        const faceReference =
          group.references.find((reference) => reference.kind === 'face_detail') ||
          group.references.find((reference) => reference.kind === 'face');
        return [
          bodyReference ? buildCharacterEntry(group, bodyReference, 0) : null,
          faceReference ? buildCharacterEntry(group, faceReference, 1) : null,
        ].filter((entry): entry is ImageRenderReferenceEntry => Boolean(entry));
      });
      return [
        ...characterPairs,
        ...(styleEntry ? [styleEntry] : []),
      ].slice(0, 5);
    }

    if (characterGroups.length === 3) {
      return [
        ...(sampleEntry ? [sampleEntry] : []),
        ...bodyEntries.slice(0, 3),
        ...(styleEntry ? [styleEntry] : []),
      ].slice(0, 5);
    }

    return [
      ...(sampleEntry ? [sampleEntry] : []),
      ...bodyEntries.slice(0, 4),
      ...(!sampleEntry && styleEntry ? [styleEntry] : []),
    ].slice(0, 5);
  }

  const entries: ImageRenderReferenceEntry[] = [];

  const sampleEntry = buildSampleEntry();
  if (sampleEntry) {
    entries.push(sampleEntry);
  }

  characterGroups.forEach((group) => {
    group.references.forEach((reference, referenceIndex) => {
      entries.push(buildCharacterEntry(group, reference, referenceIndex));
    });
  });

  const styleEntry = buildStyleEntry();
  if (styleEntry) {
    entries.push(styleEntry);
  }

  return entries;
};

export const getImageRenderReferenceSources = (
  payload: Pick<ImageGenerateRecipePayload, 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage'>,
) => getImageRenderReferenceEntries(payload).map((entry) => entry.source);

export const buildImageRoleContract = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage' | 'aspectRatio' | 'visionAnalysis'>,
): ImageRoleContract => {
  const renderEntries = getImageRenderReferenceEntries(payload);
  const characterGroups = getImageCharacterReferenceGroups(payload);
  const characterVisionMap = getCharacterVisionAnalysisMap(payload);
  const characterCount = Math.max(1, Math.floor(Number(payload.characterCount || characterGroups.length || 1)));
  const layeredSingleSubjectAllowed = allowsLayeredSingleSubjectComposition(payload);
  const shotType = resolveImageShotType(payload);
  const hasSample = Boolean(payload.sampleImage);
  const hasStyle = Boolean(payload.styleImage);
  const hasFaceLock = characterGroups.some((group) => group.references.some((reference) => reference.kind === 'face'));
  const hasPortraitPriorityFace = characterGroups.some((group) => group.facePriorityMode === 'portrait_headshot');
  const skinToneAnchors = characterGroups
    .map((group) => {
      const visionEntry = characterVisionMap.get(group.characterIndex);
      const hex = group.appearanceProfile?.skinToneHex?.trim();
      const descriptor = group.appearanceProfile?.skinToneDescriptor?.trim();
      const visionHex = visionEntry?.skinToneHexApprox?.trim();
      const visionDescriptor = visionEntry?.skinToneDescriptor?.trim();
      const resolvedHex = visionHex || hex;
      const resolvedDescriptor = visionDescriptor || descriptor;
      if (!resolvedHex && !resolvedDescriptor) {
        return '';
      }
      return `Character ${group.characterIndex} skin-tone anchor:${resolvedHex ? ` ${resolvedHex}` : ''}${resolvedDescriptor ? ` (${resolvedDescriptor})` : ''}. Match this complexion exactly.`;
    })
    .filter(Boolean);

  const characterVisionNotes = characterGroups
    .map((group) => {
      const visionEntry = characterVisionMap.get(group.characterIndex);
      if (!visionEntry) return '';
      const parts = [
        visionEntry.summary?.trim(),
        ...(visionEntry.faceIdentityNotes || []).slice(0, 2),
        ...(visionEntry.makeupNotes || []).slice(0, 2),
        ...(visionEntry.faceAccessoryNotes || []).slice(0, 2),
      ].filter(Boolean);
      if (parts.length === 0) return '';
      return `Character ${group.characterIndex} visual identity anchor: ${parts.join('; ')}.`;
    })
    .filter(Boolean);

  const identityRules = [
    `Render exactly ${characterCount} character(s) with strict one-to-one slot mapping.`,
    'Character references define identity only: face, hair, body structure, skin tone, outfit, shoes, accessories, tattoos, and gender.',
    'Preserve the uploaded skin tone exactly. Do not warm it, tan it, yellow it, orange it, or shift it to a different complexion.',
    'For non-portrait shots, BODY references are the primary source for full-body complexion, limb anatomy, and overall body proportions. FACE LOCK references refine facial identity only.',
    ...skinToneAnchors,
    ...characterVisionNotes,
    'Preserve believable adult-proportioned anatomy from the uploaded character references. Keep the neck, shoulders, torso, arms, hands, hips, and legs natural instead of rigid or mannequin-like.',
    'Character references are never pose references.',
    hasFaceLock
      ? 'Face-detail locks, when present, have the highest priority for makeup, eyelashes, eye shape, eyebrow shape, nose shape, lip shape, face accessories, facial decals, and micro facial likeness. Face-lock references then define the overall face, head shape, hairline, bangs, glasses, and facial likeness. Both override body/sample/style conflicts for the face.'
      : 'When only body references are present, preserve the uploaded identity exactly without inventing a new face.',
    hasPortraitPriorityFace
      ? 'Portrait/headshot priority mode is active for one or more uploaded characters. In those slots, BODY references may inform only hairstyle mass, outfit, accessories, and visible upper-body silhouette. BODY references must never override any eye shape, nose shape, lip shape, makeup, face accessory, facial proportion, or micro facial likeness from FACE DETAIL LOCK or FACE LOCK.'
      : '',
    layeredSingleSubjectAllowed
      ? 'Layered echoes of the same uploaded character are allowed only when the prompt explicitly requests a double-exposure or ghost-overlay effect.'
      : 'Never add, remove, duplicate, or blend subjects.',
  ].filter(Boolean);

  const compositionRules = hasSample
    ? [
        'Sample image is the primary scene plate. Preserve the sample scene, background, furniture, props, object layout, contact points, camera angle, framing, and spatial composition exactly.',
        'Replace only the sample person with the uploaded character identity. Keep the sample pose, body orientation, chair/ground contact, hand placement, occlusion pattern, and scene interaction as closely as possible.',
        'Never borrow face identity, hair identity, outfit identity, makeup identity, or realism from the sample person.',
        'If identity conflicts with sample composition, keep identity from character references but still preserve the sample scene plate and pose. Repair only broken or ambiguous anatomy; do not redesign the composition.',
      ]
    : [
        'User prompt is the primary composition source because no sample image is present.',
        'Infer pose, framing, camera angle, scene action, and background from the merged prompt text.',
        'Do not fall back to a plain standing portrait unless the prompt explicitly asks for it.',
      ];

  const sampleVision = payload.visionAnalysis?.sample;
  if (sampleVision) {
    const sampleSignals = [
      sampleVision.pose ? `pose: ${sampleVision.pose}` : '',
      sampleVision.camera ? `camera: ${sampleVision.camera}` : '',
      sampleVision.framing ? `framing: ${sampleVision.framing}` : '',
      sampleVision.subjectPlacement ? `placement: ${sampleVision.subjectPlacement}` : '',
      sampleVision.background ? `background: ${sampleVision.background}` : '',
      sampleVision.limbLayout ? `limbs: ${sampleVision.limbLayout}` : '',
      sampleVision.supportContact ? `support/contact: ${sampleVision.supportContact}` : '',
      sampleVision.occlusionNotes ? `occlusion: ${sampleVision.occlusionNotes}` : '',
    ].filter(Boolean);
    if (sampleSignals.length > 0) {
      compositionRules.push(`Sample composition anchor: ${sampleSignals.join('; ')}.`);
    }
  }

  if (shotType === 'close_up') {
    identityRules.push('Close-up shot weighting is active. Facial detail, makeup, eye rendering, lip shape, and face accessories are top priority for the final image.');
    compositionRules.push('Close-up framing is intentional. Do not widen the camera to reveal unnecessary body area.');
  } else if (shotType === 'full_body') {
    identityRules.push('Full-body shot weighting is active. Keep facial identity accurate, but do not overfreeze the face into a doll-like mask.');
    compositionRules.push('Full-body framing is intentional. Preserve clean full-body silhouette, natural limb placement, and believable body flow from pose to feet.');
  } else {
    identityRules.push('Half-body shot weighting is active. Balance facial accuracy with natural upper-body flow and soft render transitions.');
  }

  const styleRules = hasStyle
    ? [
        'Style image controls render language only: quality, lighting, materials, restrained color grading, and final finish.',
        'Style image must never override identity, skin tone, facial proportions, anatomy, outfit, subject count, pose, or composition.',
      ]
    : [
        'Without a style image, keep the final output as a clean stylized 3D game-avatar render driven by the prompt and identity references.',
      ];

  const styleVision = payload.visionAnalysis?.style;
  if (styleVision) {
    const styleSignals = [
      styleVision.renderStyle ? `render style: ${styleVision.renderStyle}` : '',
      styleVision.materialStyle ? `materials: ${styleVision.materialStyle}` : '',
      styleVision.lightingStyle ? `lighting: ${styleVision.lightingStyle}` : '',
      styleVision.colorGrading ? `color grade: ${styleVision.colorGrading}` : '',
      styleVision.finish ? `finish: ${styleVision.finish}` : '',
    ].filter(Boolean);
    if (styleSignals.length > 0) {
      styleRules.push(`Style visual anchor: ${styleSignals.join('; ')}.`);
    }
  }

  return {
    characterCount,
    layeredSingleSubjectAllowed,
    shotType,
    renderEntries,
    layers: [
      {
        name: 'identity',
        priority: 1,
        title: 'IDENTITY LAYER',
        summary: 'Identity comes only from uploaded character references.',
        rules: identityRules,
      },
      {
        name: 'composition',
        priority: 2,
        title: 'COMPOSITION LAYER',
        summary: hasSample
          ? 'Composition comes from the sample image.'
          : 'Composition comes from the merged prompt text.',
        rules: compositionRules,
      },
      {
        name: 'style',
        priority: 3,
        title: 'STYLE LAYER',
        summary: hasStyle
          ? 'Style comes from the style reference only.'
          : 'Style falls back to the built-in stylized 3D render direction.',
        rules: styleRules,
      },
    ],
    globalRules: [
      'Never output a split-screen, image grid, collage, storyboard, or panel layout.',
      'Never return an uploaded reference nearly unchanged as the final output.',
      'Keep the final result as a stylized 3D game avatar, not a photorealistic human.',
    ],
  };
};

export const buildImageRoleContractText = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage' | 'aspectRatio'>,
) => {
  const contract = buildImageRoleContract(payload);
  const referenceLines = contract.renderEntries.length > 0
    ? contract.renderEntries.map((entry, index) => {
        const number = index + 1;
        switch (entry.role) {
          case 'character':
            return entry.indexLabel.includes('FACE DETAIL LOCK')
              ? `- Image ${number}: ${entry.indexLabel}. Identity only, highest-priority facial detail lock for makeup, eyelashes, eye shape, nose shape, lip shape, face accessories, and micro facial likeness.${entry.facePriorityMode === 'portrait_headshot' ? ' Portrait/headshot priority mode is active for this slot.' : ''} Never pose.`
              : entry.indexLabel.includes('FACE LOCK')
              ? `- Image ${number}: ${entry.indexLabel}. Identity only, high-priority overall face lock.${entry.facePriorityMode === 'portrait_headshot' ? ' Portrait/headshot priority mode is active for this slot.' : ''} Never pose.`
              : `- Image ${number}: ${entry.indexLabel}. Identity only,${entry.facePriorityMode === 'portrait_headshot' ? ' portrait/headshot priority slot: use this mainly for hair, outfit, accessories, and upper-body silhouette, never to redefine the face,' : ''} never pose.`;
          case 'sample':
            return `- Image ${number}: ${entry.indexLabel}. Primary scene plate. Preserve the full sample background and composition exactly; replace only the sample person with the uploaded character identity.`;
          case 'style':
            return `- Image ${number}: ${entry.indexLabel}. Style only, never identity or composition.`;
          default:
            return `- Image ${number}: ${entry.indexLabel}.`;
        }
      })
    : ['- No direct reference images are available.'];

  return [
    'ROLE CONTRACT:',
    ...contract.layers.flatMap((layer) => [
      `${layer.title} (priority ${layer.priority})`,
      `- ${layer.summary}`,
      ...layer.rules.map((rule) => `- ${rule}`),
    ]),
    'REFERENCE ORDER:',
    ...referenceLines,
    'GLOBAL RULES:',
    ...contract.globalRules.map((rule) => `- ${rule}`),
  ].join('\n');
};

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
        return `- Image ${number}: ${entry.indexLabel}. This is the PRIMARY scene plate and highest-priority composition anchor. Preserve the sample background, environment, furniture, props, lighting placement, object positions, chair/ground contact, body orientation, framing, camera angle, and overall scene layout as closely as possible to the sample. Replace only the sample person with the uploaded character identity. Do not copy the sample person's face, hair identity, outfit identity, makeup identity, or realism. If the sample pose is partially occluded or anatomically ambiguous, repair the limbs into one natural coherent body while keeping the same visible pose intent and same scene layout. Never collapse this into an empty backdrop or a default studio render.`;
      case 'character':
        return entry.indexLabel.includes('FACE DETAIL LOCK')
          ? `- Image ${number}: ${entry.indexLabel}. This is the highest-priority micro face anchor. Copy exact eye shape, eyelash styling, eyebrow shape, nose shape, lip shape, makeup placement, blush placement, freckles, beauty marks, face jewelry, face decals, and all fine facial likeness cues from this image. Override any conflicting face detail from SAMPLE IMAGE, STYLE IMAGE, BODY references, or prompt phrasing.${entry.facePriorityMode === 'portrait_headshot' ? ' Portrait/headshot priority mode is active: this image must dominate the full facial outcome for this slot.' : ''}`
          : entry.indexLabel.includes('FACE LOCK')
          ? `- Image ${number}: ${entry.indexLabel}. This is the high-priority overall face identity anchor. Copy exact eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, facial proportions, and facial likeness from this image. Use it to lock the face, not to recolor the full body. Override any conflicting face information from SAMPLE IMAGE, STYLE IMAGE, BODY references, or prompt phrasing.${entry.facePriorityMode === 'portrait_headshot' ? ' Portrait/headshot priority mode is active: use BODY only as a secondary support source for non-face identity.' : ''}`
          : `- Image ${number}: ${entry.indexLabel}. Copy identity only: face, hair, head shape, full-body skin tone, body structure, outfit, shoes, accessories, and tattoos. This is the primary anchor for complexion and anatomy across the whole character. Preserve the uploaded complexion exactly and keep adult-proportioned anatomy.${entry.facePriorityMode === 'portrait_headshot' ? ' Portrait/headshot priority mode is active: this BODY image may inform only hairstyle mass, outfit, accessories, and visible upper-body silhouette. It must never redefine eye shape, nose shape, lip shape, makeup, facial proportions, or facial accessories.' : ''} This image is NOT a pose reference. Ignore its current standing pose, limb placement, framing, and background.`;
      case 'style':
        return `- Image ${number}: ${entry.indexLabel}. Copy only render language: render quality, shader behavior, lighting response, material quality, restrained color grading, and final finish. Do not copy pose, outfit, hairstyle, identity, skin tone, anatomy, gender, character count, or composition.`;
      default:
        return `- Image ${number}: Direct reference image.`;
    }
  });

  return [
    'DIRECT VISUAL REFERENCE ORDER (the renderer receives these reference images in this exact order):',
    ...roleLines,
    hasSample
      ? '- COMPOSITION PRIORITY: SAMPLE IMAGE first and dominant. Recreate the sample scene plate and replace only the subject identity. PRIMARY COMMAND PROMPT may add only secondary details that do not change the sample scene, pose, framing, or prop layout.'
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
      ? '- If CHARACTER REFERENCES conflict with the SAMPLE IMAGE, keep identity/outfit from CHARACTER REFERENCES but preserve the SAMPLE IMAGE scene plate, background, prop layout, and pose. Replace the sample person only.'
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
        return entry.indexLabel.includes('FACE DETAIL LOCK')
          ? `- Image ${number}: ${entry.indexLabel}. Highest-priority face detail only: eye shape, eyelashes, eyebrows, nose shape, lip shape, makeup placement, face accessories, facial decals, and micro facial likeness.${entry.facePriorityMode === 'portrait_headshot' ? ' Portrait/headshot priority mode is active for this slot.' : ''}`
          : entry.indexLabel.includes('FACE LOCK')
          ? `- Image ${number}: ${entry.indexLabel}. High-priority overall face identity only: eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, and facial likeness.${entry.facePriorityMode === 'portrait_headshot' ? ' Portrait/headshot priority mode is active for this slot.' : ''}`
          : `- Image ${number}: ${entry.indexLabel}. Identity only: face, hair, full-body skin tone, body structure, outfit, shoes, accessories, and tattoos. This is the primary complexion and anatomy anchor. Preserve the uploaded complexion exactly and keep adult-proportioned anatomy.${entry.facePriorityMode === 'portrait_headshot' ? ' Portrait/headshot priority slot: use BODY only as a secondary support source for non-face identity.' : ''} This image is NOT a pose reference.`;
      case 'style':
        return `- Image ${number}: ${entry.indexLabel}. Render language only: lighting, material response, restrained color grading, and final 3D finish.`;
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
        return entry.indexLabel.includes('FACE DETAIL LOCK')
          ? `- Image ${number} = ${entry.indexLabel}: highest-priority face detail identity only${entry.facePriorityMode === 'portrait_headshot' ? ', portrait/headshot priority active' : ''}, never pose.`
          : entry.indexLabel.includes('FACE LOCK')
          ? `- Image ${number} = ${entry.indexLabel}: high-priority overall face identity only${entry.facePriorityMode === 'portrait_headshot' ? ', portrait/headshot priority active' : ''}, never pose.`
          : `- Image ${number} = ${entry.indexLabel}: identity only${entry.facePriorityMode === 'portrait_headshot' ? ', portrait/headshot slot so body is secondary for non-face identity only' : ''}, never pose.`;
      case 'sample':
        return `- Image ${number} = ${entry.indexLabel}: composition only, never face identity, never outfit identity, never final output.`;
      case 'style':
        return `- Image ${number} = ${entry.indexLabel}: render style only, never pose, identity, outfit, or composition.`;
      default:
        return `- Image ${number} = ${entry.indexLabel}.`;
    }
  }).join('\n');
};

const normalizeVisionTags = (tags?: string[] | null, limit = 4) =>
  (Array.isArray(tags) ? tags : [])
    .map((entry) => collapsePromptWhitespace(entry))
    .filter(Boolean)
    .slice(0, limit);

const sanitizeProProviderText = (value: string) =>
  collapsePromptWhitespace(value)
    .replace(/\bholding\s+(?:a\s+)?cigarette\b/gi, 'one hand raised with a small handheld prop')
    .replace(/\bcigarette\b/gi, 'small handheld prop')
    .replace(/\bsmoking\b/gi, 'holding a small prop')
    .replace(/\bexplosion\b/gi, 'dramatic bright background effect')
    .replace(/\bfire\b/gi, 'warm bright background light')
    .replace(/\bflames?\b/gi, 'warm bright background lights')
    .replace(/\bsmoke\b/gi, 'soft haze');

const sanitizeGptImage2ProviderText = (value: string) =>
  collapsePromptWhitespace(value)
    .replace(/\bInstagram\b/gi, 'social media')
    .replace(/\bSNS\b/gi, 'social network')
    .replace(/\bDark\s+Love\s+Alice\s+Dreamland\b/gi, 'dark romantic fantasy dreamland')
    .replace(/\bAlice\s+Dreamland\b/gi, 'storybook fantasy dreamland')
    .replace(/\bAlice\b/gi, 'storybook heroine')
    .replace(/\bBlack\s+Panther\b/gi, 'dark feline emblem')
    .replace(/\bBlack\s+Lion\b/gi, 'dark lion emblem');

const normalizeProVisionTags = (tags?: string[] | null, limit = 4) =>
  normalizeVisionTags(tags, limit)
    .map((entry) => sanitizeProProviderText(entry))
    .filter(Boolean);

const safeJsonParse = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeDirectorJsonList = (value: unknown, limit = 8) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => collapsePromptWhitespace(typeof entry === 'string' ? entry : ''))
    .filter(Boolean)
    .slice(0, limit);

const renderDirectorSpecForProvider = (synthesizedPrompt?: string | null) => {
  const normalized = collapsePromptWhitespace(synthesizedPrompt || '');
  if (!normalized) {
    return 'No director synthesis available.';
  }

  const parsed = safeJsonParse(normalized);
  if (!parsed || typeof parsed !== 'object') {
    return normalized;
  }

  const systemPrompt = collapsePromptWhitespace((parsed as any).system_prompt_en || '');
  const userPrompt = collapsePromptWhitespace((parsed as any).user_prompt_en || '');
  const mergedPrompt = collapsePromptWhitespace((parsed as any).merged_prompt_en || '');
  const identityRules = normalizeDirectorJsonList((parsed as any).identity_rules);
  const compositionRules = normalizeDirectorJsonList((parsed as any).composition_rules);
  const styleRules = normalizeDirectorJsonList((parsed as any).style_rules);
  const mustKeep = normalizeDirectorJsonList((parsed as any).must_keep);
  const mustAvoid = normalizeDirectorJsonList((parsed as any).must_avoid);
  const negativeConstraints = collapsePromptWhitespace((parsed as any).negative_constraints_en || '');

  const sections = [
    systemPrompt ? `system=${systemPrompt}` : null,
    userPrompt ? `user=${userPrompt}` : null,
    mergedPrompt ? `merged=${mergedPrompt}` : null,
    identityRules.length ? `identity_rules=${identityRules.join(' | ')}` : null,
    compositionRules.length ? `composition_rules=${compositionRules.join(' | ')}` : null,
    styleRules.length ? `style_rules=${styleRules.join(' | ')}` : null,
    mustKeep.length ? `must_keep=${mustKeep.join(' | ')}` : null,
    mustAvoid.length ? `must_avoid=${mustAvoid.join(' | ')}` : null,
    negativeConstraints ? `negative_constraints=${negativeConstraints}` : null,
  ].filter(Boolean);

  return sections.join('\n');
};

const buildProCharacterVisionLine = (
  payload: Pick<ImageGenerateRecipePayload, 'visionAnalysis' | 'characterReferenceGroups' | 'characterImages' | 'characterCount'>,
  characterIndex: number,
) => {
  const entry = getCharacterVisionAnalysisMap(payload).get(characterIndex);
  const group = getImageCharacterReferenceGroups(payload).find((candidate) => candidate.characterIndex === characterIndex);
  if (!entry && !group?.appearanceProfile) return null;

  const segments = [
    entry?.skinToneHexApprox || group?.appearanceProfile?.skinToneHex
      ? `skin_hex=${entry?.skinToneHexApprox || group?.appearanceProfile?.skinToneHex}`
      : null,
    entry?.skinToneDescriptor || group?.appearanceProfile?.skinToneDescriptor
      ? `skin=${entry?.skinToneDescriptor || group?.appearanceProfile?.skinToneDescriptor}`
      : null,
    normalizeProVisionTags(entry?.proIdentityTags).length > 0 ? `identity_tags=${normalizeProVisionTags(entry?.proIdentityTags).join(' | ')}` : null,
    normalizeProVisionTags(entry?.proFaceTags).length > 0 ? `face_tags=${normalizeProVisionTags(entry?.proFaceTags).join(' | ')}` : null,
    normalizeProVisionTags(entry?.proAppearanceTags).length > 0 ? `appearance_tags=${normalizeProVisionTags(entry?.proAppearanceTags).join(' | ')}` : null,
  ].filter(Boolean);

  return segments.length > 0 ? `- character_${characterIndex}: ${segments.join('; ')}` : null;
};

const buildProSampleVisionLine = (
  payload: Pick<ImageGenerateRecipePayload, 'visionAnalysis'>,
) => {
  const sample = payload.visionAnalysis?.sample;
  if (!sample) return null;

  const segments = [
    normalizeProVisionTags(sample.proPoseTags).length > 0 ? `pose_tags=${normalizeProVisionTags(sample.proPoseTags).join(' | ')}` : null,
    normalizeProVisionTags(sample.proContactTags).length > 0 ? `contact_tags=${normalizeProVisionTags(sample.proContactTags).join(' | ')}` : null,
  ].filter(Boolean);

  return segments.length > 0 ? `- sample_scene: ${segments.join('; ')}` : null;
};

const buildProStyleVisionLine = (
  payload: Pick<ImageGenerateRecipePayload, 'visionAnalysis'>,
) => {
  const style = payload.visionAnalysis?.style;
  if (!style) return null;

  const segments = [
    normalizeProVisionTags(style.proStyleTags).length > 0 ? `style_tags=${normalizeProVisionTags(style.proStyleTags).join(' | ')}` : null,
    normalizeProVisionTags(style.proMaterialTags).length > 0 ? `material_tags=${normalizeProVisionTags(style.proMaterialTags).join(' | ')}` : null,
    normalizeProVisionTags(style.proLightingTags).length > 0 ? `lighting_tags=${normalizeProVisionTags(style.proLightingTags).join(' | ')}` : null,
  ].filter(Boolean);

  return segments.length > 0 ? `- style_render: ${segments.join('; ')}` : null;
};

const buildProWeightedReferencePlan = (
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'aspectRatio'>,
) => {
  const weights = buildImageRoleWeights(payload);
  const groups = getImageCharacterReferenceGroups(payload);
  const faceModeActive = groups.some((group) => group.facePriorityMode === 'portrait_headshot');

  return [
    'PRO STRUCTURED WEIGHT PLAN:',
    `- sample_composition_weight=${formatWeight(weights.sampleComposition)}`,
    `- sample_background_weight=${formatWeight(weights.sampleBackground)}`,
    `- character_body_identity_weight=${formatWeight(weights.characterBodyIdentity)}`,
    `- character_face_identity_weight=${formatWeight(weights.characterFaceIdentity)}`,
    `- character_face_detail_weight=${formatWeight(weights.characterFaceDetail)}`,
    `- style_render_weight=${formatWeight(weights.styleRender)}`,
    faceModeActive
      ? '- portrait_face_priority=enabled_for_prompt_requested_close_face_shots_only'
      : '- portrait_face_priority=disabled_for_general_shots',
  ].join('\n');
};

const buildProStructuredProviderPrompt = (
  synthesizedPrompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'modelId' | 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage' | 'aspectRatio' | 'visionAnalysis' | 'serverId'>,
  mergedNegativePrompt: string,
) => {
  const roleContract = buildImageRoleContract(payload);
  const normalizedSynthesizedPrompt = sanitizeProProviderText(renderDirectorSpecForProvider(
    synthesizedPrompt?.trim() || getPrimaryUserRequestText(payload),
  ));
  const characterCount = Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)));
  const compactNegativePrompt = trimPromptText(mergedNegativePrompt, MAX_NEGATIVE_PROMPT_LENGTH);
  const weightedPlan = buildProWeightedReferencePlan(payload);
  const structuredVisionLines = [
    ...getImageCharacterReferenceGroups(payload)
      .map((group) => buildProCharacterVisionLine(payload, group.characterIndex))
      .filter((value): value is string => Boolean(value)),
    buildProSampleVisionLine(payload),
    buildProStyleVisionLine(payload),
  ].filter((value): value is string => Boolean(value));

  return buildProviderPromptWithinServerBudget([
    { locked: true, text: 'RENDER ONE NEW FINAL IMAGE. Never return any uploaded reference unchanged.' },
    { locked: true, text: `MODEL PATH: ${payload.modelId || 'unknown'}. Use structured weighting instead of averaging all references together.` },
    { locked: true, text: `CHARACTER COUNT: EXACTLY ${characterCount}. One-to-one slot mapping is mandatory.` },
    { locked: true, text: `SHOT TYPE: ${roleContract.shotType}` },
    { locked: true, text: weightedPlan },
    {
      locked: true,
      text: payload.sampleImage
        ? 'SCENE PLATE RULE: SAMPLE IMAGE is the primary scene plate. Preserve the full sample background, furniture, props, camera angle, framing, object layout, contact points, and subject orientation. Replace only the sample person with the uploaded character identity.'
        : 'SCENE PLATE RULE: No sample image is present, so derive composition from the primary user request.',
    },
    { locked: true, text: 'IDENTITY RULE: CHARACTER REFERENCES define the final avatar identity. BODY references define outfit, skin tone, body proportions, and full-body anatomy. FACE LOCK references refine face identity. FACE DETAIL LOCK references refine makeup and micro facial features, but only as strongly as the shot weighting allows.' },
    { locked: true, text: 'STYLE RULE: STYLE IMAGE influences only render quality, material response, lighting feel, restrained color grading, and final finish. STYLE IMAGE must never override pose, background, outfit, or identity.' },
    { locked: true, text: 'CONFLICT RULE: When references disagree, keep SAMPLE for scene/pose/background, keep CHARACTER for identity/body/skin tone, and keep STYLE for render finish only.' },
    {
      weight: 2,
      text: structuredVisionLines.length > 0
        ? ['PRO STRUCTURED VISION FIELDS:', ...structuredVisionLines].join('\n')
        : 'PRO STRUCTURED VISION FIELDS:\n- unavailable',
    },
    { weight: 3, text: `DIRECTOR JSON SPEC (authoritative, English):\n${normalizedSynthesizedPrompt || 'No director synthesis available.'}` },
    { locked: true, text: getShotAwareRenderProfile(roleContract.shotType) },
    { weight: 1, text: `QUALITY: ${IMAGE_QUALITY_BOOSTERS}` },
    { locked: true, text: 'SOFTNESS RULE: prioritize soft beauty shading, natural material transitions, controlled highlights, softer facial planes, and non-plastic skin response. Avoid toy-like rigidity, glossy mannequin sheen, or stiff body flow.' },
    { locked: true, text: 'SKIN TONE LOCK: match the uploaded character complexion exactly.' },
    { locked: true, text: 'ANATOMY GUARD: keep one coherent natural body with no extra limbs.' },
    { weight: 1, text: `NEGATIVE: ${compactNegativePrompt}` },
  ], payload.serverId, sanitizeProProviderText);
};

const buildDetailedImageProviderPrompt = (
  synthesizedPrompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage' | 'aspectRatio' | 'serverId'>,
  mergedNegativePrompt: string,
) => {
  const roleContract = buildImageRoleContract(payload);
  const roleContractText = buildImageRoleContractText(payload);
  const originalUserPrompt = getPrimaryUserRequestText(payload);
  const normalizedSynthesizedPrompt = synthesizedPrompt?.trim() || originalUserPrompt;
  const layeredSingleSubjectAllowed = allowsLayeredSingleSubjectComposition(payload);
  const characterCount = Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)));
  const compactNegativePrompt = trimPromptText(mergedNegativePrompt, MAX_NEGATIVE_PROMPT_LENGTH);
  const shotAwareRenderProfile = getShotAwareRenderProfile(roleContract.shotType);

  return buildProviderPromptWithinServerBudget([
    { locked: true, text: 'RENDER ONE NEW FINAL IMAGE. Never return any uploaded reference unchanged.' },
    { locked: true, text: IMAGE_ROLE_LOCK_CONSTRAINTS },
    { locked: true, text: IMAGE_SKIN_TONE_LOCK_CONSTRAINTS },
    { locked: true, text: IMAGE_ANATOMY_GUARD_CONSTRAINTS },
    { locked: true, text: IMAGE_NECK_SHOULDER_PROPORTION_LOCK_CONSTRAINTS },
    { locked: true, text: `CHARACTER COUNT: EXACTLY ${characterCount}. One-to-one slot mapping is mandatory.` },
    { weight: 3, text: `PRIMARY USER REQUEST:\n${originalUserPrompt || 'No additional user prompt provided.'}` },
    { weight: 2, text: roleContractText },
    {
      locked: true,
      text: layeredSingleSubjectAllowed
        ? 'LAYERED SINGLE-SUBJECT EXCEPTION:\n- The user intentionally requests a double-exposure / ghost-overlay / superimposed-self composition.\n- Keep exactly one underlying uploaded character identity, but layered echoes of that SAME person are allowed when they are part of the requested artistic effect.\n- Do not invent a second distinct person.'
        : '',
    },
    { weight: 3, text: `DIRECTOR JSON SPEC (authoritative, English):\n${normalizedSynthesizedPrompt || 'No director synthesis available.'}` },
    { locked: true, text: `SHOT TYPE: ${roleContract.shotType}` },
    { locked: true, text: shotAwareRenderProfile },
    { weight: 1, text: `QUALITY: ${IMAGE_QUALITY_BOOSTERS}` },
    { weight: 1, text: `NEGATIVE: ${compactNegativePrompt}` },
  ], payload.serverId);
};

const buildReducedImageProviderPromptWithoutSample = (
  synthesizedPrompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'styleImage' | 'aspectRatio' | 'serverId'>,
  mergedNegativePrompt: string,
) => {
  const roleContract = buildImageRoleContract(payload);
  const roleContractText = buildImageRoleContractText(payload);
  const originalUserPrompt = getPrimaryUserRequestText(payload);
  const normalizedSynthesizedPrompt = synthesizedPrompt?.trim() || originalUserPrompt;
  const layeredSingleSubjectAllowed = allowsLayeredSingleSubjectComposition(payload);
  const characterCount = Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)));
  const compactNegativePrompt = trimPromptText(mergedNegativePrompt, MAX_NEGATIVE_PROMPT_LENGTH);
  const shotAwareRenderProfile = getShotAwareRenderProfile(roleContract.shotType);

  return buildProviderPromptWithinServerBudget([
    { locked: true, text: 'RENDER ONE NEW FINAL IMAGE. Never return any uploaded reference unchanged.' },
    { locked: true, text: REDUCED_IMAGE_ROLE_LOCK_CONSTRAINTS_NO_SAMPLE },
    { locked: true, text: IMAGE_SKIN_TONE_LOCK_CONSTRAINTS },
    { locked: true, text: IMAGE_ANATOMY_GUARD_CONSTRAINTS },
    { locked: true, text: IMAGE_NECK_SHOULDER_PROPORTION_LOCK_CONSTRAINTS },
    { locked: true, text: `CHARACTER COUNT: EXACTLY ${characterCount}. One-to-one slot mapping is mandatory.` },
    { weight: 3, text: `PRIMARY USER REQUEST:\n${originalUserPrompt || 'No additional user prompt provided.'}` },
    { weight: 2, text: roleContractText },
    {
      locked: true,
      text: layeredSingleSubjectAllowed
        ? 'LAYERED SINGLE-SUBJECT EXCEPTION:\n- Keep exactly one uploaded character identity.\n- Double exposure / ghost overlays / layered echoes of that SAME character are allowed.\n- Do not invent a second distinct person.'
        : '',
    },
    { weight: 3, text: `DIRECTOR JSON SPEC (authoritative, English):\n${normalizedSynthesizedPrompt || 'No director synthesis available.'}` },
    { locked: true, text: `SHOT TYPE: ${roleContract.shotType}` },
    { locked: true, text: shotAwareRenderProfile },
    { weight: 1, text: `QUALITY: ${IMAGE_QUALITY_BOOSTERS}` },
    { weight: 1, text: `NEGATIVE: ${compactNegativePrompt}` },
  ], payload.serverId);
};

const buildGptPromptFirstProviderPromptWithoutSample = (
  synthesizedPrompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'styleImage' | 'aspectRatio' | 'serverId'>,
  mergedNegativePrompt: string,
) => {
  const roleContract = buildImageRoleContract(payload);
  const roleContractText = buildImageRoleContractText(payload);
  const originalUserPrompt = getPrimaryUserRequestText(payload);
  const normalizedSynthesizedPrompt = synthesizedPrompt?.trim() || originalUserPrompt;
  const userPrompt = originalUserPrompt || normalizedSynthesizedPrompt || 'Create one new image from the uploaded references.';
  const characterCount = Math.max(1, Math.floor(Number(payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1)));
  const compactNegativePrompt = trimPromptText(mergedNegativePrompt, MAX_NEGATIVE_PROMPT_LENGTH);
  const userMentionsIdentity = promptContainsAny(userPrompt, [
    'face', 'identity', 'facial', 'skin tone', 'complexion', 'outfit', 'clothing',
    'khuon mat', 'khuôn mặt', 'mau da', 'màu da', 'trang phuc', 'trang phục',
    'giu nguyen', 'giữ nguyên', 'khong thay doi', 'không thay đổi',
  ]);
  const userMentionsAnatomy = promptContainsAny(userPrompt, [
    'anatomy', 'proportion', 'neck', 'shoulder', 'limb', 'hand', 'foot', 'body',
    'co ', 'cổ ', 'vai', 'tay', 'chan', 'chân', 'ti le', 'tỉ lệ', 'ty le', 'tỷ lệ',
  ]);
  const userMentionsQuality = promptContainsAny(userPrompt, [
    'quality', 'render', 'detail', 'sharp', 'natural', 'realistic', 'cinematic',
    'chat luong', 'chất lượng', 'sac net', 'sắc nét', 'tu nhien', 'tự nhiên',
  ]);
  const userMentionsNegative = promptContainsAny(userPrompt, [
    'avoid', 'do not', 'khong', 'không', 'tranh', 'tránh', 'negative',
  ]);
  const directorBackup = normalizedSynthesizedPrompt && normalizedSynthesizedPrompt !== userPrompt
    ? `DIRECTOR JSON BACKUP (lower priority, use only when it does not override the user prompt):\n${normalizedSynthesizedPrompt}`
    : '';

  const systemSectionCandidates: Array<ProviderPromptBudgetSection | null> = [
    { weight: 2, text: 'RENDER ONE NEW FINAL IMAGE. Never return any uploaded reference unchanged.' },
    { weight: 2, text: `IMAGE ROLES: uploaded subject image(s) are identity references. Keep them as the final subject identity, not as background or style.` },
    { weight: 2, text: `SUBJECT COUNT: EXACTLY ${characterCount}. One-to-one slot mapping is mandatory.` },
    !userMentionsIdentity ? { weight: 2, text: 'IDENTITY LOCK: preserve the uploaded character face structure, facial details, skin tone, outfit colors, hair, accessories, makeup, and game-fashion identity.' } : null,
    !userMentionsAnatomy ? { weight: 1, text: 'ANATOMY LOCK: preserve natural head-neck-shoulder proportions; do not elongate the neck; no extra limbs, duplicated hands, malformed fingers, or stiff doll posture.' } : null,
    { weight: 1, text: roleContractText },
    { weight: 1, text: `SHOT TYPE: ${roleContract.shotType}` },
    { weight: 1, text: getShotAwareRenderProfile(roleContract.shotType) },
    !userMentionsQuality ? { weight: 1, text: `QUALITY: ${IMAGE_QUALITY_BOOSTERS}` } : null,
    directorBackup ? { weight: 1, text: directorBackup } : null,
    !userMentionsNegative ? { weight: 1, text: `NEGATIVE: ${compactNegativePrompt}` } : null,
  ];
  const systemSections = systemSectionCandidates.filter((section): section is ProviderPromptBudgetSection => Boolean(section));

  return buildProviderPromptWithinServerBudget([
    { locked: true, text: `USER PROMPT - HIGHEST PRIORITY, keep this request intact:\n${userPrompt}` },
    ...systemSections,
  ], payload.serverId, sanitizeGptImage2ProviderText);
};

export const buildImageProviderPrompt = (
  synthesizedPrompt: string,
  payload: Pick<ImageGenerateRecipePayload, 'modelId' | 'prompt' | 'userPromptInput' | 'characterImages' | 'characterCount' | 'characterReferenceGroups' | 'sampleImage' | 'styleImage' | 'aspectRatio' | 'visionAnalysis' | 'serverId'>,
  customNegativePrompt?: string,
) => {
  const mergedNegativePrompt = dedupeCsvPromptTerms(IMAGE_NEGATIVE_PROMPT, customNegativePrompt);

  if (isProImageGenerationModel(payload.modelId)) {
    return buildProStructuredProviderPrompt(synthesizedPrompt, payload, mergedNegativePrompt);
  }

  if (payload.sampleImage) {
    return buildDetailedImageProviderPrompt(synthesizedPrompt, payload, mergedNegativePrompt);
  }

  if (normalizeValue(payload.modelId) === 'image-gpt-2') {
    return buildGptPromptFirstProviderPromptWithoutSample(synthesizedPrompt, payload, mergedNegativePrompt);
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
        quality: payload.quality,
        speed: payload.speed,
        server_id: payload.serverId,
      };
    case 'prompt_image_generate_recipe_v1':
      return {
        model: payload.modelId,
        resolution: getEffectiveImageGenerationResolution(payload.modelId, payload.speed, payload.resolution)?.toLowerCase(),
        aspect_ratio: payload.aspectRatio,
        quality: payload.quality,
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
