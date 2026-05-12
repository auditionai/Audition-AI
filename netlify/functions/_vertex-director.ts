import {
  buildImageRoleContractText,
  getImageCharacterReferenceGroups,
  isProImageGenerationModel,
  type ImageGenerateRecipePayload,
  type QueueVertexDiagnosticEntry,
} from '../../shared/queueRecipes';
import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODEL = 'gemini-3.1-pro-preview';
const normalizePromptWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
type VertexDiagnosticTask = QueueVertexDiagnosticEntry['task'];
type VertexDiagnosticCallback = (entry: QueueVertexDiagnosticEntry) => Promise<void> | void;

const IMAGE_PROMPT_JSON_SCHEMA = {
  type: 'OBJECT',
  required: [
    'language',
    'system_prompt_en',
    'user_prompt_en',
    'merged_prompt_en',
    'character_count',
    'identity_rules',
    'face_lock_rules',
    'composition_rules',
    'scene_rules',
    'style_rules',
    'camera_rules',
    'must_keep',
    'must_avoid',
    'negative_constraints_en',
  ],
  properties: {
    language: { type: 'STRING' },
    system_prompt_en: { type: 'STRING' },
    user_prompt_en: { type: 'STRING' },
    merged_prompt_en: { type: 'STRING' },
    character_count: { type: 'INTEGER' },
    identity_rules: { type: 'ARRAY', items: { type: 'STRING' } },
    face_lock_rules: { type: 'ARRAY', items: { type: 'STRING' } },
    composition_rules: { type: 'ARRAY', items: { type: 'STRING' } },
    scene_rules: { type: 'ARRAY', items: { type: 'STRING' } },
    style_rules: { type: 'ARRAY', items: { type: 'STRING' } },
    camera_rules: { type: 'ARRAY', items: { type: 'STRING' } },
    must_keep: { type: 'ARRAY', items: { type: 'STRING' } },
    must_avoid: { type: 'ARRAY', items: { type: 'STRING' } },
    negative_constraints_en: { type: 'ARRAY', items: { type: 'STRING' } },
  },
} as const;

const collectFinishReasons = (data: any) =>
  (Array.isArray(data?.candidates) ? data.candidates : [])
    .map((candidate: any) => candidate?.finishReason)
    .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0);

const collectSafetyRatings = (data: any) =>
  (Array.isArray(data?.candidates) ? data.candidates : [])
    .flatMap((candidate: any) => (Array.isArray(candidate?.safetyRatings) ? candidate.safetyRatings : []))
    .map((rating: any) => {
      const category = typeof rating?.category === 'string' ? rating.category : '';
      const blocked = rating?.blocked === true ? ':blocked' : '';
      return `${category}${blocked}`.trim();
    })
    .filter((value: string) => value.length > 0);

const extractJsonPayload = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Vertex AI returned an empty prompt synthesis payload.');
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('Vertex AI did not return a valid JSON object for prompt synthesis.');
};

const normalizePromptJsonPayload = (value: string) => {
  const parsed = JSON.parse(extractJsonPayload(value));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Vertex AI prompt synthesis JSON must be an object.');
  }

  return JSON.stringify(parsed);
};

const extractCandidateText = (data: any) => {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();

    if (text) {
      return text;
    }
  }

  return '';
};

const extractPromptFeedback = (data: any) => {
  const promptFeedback = data?.promptFeedback && typeof data.promptFeedback === 'object'
    ? data.promptFeedback
    : null;
  const promptBlockReason = typeof promptFeedback?.blockReason === 'string'
    ? promptFeedback.blockReason
    : '';
  const promptBlockMessage = typeof promptFeedback?.blockReasonMessage === 'string'
    ? promptFeedback.blockReasonMessage
    : '';
  return {
    blockReason: promptBlockReason || undefined,
    blockReasonMessage: promptBlockMessage || undefined,
  };
};

const parseErrorMessage = async (response: Response) => {
  const fallback = `Vertex AI request failed with ${response.status} ${response.statusText}`.trim();

  try {
    const raw = await response.text();
    if (!raw) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(raw);
      const message = parsed?.error?.message || parsed?.message || raw;
      const status = parsed?.error?.status || parsed?.status || '';
      const reason = parsed?.error?.details?.[0]?.reason || parsed?.reason || '';
      return [message, status, reason].filter(Boolean).join(' | ') || fallback;
    } catch {
      return raw;
    }
  } catch {
    return fallback;
  }
};

const summarizeVertexPromptSynthesisFailure = (data: any) => {
  const promptFeedback = extractPromptFeedback(data);
  const finishReasons = collectFinishReasons(data);
  const safetyRatings = collectSafetyRatings(data);
  const details = [
    promptFeedback.blockReason ? `prompt_block=${promptFeedback.blockReason}` : '',
    promptFeedback.blockReasonMessage ? `prompt_message=${promptFeedback.blockReasonMessage}` : '',
    finishReasons.length > 0 ? `finish_reasons=${finishReasons.join(',')}` : '',
    safetyRatings.length > 0 ? `safety=${safetyRatings.join(',')}` : '',
  ].filter(Boolean);

  return details.length > 0
    ? `Vertex AI returned no prompt text for image prompt synthesis. ${details.join(' | ')}`
    : 'Vertex AI returned no prompt text for image prompt synthesis.';
};

const emitVertexDiagnostic = async (
  callback: VertexDiagnosticCallback | undefined,
  task: VertexDiagnosticTask,
  partial: Omit<QueueVertexDiagnosticEntry, 'at' | 'task' | 'model'>,
) => {
  if (!callback) {
    return;
  }

  await callback({
    at: new Date().toISOString(),
    task,
    model: VERTEX_MODEL,
    ...partial,
  });
};

const buildStrictImageDirectorInstruction = (
  payload: ImageGenerateRecipePayload,
  hasCharacters: boolean,
  hasSample: boolean,
  hasStyle: boolean,
) => {
  const sections: string[] = [];
  const characterCount = payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1;
  const roleContractText = buildImageRoleContractText(payload);

  sections.push(
    'You are a master AI image generation director.',
    'Your job is to convert the provided prompt and structured reference metadata into one compact VALID JSON object in English for the downstream rendering engine.',
    'Obey the role contract exactly. Never mix identity, composition, and style.',
    'Keep the final result as a stylized 3D game avatar, not a photorealistic human.',
    '',
    `USER CORE REQUEST: ${payload.prompt}`,
  );

  if (payload.stylePrompt?.trim()) {
    sections.push(`STYLE PRESET KEYWORDS: ${normalizePromptWhitespace(payload.stylePrompt).slice(0, 700)}`);
  }

  if (payload.negativePrompt?.trim()) {
    sections.push(`USER NEGATIVE CONSTRAINTS: ${payload.negativePrompt.trim()}`);
  }

  sections.push('', roleContractText);

  sections.push(
    '',
    'OUTPUT REQUIREMENTS:',
    '1. Return ONLY one valid JSON object. No markdown. No code fences. No commentary.',
    '2. Every string value in the JSON must be English, even if the original user prompt or system prompt is Vietnamese.',
    '3. Merge SYSTEM PROMPT PREFIX and USER CORE REQUEST into the JSON while preserving all constraints and intent.',
    `4. Require EXACTLY ${characterCount} final character(s), no more and no less, with one-to-one slot preservation.`,
    `5. Respect the role contract exactly across identity, composition, and style.${hasCharacters ? ' Character references remain identity-only.' : ''}${hasSample ? ' Sample remains composition-only.' : ''}${hasStyle ? ' Style remains style-only.' : ''}`,
    '6. Keep the JSON compact. Use short but specific English phrases. Remove repetition.',
    '7. Prefer this exact top-level schema and omit empty arrays only if absolutely necessary:',
    '{',
    '  "language": "en",',
    '  "system_prompt_en": "string",',
    '  "user_prompt_en": "string",',
    '  "merged_prompt_en": "string",',
    '  "character_count": number,',
    '  "identity_rules": ["string"],',
    '  "face_lock_rules": ["string"],',
    '  "composition_rules": ["string"],',
    '  "scene_rules": ["string"],',
    '  "style_rules": ["string"],',
    '  "camera_rules": ["string"],',
    '  "must_keep": ["string"],',
    '  "must_avoid": ["string"],',
    '  "negative_constraints_en": ["string"]',
    '}',
    '',
    'Do not explain your reasoning. Output only the JSON object.',
  );

  return sections.join('\n');
};

const buildCompactImageDirectorInstruction = (
  payload: ImageGenerateRecipePayload,
  hasCharacters: boolean,
  hasSample: boolean,
  hasStyle: boolean,
) => {
  if (isProImageGenerationModel(payload.modelId)) {
    const characterCount = payload.characterCount || getImageCharacterReferenceGroups(payload).length || 1;
    const sections: string[] = [
      'Return ONLY one compact valid JSON object in English for the renderer.',
      'No markdown. No commentary. No code fences.',
      `USER CORE REQUEST: ${normalizePromptWhitespace(payload.prompt || '').slice(0, 700)}`,
      `FINAL CHARACTER COUNT: EXACTLY ${characterCount}.`,
      hasSample
        ? 'SAMPLE = scene plate only. Keep background, pose, contact points, framing, props, and camera.'
        : 'No sample image is present. Derive composition from the user request.',
      'CHARACTER = identity only. Keep face, skin tone, outfit, body structure, and avatar details from character refs.',
      hasStyle ? 'STYLE = render finish only. Never use it for pose, outfit, or identity.' : 'No style image is present.',
      payload.stylePrompt?.trim() ? `STYLE KEYWORDS: ${normalizePromptWhitespace(payload.stylePrompt).slice(0, 220)}` : '',
      payload.negativePrompt?.trim() ? `NEGATIVE CONSTRAINTS: ${normalizePromptWhitespace(payload.negativePrompt).slice(0, 260)}` : '',
      'Schema:',
      '{',
      '  "language": "en",',
      '  "system_prompt_en": "string",',
      '  "user_prompt_en": "string",',
      '  "merged_prompt_en": "string",',
      '  "character_count": number,',
      '  "identity_rules": ["string"],',
      '  "face_lock_rules": ["string"],',
      '  "composition_rules": ["string"],',
      '  "scene_rules": ["string"],',
      '  "style_rules": ["string"],',
      '  "camera_rules": ["string"],',
      '  "must_keep": ["string"],',
      '  "must_avoid": ["string"],',
      '  "negative_constraints_en": ["string"]',
      '}',
    ];

    return sections.filter(Boolean).join('\n');
  }

  const characterGroups = getImageCharacterReferenceGroups(payload);
  const characterCount = payload.characterCount || characterGroups.length || 1;
  const roleContractText = buildImageRoleContractText(payload);
  const sections: string[] = [
    'Return ONLY one valid JSON object in English for the renderer.',
    'No markdown. No code fences. No commentary.',
    'Obey the role contract exactly.',
    `USER CORE REQUEST: ${payload.prompt}`,
  ];

  if (payload.stylePrompt?.trim()) {
    sections.push(`STYLE PRESET KEYWORDS: ${normalizePromptWhitespace(payload.stylePrompt).slice(0, 700)}`);
  }

  if (payload.negativePrompt?.trim()) {
    sections.push(`USER NEGATIVE CONSTRAINTS: ${payload.negativePrompt.trim()}`);
  }

  sections.push('', roleContractText, '', `FINAL CHARACTER COUNT: EXACTLY ${characterCount}.`);

  sections.push(
    'Keep the result as a stylized 3D game avatar, not a photorealistic human.',
    'Forbid extra characters, identity blending, outfit swaps, split-screen, panels, tiles, grids, collage layouts, and realistic humanization.',
    'Use this schema:',
    '{',
    '  "language": "en",',
    '  "system_prompt_en": "string",',
    '  "user_prompt_en": "string",',
    '  "merged_prompt_en": "string",',
    '  "character_count": number,',
    '  "identity_rules": ["string"],',
    '  "face_lock_rules": ["string"],',
    '  "composition_rules": ["string"],',
    '  "scene_rules": ["string"],',
    '  "style_rules": ["string"],',
    '  "camera_rules": ["string"],',
    '  "must_keep": ["string"],',
    '  "must_avoid": ["string"],',
    '  "negative_constraints_en": ["string"]',
    '}',
  );

  return sections.join('\n');
};

const requestVertexPromptSynthesis = async (
  projectId: string,
  accessToken: string,
  parts: Array<Record<string, unknown>>,
  outputTokenLimit: number,
) => {
  const response = await fetch(
    `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${VERTEX_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.0,
          topP: 0.1,
          maxOutputTokens: outputTokenLimit,
          responseMimeType: 'application/json',
          responseSchema: IMAGE_PROMPT_JSON_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(180000),
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  return {
    data,
    text: extractCandidateText(data),
    finishReasons: collectFinishReasons(data),
    promptFeedback: extractPromptFeedback(data),
    safetyRatings: collectSafetyRatings(data),
  };
};

export const synthesizeStrictImagePrompt = async (
  payload: ImageGenerateRecipePayload,
  options?: {
    onDiagnostic?: VertexDiagnosticCallback;
  },
) => {
  const characterImages = payload.characterImages || [];
  const hasCharacters = characterImages.length > 0;
  const hasSample = Boolean(payload.sampleImage);
  const hasStyle = Boolean(payload.styleImage);

  if (!hasCharacters) {
    throw new Error('CRITICAL FAILURE: Character reference images are missing.');
  }

  const compactInstruction = buildCompactImageDirectorInstruction(payload, hasCharacters, hasSample, hasStyle);
  const primaryInstruction = isProImageGenerationModel(payload.modelId)
    ? compactInstruction
    : buildStrictImageDirectorInstruction(payload, hasCharacters, hasSample, hasStyle);

  return runWithVertexCredentialFailover({
    taskName: 'image prompt synthesis',
    onAttemptFailure: async ({ credentialName, projectId, error, retryable }) => {
      if (!retryable) {
        return;
      }
      await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
        status: 'error',
        message: error.message,
        credentialName: credentialName || undefined,
        projectId,
      });
    },
    operation: async ({ projectId, accessToken, credentialName }) => {
      const primaryAttempt = await requestVertexPromptSynthesis(projectId, accessToken, [
        { text: primaryInstruction },
      ], 1400);

      const tryNormalize = (text: string) => normalizePromptJsonPayload(text);

      if (primaryAttempt.text) {
        try {
          const normalized = tryNormalize(primaryAttempt.text);
          await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
            status: 'success',
            message: 'Vertex AI synthesized the English JSON prompt successfully.',
            credentialName: credentialName || undefined,
            projectId,
            finishReasons: primaryAttempt.finishReasons,
            promptFeedback: primaryAttempt.promptFeedback,
            safetyRatings: primaryAttempt.safetyRatings,
          });
          return normalized;
        } catch (error) {
          const primaryError = error instanceof Error ? error : new Error(String(error));
          await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
            status: 'warning',
            message: `Primary synthesis JSON was invalid. Retrying with compact director. First error: ${primaryError.message}`,
            credentialName: credentialName || undefined,
            projectId,
            finishReasons: primaryAttempt.finishReasons,
            promptFeedback: primaryAttempt.promptFeedback,
            safetyRatings: primaryAttempt.safetyRatings,
          });

          const compactAttempt = await requestVertexPromptSynthesis(projectId, accessToken, [
            { text: compactInstruction },
          ], 900);

          if (!compactAttempt.text) {
            const compactError = new Error(summarizeVertexPromptSynthesisFailure(compactAttempt.data));
            await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
              status: 'error',
              message: `Compact director retry failed after invalid primary JSON. First error: ${primaryError.message}. Retry error: ${compactError.message}`,
              credentialName: credentialName || undefined,
              projectId,
              finishReasons: compactAttempt.finishReasons,
              promptFeedback: compactAttempt.promptFeedback,
              safetyRatings: compactAttempt.safetyRatings,
            });
            throw compactError;
          }

          try {
            const normalized = tryNormalize(compactAttempt.text);
            await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
              status: 'success',
              message: 'Compact director retry produced a valid English JSON prompt.',
              credentialName: credentialName || undefined,
              projectId,
              finishReasons: compactAttempt.finishReasons,
              promptFeedback: compactAttempt.promptFeedback,
              safetyRatings: compactAttempt.safetyRatings,
            });
            return normalized;
          } catch (error) {
            const compactError = error instanceof Error ? error : new Error(String(error));
            await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
              status: 'error',
              message: `Compact director retry returned invalid JSON. First error: ${primaryError.message}. Retry error: ${compactError.message}`,
              credentialName: credentialName || undefined,
              projectId,
              finishReasons: compactAttempt.finishReasons,
              promptFeedback: compactAttempt.promptFeedback,
              safetyRatings: compactAttempt.safetyRatings,
            });
            throw compactError;
          }
        }
      }

      const primaryNoTextError = new Error(summarizeVertexPromptSynthesisFailure(primaryAttempt.data));
      await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
        status: 'warning',
        message: `Primary synthesis returned no usable JSON text. Retrying with compact director. First error: ${primaryNoTextError.message}`,
        credentialName: credentialName || undefined,
        projectId,
        finishReasons: primaryAttempt.finishReasons,
        promptFeedback: primaryAttempt.promptFeedback,
        safetyRatings: primaryAttempt.safetyRatings,
      });

      const compactAttempt = await requestVertexPromptSynthesis(projectId, accessToken, [
        { text: compactInstruction },
      ], 900);

      if (!compactAttempt.text) {
        const compactError = new Error(summarizeVertexPromptSynthesisFailure(compactAttempt.data));
        await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
          status: 'error',
          message: `Compact director retry also returned no usable JSON text. First error: ${primaryNoTextError.message}. Retry error: ${compactError.message}`,
          credentialName: credentialName || undefined,
          projectId,
          finishReasons: compactAttempt.finishReasons,
          promptFeedback: compactAttempt.promptFeedback,
          safetyRatings: compactAttempt.safetyRatings,
        });
        throw compactError;
      }

      try {
        const normalized = tryNormalize(compactAttempt.text);
        await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
          status: 'success',
          message: 'Compact director retry produced a valid English JSON prompt.',
          credentialName: credentialName || undefined,
          projectId,
          finishReasons: compactAttempt.finishReasons,
          promptFeedback: compactAttempt.promptFeedback,
          safetyRatings: compactAttempt.safetyRatings,
        });
        return normalized;
      } catch (error) {
        const compactError = error instanceof Error ? error : new Error(String(error));
        await emitVertexDiagnostic(options?.onDiagnostic, 'image_prompt_synthesis', {
          status: 'error',
          message: `Compact director retry returned invalid JSON after no-text primary attempt. First error: ${primaryNoTextError.message}. Retry error: ${compactError.message}`,
          credentialName: credentialName || undefined,
          projectId,
          finishReasons: compactAttempt.finishReasons,
          promptFeedback: compactAttempt.promptFeedback,
          safetyRatings: compactAttempt.safetyRatings,
        });
        throw compactError;
      }
    },
  });
};

export const rewriteUserPromptToFitLimit = async (
  prompt: string,
  maxCharacters: number,
  pipelineLabel = 'generation',
  onDiagnostic?: VertexDiagnosticCallback,
) => {
  const normalizedPrompt = normalizePromptWhitespace(prompt);
  if (!normalizedPrompt) {
    return '';
  }

  if (normalizedPrompt.length <= maxCharacters) {
    return normalizedPrompt;
  }

  const instruction = [
    `You rewrite user prompts for a ${pipelineLabel} pipeline.`,
    'Your job is to make the prompt shorter without changing the original meaning.',
    'Rules:',
    '- Keep the same language as the input.',
    '- Preserve all concrete requirements, constraints, poses, outfits, colors, makeup, expressions, accessories, camera, composition, character count, and prohibitions.',
    '- Remove repetition, filler, and verbose phrasing only.',
    '- Do not add new ideas.',
    `- The final rewritten prompt must be at most ${maxCharacters} characters including spaces.`,
    '- Return only the rewritten prompt.',
    '',
    'USER PROMPT:',
    normalizedPrompt,
  ].join('\n');

  return runWithVertexCredentialFailover({
    taskName: 'image prompt compression',
    onAttemptFailure: async ({ credentialName, projectId, error, retryable }) => {
      if (!retryable) {
        return;
      }
      await emitVertexDiagnostic(onDiagnostic, 'image_prompt_compression', {
        status: 'error',
        message: error.message,
        credentialName: credentialName || undefined,
        projectId,
      });
    },
    operation: async ({ projectId, accessToken, credentialName }) => {
      const response = await fetch(
        `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${VERTEX_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: instruction }] }],
            generationConfig: {
              temperature: 0.1,
              topP: 0.8,
              maxOutputTokens: 1024,
            },
          }),
          signal: AbortSignal.timeout(120000),
        },
      );

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const data = await response.json();
      const text = normalizePromptWhitespace(String(data?.candidates?.[0]?.content?.parts?.[0]?.text || ''));
      if (!text) {
        const message = 'Vertex AI did not return a compressed user prompt.';
        await emitVertexDiagnostic(onDiagnostic, 'image_prompt_compression', {
          status: 'error',
          message,
          credentialName: credentialName || undefined,
          projectId,
          finishReasons: collectFinishReasons(data),
          promptFeedback: extractPromptFeedback(data),
          safetyRatings: collectSafetyRatings(data),
        });
        throw new Error(message);
      }

      await emitVertexDiagnostic(onDiagnostic, 'image_prompt_compression', {
        status: 'success',
        message: `Vertex AI compressed the ${pipelineLabel} prompt successfully.`,
        credentialName: credentialName || undefined,
        projectId,
        finishReasons: collectFinishReasons(data),
        promptFeedback: extractPromptFeedback(data),
        safetyRatings: collectSafetyRatings(data),
      });
      return text;
    },
  });
};

export const rewriteUserImagePromptToFitLimit = async (
  prompt: string,
  maxCharacters: number,
) => rewriteUserPromptToFitLimit(prompt, maxCharacters, 'image generation');
