import {
  buildImageProviderPrompt,
  getImageDirectorSources,
  getEffectiveImageGenerationResolution,
  getImageRenderReferenceSources,
  type ImageGenerateRecipePayload,
  type QueueVertexDiagnosticEntry,
  type QueueRecipePayload,
} from '../../shared/queueRecipes';
import {
  rewriteUserPromptToFitLimit,
  synthesizeStrictImagePrompt,
} from './_vertex-director';

const TST_API_BASE = 'https://api.tramsangtao.com/v1';
export const TST_PROMPT_MAX_CHARACTERS = 10_000;
const PROMPT_REWRITE_SAFETY_MARGIN = 400;
const MIN_USER_PROMPT_REWRITE_CHARACTERS = 180;
const MAX_PROMPT_REWRITE_ATTEMPTS = 3;

const cleanBase64 = (value: string) => value.replace(/^data:[^;]+;base64,/, '');

const getTstApiKey = () => {
  const apiKey = process.env.TST_API_KEY;
  if (!apiKey) {
    throw new Error('Missing TST_API_KEY environment variable');
  }
  return apiKey;
};

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error || data?.detail?.error?.message || data?.detail || data?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const normalizeSourceToBlob = async (
  input: string,
  kind: 'image' | 'video',
  fallbackMimeType = kind === 'video' ? 'video/mp4' : 'image/jpeg',
) => {
  if (input.startsWith('http')) {
    const response = await fetch(input, { signal: AbortSignal.timeout(kind === 'video' ? 120000 : 30000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${kind} source: ${await parseErrorMessage(response)}`);
    }

    const blob = await response.blob();
    return {
      blob,
      mimeType: blob.type || fallbackMimeType,
      filename: kind === 'video' ? 'motion.mp4' : 'image.jpg',
    };
  }

  let mimeType = fallbackMimeType;
  let normalized = input;

  if (input.startsWith('data:')) {
    const [header, body] = input.split(',', 2);
    normalized = body || '';
    mimeType = header.match(/^data:(.*?);base64$/)?.[1] || fallbackMimeType;
  } else {
    normalized = cleanBase64(input);
  }

  const blob = new Blob([Buffer.from(normalized, 'base64')], { type: mimeType });
  const extension = mimeType.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg');

  return {
    blob,
    mimeType,
    filename: `${kind}.${extension}`,
  };
};

const uploadMediaToTst = async (
  input: string,
  kind: 'image' | 'video',
  fallbackMimeType?: string,
) => {
  const apiKey = getTstApiKey();
  const { blob, filename } = await normalizeSourceToBlob(input, kind, fallbackMimeType);
  const formData = new FormData();
  formData.append('file', blob, filename);

  const response = await fetch(
    kind === 'video' ? `${TST_API_BASE}/files/upload/video` : `${TST_API_BASE}/files/upload/image`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(kind === 'video' ? 180000 : 60000),
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  const url = data?.url || data?.data?.url;
  if (!url) {
    throw new Error(`Upload response missing URL: ${JSON.stringify(data)}`);
  }

  return String(url);
};

export const uploadImageToTst = async (input: string) => uploadMediaToTst(input, 'image');
export const uploadVideoToTst = async (input: string, fallbackMimeType?: string) =>
  uploadMediaToTst(input, 'video', fallbackMimeType);

const isRecoverablePromptSynthesisError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();

  return (
    message.includes('resource has been exhausted') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('overloaded') ||
    message.includes('deadline exceeded') ||
    message.includes('failed to initialize vertex ai credentials') ||
    message.includes('vertex ai returned no prompt text for image prompt synthesis') ||
    message.includes('vertex ai returned an empty prompt synthesis payload') ||
    message.includes('vertex ai did not return a valid json object for prompt synthesis') ||
    message.includes('vertex ai prompt synthesis json must be an object')
  );
};

const buildFallbackSynthesizedPrompt = (payload: ImageGenerateRecipePayload) => {
  const combinedPrompt = payload.prompt?.trim() || '';
  const systemPromptPrefix = payload.systemPromptPrefix?.trim() || '';
  const userPrompt = payload.userPromptInput?.trim() || combinedPrompt;
  const stylePrompt = payload.stylePrompt?.trim() || '';
  const hasSample = Boolean(payload.sampleImage);
  const characterCount = Math.max(1, Math.floor(Number(payload.characterCount || 0)) || (payload.characterReferenceGroups?.length || 0) || 1);
  return JSON.stringify({
    language: 'en',
    system_prompt_en: systemPromptPrefix,
    user_prompt_en: userPrompt,
    merged_prompt_en: combinedPrompt || `${systemPromptPrefix} ${userPrompt}`.trim() || 'Generate the image using the provided references exactly.',
    character_count: characterCount,
    identity_rules: [
      `Render exactly ${characterCount} character(s). Never add or remove subjects.`,
      'Each uploaded character slot is mandatory and must appear exactly once.',
      'Character references define identity only: face, hair, body structure, skin tone, outfit, shoes, accessories, and gender.',
      'If multiple reference images belong to the same character slot, they describe the same subject and must be merged into one identity.',
    ],
    face_lock_rules: [
      'If face-lock references are present, they are the highest-priority source for the final face.',
      'Never let sample, style, or body references override the final facial identity.',
    ],
    composition_rules: [
      hasSample
        ? 'Sample image controls pose, framing, camera angle, spacing, and background only.'
        : 'No sample image is present, so composition must come from the merged prompt text.',
      hasSample
        ? 'Never copy facial identity, outfit identity, or realism from the sample image.'
        : 'Do not default to a plain black standing portrait unless explicitly requested.',
    ],
    scene_rules: combinedPrompt ? [combinedPrompt] : ['Generate the image using the provided references exactly.'],
    style_rules: stylePrompt ? [stylePrompt] : [],
    camera_rules: hasSample
      ? ['Re-pose the final character into the sample composition exactly.']
      : ['Infer camera and framing from the merged prompt text.'],
    must_keep: [
      'Stylized 3D game-avatar topology.',
      'One-to-one slot preservation.',
    ],
    must_avoid: [
      'Extra characters.',
      'Identity blending.',
      'Split-screen or collage layouts.',
      'Photorealistic humanization.',
    ],
    negative_constraints_en: (payload.negativePrompt || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  });
};

type VertexPromptPreparationOptions = {
  onVertexDiagnostic?: (entry: QueueVertexDiagnosticEntry) => Promise<void> | void;
};

export const synthesizeImageGeneratePrompt = async (
  payload: ImageGenerateRecipePayload,
  options?: VertexPromptPreparationOptions,
) => {
  try {
    return await synthesizeStrictImagePrompt(payload, {
      onDiagnostic: options?.onVertexDiagnostic,
    });
  } catch (error) {
    if (!isRecoverablePromptSynthesisError(error)) {
      throw error;
    }

    if (options?.onVertexDiagnostic) {
      await options.onVertexDiagnostic({
        at: new Date().toISOString(),
        task: 'image_prompt_synthesis',
        status: 'warning',
        model: 'gemini-3.1-pro-preview',
        message: 'Vertex prompt synthesis fell back to the local JSON prompt builder.',
      });
    }

    console.warn('[queue-recipes] Vertex prompt synthesis unavailable, falling back to base prompt:', error);
    return buildFallbackSynthesizedPrompt(payload);
  }
};

export const buildImageGenerateProviderPayload = (
  payload: ImageGenerateRecipePayload,
  uploadedUrls: string[],
  synthesizedPrompt: string,
  providerPromptOverride?: string,
) => {
  const effectiveResolution = getEffectiveImageGenerationResolution(
    payload.modelId,
    payload.speed,
    payload.resolution,
  );

  const providerPayload: Record<string, unknown> = {
    prompt: providerPromptOverride || buildImageProviderPrompt(synthesizedPrompt, payload, payload.negativePrompt),
    model: payload.modelId,
  };

  if (uploadedUrls.length > 0) providerPayload.img_url = uploadedUrls;
  if (effectiveResolution) providerPayload.resolution = effectiveResolution.toLowerCase();
  if (payload.aspectRatio) providerPayload.aspect_ratio = payload.aspectRatio;
  if (payload.speed) providerPayload.speed = payload.speed;
  if (payload.serverId) providerPayload.server_id = payload.serverId;

  return providerPayload;
};

const normalizePromptWhitespace = (value?: string | null) => String(value || '').replace(/\s+/g, ' ').trim();

const combineImageGeneratePrompt = (systemPromptPrefix: string, userPromptInput: string) =>
  `${systemPromptPrefix}${userPromptInput}`.trim();

const prepareDirectPromptWithinLimit = async (
  prompt: string,
  pipelineLabel: string,
) => {
  const normalizedPrompt = normalizePromptWhitespace(prompt);
  if (!normalizedPrompt) {
    return '';
  }

  if (normalizedPrompt.length <= TST_PROMPT_MAX_CHARACTERS) {
    return normalizedPrompt;
  }

  let sourcePromptForRewrite = normalizedPrompt;

  for (let attempt = 1; attempt <= MAX_PROMPT_REWRITE_ATTEMPTS; attempt += 1) {
    const overflow = sourcePromptForRewrite.length - TST_PROMPT_MAX_CHARACTERS;
    const targetCharacters = Math.max(
      MIN_USER_PROMPT_REWRITE_CHARACTERS,
      sourcePromptForRewrite.length - overflow - PROMPT_REWRITE_SAFETY_MARGIN,
    );
    const rewrittenPrompt = normalizePromptWhitespace(
      await rewriteUserPromptToFitLimit(normalizedPrompt, targetCharacters, pipelineLabel),
    );

    if (!rewrittenPrompt) {
      break;
    }

    if (rewrittenPrompt.length <= TST_PROMPT_MAX_CHARACTERS) {
      return rewrittenPrompt;
    }

    sourcePromptForRewrite = rewrittenPrompt;
  }

  throw new Error(
    `Tong prompt gui sang provider van vuot ${TST_PROMPT_MAX_CHARACTERS} ky tu sau khi rut gon. Vui long rut ngan prompt va thu lai.`,
  );
};

export type ImageGeneratePromptPreparation = {
  optimizedPayload: ImageGenerateRecipePayload;
  synthesizedPrompt: string;
  providerPrompt: string;
};

export const prepareImageGeneratePromptWithinLimit = async (
  payload: ImageGenerateRecipePayload,
  options?: VertexPromptPreparationOptions,
): Promise<ImageGeneratePromptPreparation> => {
  let workingPayload: ImageGenerateRecipePayload = { ...payload };
  let synthesizedPrompt = await synthesizeImageGeneratePrompt(workingPayload, options);
  let providerPrompt = buildImageProviderPrompt(synthesizedPrompt, workingPayload, workingPayload.negativePrompt);

  if (providerPrompt.length <= TST_PROMPT_MAX_CHARACTERS) {
    return {
      optimizedPayload: workingPayload,
      synthesizedPrompt,
      providerPrompt,
    };
  }

  const originalUserPromptInput = normalizePromptWhitespace(workingPayload.userPromptInput || workingPayload.prompt);
  const systemPromptPrefix = typeof workingPayload.systemPromptPrefix === 'string'
    ? workingPayload.systemPromptPrefix
    : '';

  if (!originalUserPromptInput) {
    throw new Error(`Provider prompt vuot ${TST_PROMPT_MAX_CHARACTERS} ky tu va khong co noi dung prompt nguoi dung de rut gon.`);
  }

  let sourcePromptForRewrite = originalUserPromptInput;

  for (let attempt = 1; attempt <= MAX_PROMPT_REWRITE_ATTEMPTS; attempt += 1) {
    const overflow = providerPrompt.length - TST_PROMPT_MAX_CHARACTERS;
    const targetCharacters = Math.max(
      MIN_USER_PROMPT_REWRITE_CHARACTERS,
      sourcePromptForRewrite.length - overflow - PROMPT_REWRITE_SAFETY_MARGIN,
    );
    const rewrittenPrompt = normalizePromptWhitespace(
      await rewriteUserPromptToFitLimit(
        originalUserPromptInput,
        targetCharacters,
        'image generation',
        options?.onVertexDiagnostic,
      ),
    );

    if (!rewrittenPrompt) {
      break;
    }

    workingPayload = {
      ...workingPayload,
      prompt: combineImageGeneratePrompt(systemPromptPrefix, rewrittenPrompt),
      userPromptInput: rewrittenPrompt,
      systemPromptPrefix,
    };
    synthesizedPrompt = await synthesizeImageGeneratePrompt(workingPayload, options);
    providerPrompt = buildImageProviderPrompt(synthesizedPrompt, workingPayload, workingPayload.negativePrompt);

    if (providerPrompt.length <= TST_PROMPT_MAX_CHARACTERS) {
      return {
        optimizedPayload: workingPayload,
        synthesizedPrompt,
        providerPrompt,
      };
    }

    sourcePromptForRewrite = rewrittenPrompt;
  }

  throw new Error(
    `Tong prompt gui sang provider van vuot ${TST_PROMPT_MAX_CHARACTERS} ky tu sau khi rut gon. Vui long rut ngan prompt va thu lai.`,
  );
};

export const prepareProviderPayloadFromQueueRecipe = async (payload: QueueRecipePayload): Promise<Record<string, unknown>> => {
  switch (payload.recipeType) {
    case 'image_generate_recipe_v1': {
      const structuredPayload = payload as ImageGenerateRecipePayload;
      const directorSources = getImageDirectorSources(structuredPayload);
      const renderSources = getImageRenderReferenceSources(structuredPayload);
      const fallbackSources = payload.referenceImages || [];
      const uploadSources = renderSources.length > 0 ? renderSources : fallbackSources;

      if (uploadSources.length === 0) {
        throw new Error('CRITICAL FAILURE: No valid image references were prepared for the generation payload.');
      }

      const uploadedUrls = await Promise.all(
        uploadSources
          .filter((value): value is string => Boolean(value))
          .map((source) => uploadImageToTst(source)),
      );
      const promptPreparation = directorSources.length > 0
        ? await prepareImageGeneratePromptWithinLimit(structuredPayload)
        : {
            optimizedPayload: structuredPayload,
            synthesizedPrompt: payload.prompt,
            providerPrompt: payload.prompt,
          };

      return buildImageGenerateProviderPayload(
        promptPreparation.optimizedPayload,
        uploadedUrls,
        promptPreparation.synthesizedPrompt,
        promptPreparation.providerPrompt,
      );
    }

    case 'image_edit_recipe_v1': {
      const providerPrompt = await prepareDirectPromptWithinLimit(payload.prompt, 'image editing');
      const uploadedUrl = await uploadImageToTst(payload.sourceImage);
      const providerPayload: Record<string, unknown> = {
        prompt: providerPrompt,
        model: payload.modelId,
        img_url: [uploadedUrl],
      };

      if (payload.resolution) providerPayload.resolution = payload.resolution.toLowerCase();
      if (payload.aspectRatio) providerPayload.aspect_ratio = payload.aspectRatio;
      if (payload.speed) providerPayload.speed = payload.speed;
      if (payload.serverId) providerPayload.server_id = payload.serverId;

      return providerPayload;
    }

    case 'video_generate_recipe_v1': {
      const providerPrompt = await prepareDirectPromptWithinLimit(
        payload.prompt || 'Create a cinematic video',
        'video generation',
      );
      const providerPayload: Record<string, unknown> = {
        prompt: providerPrompt,
        model: payload.modelId,
        duration: payload.duration,
      };

      if (payload.resolution) providerPayload.resolution = payload.resolution.toLowerCase();
      if (payload.aspectRatio) providerPayload.aspect_ratio = payload.aspectRatio;
      if (payload.speed) providerPayload.speed = payload.speed;
      if (payload.serverId) providerPayload.server_id = payload.serverId;
      if (typeof payload.audio === 'boolean') providerPayload.audio = payload.audio;
      if (payload.keyframeImage) {
        const uploadedKeyframeUrl = await uploadImageToTst(payload.keyframeImage);
        providerPayload.img_url = uploadedKeyframeUrl;
        providerPayload.image_url = uploadedKeyframeUrl;
        if (payload.modelId === 'kling-2.5-turbo') {
          providerPayload.mode = 'i2v';
        }
      }

      return providerPayload;
    }

    case 'motion_generate_recipe_v1': {
      const providerPrompt = payload.prompt?.trim()
        ? await prepareDirectPromptWithinLimit(payload.prompt, 'motion generation')
        : '';
      const [characterImageUrl, motionVideoUrl] = await Promise.all([
        uploadImageToTst(payload.characterImage),
        uploadVideoToTst(payload.motionVideoDataUrl),
      ]);

      const providerPayload: Record<string, unknown> = {
        model: payload.modelId,
        mode: payload.modelId,
        character_image_url: characterImageUrl,
        motion_video_url: motionVideoUrl,
      };

      if (providerPrompt) providerPayload.prompt = providerPrompt;
      if (payload.resolution) providerPayload.resolution = payload.resolution.toLowerCase();
      if (payload.speed) providerPayload.speed = payload.speed;
      if (payload.serverId) providerPayload.server_id = payload.serverId;

      return providerPayload;
    }

    default:
      return payload;
  }
};
