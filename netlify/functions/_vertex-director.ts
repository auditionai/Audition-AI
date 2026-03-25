import { getImageCharacterReferenceGroups, getImageDirectorSources, type ImageGenerateRecipePayload } from '../../shared/queueRecipes';
import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODEL = 'gemini-3.1-pro-preview';

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
    'Your job is to analyze the provided reference images in strict role order and produce one final COMMAND PROMPT for the rendering engine.',
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
      const referenceKinds = group.references
        .map((reference) => (reference.kind === 'face' ? 'FACE LOCK' : reference.kind === 'body' ? 'BODY' : 'REFERENCE'))
        .join(', ');
      const genderDirective = group.gender ? ` Gender for this slot is fixed as ${group.gender.toUpperCase()}.` : '';
      sections.push(
        `- ${imageRange}: CHARACTER ${group.characterIndex} reference set (${referenceKinds}). These image(s) all describe the SAME final character. Merge them into one identity. This slot is mandatory and must appear exactly once in the final image.${genderDirective} Source of truth for face, hair, head shape, ear shape, body proportions, skin tone, clothing, shoes, accessories, gender, and identity. COPY EXACTLY. DO NOT INVENT. The character is already a stylized 3D game avatar. Preserve that topology and do not humanize it. These images are NOT pose references. Ignore their current standing pose, limb placement, framing, and background.`,
      );
      imageIndex += group.references.length;
    });
  }

  if (hasSample) {
    sections.push(`- Image ${imageIndex}: SAMPLE / POSE / BACKGROUND reference. This image has already been processed into a pose/composition-focused reference. COPY EXACTLY the pose, camera angle, framing, environment layout, scene composition, body lean, hand placement, leg placement, relative heights, and camera perspective from this image. DO NOT steal identity, outfit, skin texture, facial anatomy, hair texture, or realism from it. If this sample is derived from a real human photo, use it only as composition choreography. The final character must be re-posed into this sample choreography, not left in the original standing pose from the character reference image.`);
    imageIndex += 1;
  }

  if (hasStyle) {
    sections.push(`- Image ${imageIndex}: STYLE reference. This image is a processed style-only visual reference and WILL be sent to the renderer after the sample image. It may control only render language: rendering quality, lighting behavior, material response, color grading, stylized skin shading, broad adult body proportions, stylized facial planes, stylized hand structure, and visual finish. DO NOT copy pose, clothing, hairstyle, accessories, face, gender presentation, number of characters, character identity, or composition from it.`);
  }

  sections.push(
    '',
    'OUTPUT REQUIREMENTS:',
    '1. Return ONLY the final command prompt.',
    `1b. The final command prompt must explicitly require EXACTLY ${payload.characterCount || characterGroups.length} final character(s), no more and no less.`,
    '1c. The final command prompt must explicitly require one-to-one slot preservation: CHARACTER 1 appears once, CHARACTER 2 appears once, and so on. No missing slots, no duplicate slots, no substitutions.',
    '2. The final command prompt must explicitly command the renderer to COPY character identity from the character references only: face shape, eyes, hair silhouette, body topology, skin tone, outfit, shoes, accessories, and tattoos.',
    '2b. If multiple character reference images belong to the same character slot, the final command prompt must explicitly state that they all describe the same subject and must be merged into one identity, not split into extra people.',
    '2c. The final command prompt must explicitly forbid replacing any character slot with a duplicated uploaded character, a sample person, a style person, or an invented blended character.',
    '3. The final command prompt must explicitly state that character reference images are NOT pose references and their original standing pose must be ignored.',
    '4. The final command prompt must explicitly state that the subject must remain a stylized 3D game character / MMO avatar and must NOT become photorealistic, semi-realistic, or humanized.',
    '5. If a sample image is provided, the final command prompt must explicitly command the renderer to COPY the exact pose, framing, camera angle, and background from it, while forbidding any borrowing of real-human realism or identity from it.',
    '6. If a sample image is provided, the final command prompt must explicitly say to transplant or re-pose the final character into the sample composition, not return an unchanged copy of the uploaded character reference image.',
    '7. If the sample image contains multiple people, the final command prompt must explicitly map the final characters into those exact sample positions and preserve the exact left-to-right arrangement, spacing, overlap, body lean, hand placement, leg placement, and camera perspective. The renderer must NOT collapse them into a straight lineup unless the sample itself is a straight lineup.',
    '8. If a style image is provided, the final command prompt must explicitly command the renderer to COPY ONLY the render style, lighting, material quality, color grading, stylized skin shading, stylized facial/hand treatment, and broad adult 3D body-proportion language from it.',
    '9. The final command prompt must explicitly state that the style image is NOT a pose reference, NOT an outfit reference, NOT a character reference, and must NOT affect character count, gender, camera framing, or composition.',
    '10. The prompt must state that the renderer is FORBIDDEN from inventing extra characters, replacing the face, changing the hair, changing the outfit, improvising the composition, or blending the roles of the references.',
    '11. If multiple character references are provided, map each final character into a distinct sample position. Do not merge them into one combined pose and do not default to standing shoulder-to-shoulder unless the sample says so.',
    '12. Mention that the style image is provided as the LAST visual reference, but it is style-only and must never be used as a pose/outfit/identity source.',
    '13. Explicitly forbid realistic human skin pores, realistic human facial anatomy, realistic photographic shading, and live-action body proportions if they conflict with the game-avatar look.',
    '',
    'Do not explain your reasoning. Output only the final command prompt.',
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

      return text;
    },
  });
};
