import { uploadFileToR2 } from './storageService';
import { runDirectImageEdit } from './directImageEditService';
import type { ImageEditRecipePayload } from '../shared/queueRecipes';
import { REMOVE_BACKGROUND_CHARACTER_LOCK_PROMPT, SHARPEN_UPSCALE_CHARACTER_LOCK_PROMPT } from '../shared/imageEditPrompts';
import { calculateAspectRatioString, loadImageWithTimeout } from '../utils/imageProcessor';

export type CharacterAssistantToolId = 'remove_bg_pro' | 'sharpen_upscale';
export type AssistantResolution = '1K' | '2K' | '4K';

export const CHARACTER_ASSISTANT_RESOLUTION: AssistantResolution = '2K';

const TOOL_META: Record<CharacterAssistantToolId, { toolName: string; modelId: string }> = {
  remove_bg_pro: {
    toolName: 'Tách Nền',
    modelId: 'gpt-image-2',
  },
  sharpen_upscale: {
    toolName: 'Làm Nét',
    modelId: 'gpt-image-2',
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
    return SHARPEN_UPSCALE_CHARACTER_LOCK_PROMPT;
  }

  return REMOVE_BACKGROUND_CHARACTER_LOCK_PROMPT;
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
    engine: `GPT Image 2 ${resolution}`,
    costVcoin,
    showInGenerationHistory,
    queuePayload,
  });
};
