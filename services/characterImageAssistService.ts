import { uploadFileToR2 } from './storageService';
import { runDirectImageEdit } from './directImageEditService';
import type { ImageEditRecipePayload } from '../shared/queueRecipes';
import { calculateAspectRatioString, loadImageWithTimeout } from '../utils/imageProcessor';

export type CharacterAssistantToolId = 'remove_bg_pro' | 'sharpen_upscale';
export type AssistantResolution = '1K' | '2K' | '4K';

export const CHARACTER_ASSISTANT_RESOLUTION: AssistantResolution = '2K';

const TOOL_META: Record<CharacterAssistantToolId, { toolName: string; modelId: string }> = {
  remove_bg_pro: {
    toolName: 'Tách Nền',
    modelId: 'vertex-flash',
  },
  sharpen_upscale: {
    toolName: 'Làm Nét',
    modelId: 'vertex-flash',
  },
};

const extractMimeType = (input: string) =>
  input.startsWith('data:') ? input.substring(input.indexOf(':') + 1, input.indexOf(';')) : undefined;

export const buildCharacterAssistantDisplayPrompt = (
  toolId: CharacterAssistantToolId,
  resolution: AssistantResolution = CHARACTER_ASSISTANT_RESOLUTION,
) => {
  if (toolId === 'sharpen_upscale') {
    return `Làm nét ảnh nhân vật ${resolution}`;
  }

  return 'Tách nền ảnh nhân vật';
};

export const buildEnhancedVertexEditInstruction = (
  toolId: CharacterAssistantToolId,
  resolution: AssistantResolution = CHARACTER_ASSISTANT_RESOLUTION,
) => {
  if (toolId === 'sharpen_upscale') {
    return [
      `Upscale this image to ${resolution}.`,
      'CRITICAL GOAL: recover real detail from a blurry, noisy, compressed, or phone-captured character image while keeping the exact same subject identity.',
      'Preserve the exact face, hairstyle, skin tone, body proportions, outfit, shoes, accessories, tattoos, and stylized game-avatar topology.',
      'Restore edge definition, facial readability, clothing texture separation, accessory clarity, and silhouette precision.',
      'Reduce blur, softness, moire, JPEG artifacts, screen-door noise, sensor noise, and washed-out detail.',
      'Keep the same composition, camera crop, pose, body shape, colors, and background structure unless the source already has a pure black cutout background.',
      'Do NOT redesign, repaint, beautify, re-style, replace the face, alter the outfit, humanize the avatar, photorealize the image, add missing items, or invent new details.',
      'Output a clean, sharp, high-fidelity restoration suitable for identity-accurate downstream AI generation.',
    ].join(' ');
  }

  return [
    'Remove the background completely and isolate the main character on a pure black background (#000000).',
    'CRITICAL GOAL: extract the exact same uploaded character cleanly, even when the source is a phone photo, a game screenshot, a noisy monitor capture, or a cluttered UI scene.',
    'Preserve the exact face, hairstyle, skin tone, body proportions, outfit, shoes, accessories, tattoos, and stylized game-avatar topology.',
    'Delete the original environment, game UI, menus, icons, text, profile-card frame, shopping-mall panel, lobby window, room background, outdoor scene, extra objects, and every non-character element.',
    'If the character appears inside an in-game card, poster, framed panel, or UI window, remove that card or frame too and keep only the character.',
    'Keep clean edges around hair, fingers, shoes, and small accessories. Preserve all subject details sharply without soft halos.',
    'Treat a solid black background as the correct final output. Do NOT replace it with transparency, gradients, or a new scene.',
    'Do NOT crop, blur, downscale, repaint the character, change colors, replace the face, humanize the subject, or invent new body parts or clothing.',
    'Output a strong, production-ready character cutout on black for identity-accurate AI image generation.',
  ].join(' ');
};

export const buildCharacterAssistantInstruction = buildEnhancedVertexEditInstruction;

export const runCharacterAssistantAction = async ({
  sourceImage,
  toolId,
  costVcoin,
  storageFolder,
  resolution = CHARACTER_ASSISTANT_RESOLUTION,
  showInGenerationHistory = false,
}: {
  sourceImage: string;
  toolId: CharacterAssistantToolId;
  costVcoin: number;
  storageFolder: string;
  resolution?: AssistantResolution;
  showInGenerationHistory?: boolean;
}) => {
  const metadata = TOOL_META[toolId];
  const jobId = crypto.randomUUID();
  const displayPrompt = buildCharacterAssistantDisplayPrompt(toolId, resolution);
  const instructionPrompt = buildEnhancedVertexEditInstruction(toolId, resolution);
  const stagedSourceImage = await uploadFileToR2(sourceImage, storageFolder);

  let aspectRatio = '1:1';
  try {
    const image = await loadImageWithTimeout(sourceImage);
    aspectRatio = calculateAspectRatioString(image.width, image.height);
  } catch (error) {
    console.warn('[CharacterImageAssist] Failed to calculate aspect ratio', error);
  }

  const queuePayload: ImageEditRecipePayload = {
    recipeType: 'image_edit_recipe_v1',
    modelId: metadata.modelId,
    prompt: instructionPrompt,
    sourceImage: stagedSourceImage,
    mimeType: extractMimeType(stagedSourceImage) || extractMimeType(sourceImage),
    resolution,
    aspectRatio,
  };

  return runDirectImageEdit({
    id: jobId,
    prompt: displayPrompt,
    toolId,
    toolName: metadata.toolName,
    engine: `Vertex Flash ${resolution}`,
    costVcoin,
    showInGenerationHistory,
    queuePayload,
  });
};
