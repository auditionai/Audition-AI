import { getImageCharacterReferenceGroups, getImageDirectorSources, type ImageGenerateRecipePayload } from '../../shared/queueRecipes';
import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODEL = 'gemini-3.1-pro-preview';
const normalizePromptWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

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

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error?.message || data?.error || data?.detail || data?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
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
      throw new Error(`Failed to fetch reference image: ${await parseErrorMessage(response)}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type');
    mimeType = contentType || mimeType;
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

const buildStrictImageDirectorInstruction = (
  payload: ImageGenerateRecipePayload,
  hasCharacters: boolean,
  hasSample: boolean,
  hasStyle: boolean,
) => {
  const sections: string[] = [];
  const characterGroups = getImageCharacterReferenceGroups(payload);

  sections.push(
    'You are a master AI image generation director and forensic visual analyst.',
    'Your job is to analyze the provided reference images in strict role order and produce one compact VALID JSON object in English for the downstream rendering engine.',
    'You must obey the role of each image exactly. Never mix roles. Never invent missing details.',
    'The final rendered subject must remain a stylized 3D game avatar, not a real human or semi-realistic portrait.',
    '',
    `USER CORE REQUEST: ${payload.prompt}`,
  );

  if (payload.stylePrompt?.trim()) {
    sections.push(`STYLE PRESET KEYWORDS: ${payload.stylePrompt.trim()}`);
  }

  if (payload.negativePrompt?.trim()) {
    sections.push(`USER NEGATIVE CONSTRAINTS: ${payload.negativePrompt.trim()}`);
  }

  sections.push('', 'REFERENCE ROLE ORDER:');

  let imageIndex = 1;
  if (hasCharacters) {
    sections.push(`- Final output character count must be EXACTLY ${payload.characterCount || characterGroups.length}. No more, no less.`);
    characterGroups.forEach((group) => {
      const startIndex = imageIndex;
      const endIndex = imageIndex + group.references.length - 1;
      const imageRange = startIndex === endIndex ? `Image ${startIndex}` : `Images ${startIndex} to ${endIndex}`;
      const hasFaceLock = group.references.some((reference) => reference.kind === 'face');
      const referenceKinds = group.references
        .map((reference) => (reference.kind === 'face' ? 'FACE LOCK' : reference.kind === 'body' ? 'BODY' : 'REFERENCE'))
        .join(', ');
      const genderDirective = group.gender ? ` Gender for this slot is fixed as ${group.gender.toUpperCase()}.` : '';
      const faceLockDirective = hasFaceLock
        ? ' FACE LOCK images in this set are the highest-priority source for eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, and facial likeness. If BODY, SAMPLE, STYLE, or prompt wording conflicts with FACE LOCK, FACE LOCK wins absolutely for the face.'
        : '';
      sections.push(
        `- ${imageRange}: CHARACTER ${group.characterIndex} reference set (${referenceKinds}). These image(s) all describe the SAME final character. Merge them into one identity. This slot is mandatory and must appear exactly once in the final image.${genderDirective} Source of truth for face, hair, head shape, ear shape, body proportions, skin tone, clothing, shoes, accessories, gender, and identity. COPY EXACTLY. DO NOT INVENT.${faceLockDirective} The character is already a stylized 3D game avatar. Preserve that topology and do not humanize it. These images are NOT pose references. Ignore their current standing pose, limb placement, framing, and background.`,
      );
      imageIndex += group.references.length;
    });
  }

  if (hasSample) {
    sections.push(`- Image ${imageIndex}: SAMPLE / POSE / BACKGROUND reference. This image has already been processed into a pose/composition-focused reference. COPY EXACTLY the pose, camera angle, framing, environment layout, scene composition, body lean, hand placement, leg placement, relative heights, and camera perspective from this image. DO NOT steal identity, outfit, skin texture, facial anatomy, facial expression identity, eye shape, nose shape, lip shape, hair texture, or realism from it. If this sample is derived from a real human photo, use it only as composition choreography. The final character must be re-posed into this sample choreography, not left in the original standing pose from the character reference image.`);
    imageIndex += 1;
  } else {
    sections.push('- No SAMPLE / POSE / BACKGROUND reference is provided. Therefore the USER CORE REQUEST becomes the PRIMARY source for pose, camera angle, framing, body action, environment layout, scene composition, and background details. Do not default to a plain standing studio portrait unless the USER CORE REQUEST explicitly asks for it.');
  }

  if (hasStyle) {
    sections.push(`- Image ${imageIndex}: STYLE reference. This image is a style-only visual reference and WILL be sent to the renderer after the sample image. It may control only render language: rendering quality, lighting behavior, material response, color grading, stylized skin shading, broad adult body proportions, stylized facial planes, stylized hand structure, and visual finish. DO NOT copy pose, clothing, hairstyle, accessories, face, gender presentation, number of characters, character identity, composition, panel layout, collage layout, or black studio background from it.`);
  }

  sections.push(
    '',
    'OUTPUT REQUIREMENTS:',
    '1. Return ONLY one valid JSON object. No markdown. No code fences. No commentary.',
    '2. Every string value in the JSON must be English, even if the original user prompt or system prompt is Vietnamese.',
    '3. Merge SYSTEM PROMPT PREFIX and USER CORE REQUEST into the JSON while preserving all constraints and intent.',
    `4. The JSON must explicitly require EXACTLY ${payload.characterCount || characterGroups.length} final character(s), no more and no less, with one-to-one slot preservation.`,
    '5. The JSON must explicitly command the renderer to COPY character identity from character references only: face shape, eyes, hair silhouette, body topology, skin tone, outfit, shoes, accessories, and tattoos.',
    '6. If FACE LOCK reference images are present, the JSON must explicitly state that they are the highest-priority source for the final face and override sample/body/style conflicts for eyes, eyebrows, nose, lips, jawline, hairline, bangs, makeup, glasses, and facial likeness.',
    '7. The JSON must explicitly state that character reference images are NOT pose references and their original standing pose must be ignored.',
    '8. If a sample image is provided, the JSON must explicitly command the renderer to copy the exact pose, framing, camera angle, and background from it, while forbidding any borrowing of face identity, hair identity, facial expression identity, outfit identity, or realism from it.',
    '9. If NO sample image is provided, the JSON must explicitly say that pose, framing, camera angle, scene action, and background must be inferred from the merged prompt text.',
    '10. If a style image is provided, the JSON must explicitly command the renderer to copy ONLY the render style, lighting, material quality, color grading, stylized skin shading, stylized facial/hand treatment, and broad adult 3D body-proportion language from it.',
    '11. The JSON must explicitly forbid inventing extra characters, replacing the face, changing the hair, changing the outfit, improvising the composition, or blending reference roles.',
    '12. The JSON must explicitly forbid split-screen layouts, grids, paneling, storyboards, quadrants, tiled compositions, duplicated crops, and collage-like framing.',
    '13. The JSON must explicitly forbid realistic human skin pores, realistic human facial anatomy, realistic photographic shading, and live-action body proportions if they conflict with the game-avatar look.',
    '14. Keep the JSON compact. Use short but specific English phrases. Remove repetition.',
    '15. Prefer this exact top-level schema and omit empty arrays only if absolutely necessary:',
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

export const synthesizeStrictImagePrompt = async (payload: ImageGenerateRecipePayload) => {
  const characterImages = payload.characterImages || [];
  const hasCharacters = characterImages.length > 0;
  const hasSample = Boolean(payload.sampleImage);
  const hasStyle = Boolean(payload.styleImage);

  if (!hasCharacters) {
    throw new Error('CRITICAL FAILURE: Character reference images are missing.');
  }

  const orderedSources = getImageDirectorSources(payload);
  const parts: Array<Record<string, unknown>> = await Promise.all(orderedSources.map((image) => toInlineImagePart(image)));

  parts.push({
    text: buildStrictImageDirectorInstruction(payload, hasCharacters, hasSample, hasStyle),
  });

  return runWithVertexCredentialFailover({
    taskName: 'image prompt synthesis',
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
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.2,
              topP: 0.8,
              maxOutputTokens: 2048,
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
        throw new Error('Vertex AI did not return a synthesized image prompt.');
      }

      return normalizePromptJsonPayload(text);
    },
  });
};

export const rewriteUserPromptToFitLimit = async (
  prompt: string,
  maxCharacters: number,
  pipelineLabel = 'generation',
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
        throw new Error('Vertex AI did not return a compressed user prompt.');
      }

      return text;
    },
  });
};

export const rewriteUserImagePromptToFitLimit = async (
  prompt: string,
  maxCharacters: number,
) => rewriteUserPromptToFitLimit(prompt, maxCharacters, 'image generation');
