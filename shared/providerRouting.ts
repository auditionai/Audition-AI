export type GenerationProviderRouteKey =
  | 'image_single'
  | 'image_couple'
  | 'image_group_3'
  | 'image_group_4'
  | 'image_group_5'
  | 'image_group_6'
  | 'image_group_7'
  | 'image_group_8'
  | 'image_prompt'
  | 'video_generation'
  | 'motion_control';

export const GENERATION_PROVIDER_ROUTE_OPTIONS: Array<{
  key: GenerationProviderRouteKey;
  label: string;
  description: string;
}> = [
  { key: 'image_single', label: 'Tạo ảnh đơn', description: 'Một nhân vật trong công cụ tạo ảnh Audition.' },
  { key: 'image_couple', label: 'Tạo ảnh đôi', description: 'Hai nhân vật trong công cụ tạo ảnh Audition.' },
  { key: 'image_group_3', label: 'Tạo ảnh nhóm 3', description: 'Ba nhân vật.' },
  { key: 'image_group_4', label: 'Tạo ảnh nhóm 4', description: 'Bốn nhân vật.' },
  { key: 'image_group_5', label: 'Tạo ảnh nhóm 5', description: 'Năm nhân vật.' },
  { key: 'image_group_6', label: 'Tạo ảnh nhóm 6', description: 'Sáu nhân vật; dùng nguồn đã cấu hình.' },
  { key: 'image_group_7', label: 'Tạo ảnh nhóm 7', description: 'Bảy nhân vật; dùng nguồn đã cấu hình.' },
  { key: 'image_group_8', label: 'Tạo ảnh nhóm 8', description: 'Tám nhân vật, không dùng ảnh mẫu; dùng nguồn đã cấu hình.' },
  { key: 'image_prompt', label: 'Tạo ảnh bằng prompt', description: 'Công cụ tạo ảnh prompt độc lập.' },
  { key: 'video_generation', label: 'Tạo video', description: 'Các model text/image-to-video.' },
  { key: 'motion_control', label: 'Motion Control', description: 'Điều khiển chuyển động bằng video mẫu.' },
];

export const DEFAULT_PROVIDER_BY_FEATURE: Partial<Record<GenerationProviderRouteKey, 'tst' | 'gommo'>> = {
  image_group_6: 'gommo',
  image_group_7: 'gommo',
  image_group_8: 'gommo',
};

export const DEFAULT_ALLOWED_MODELS_BY_FEATURE: Partial<Record<GenerationProviderRouteKey, string[]>> = {
  image_group_6: ['image-gpt-2'],
  image_group_7: ['image-gpt-2'],
  image_group_8: ['image-gpt-2'],
};

export const GPTI2_IMAGE_MODELS = ['gpt-image-2', 'nano-banana-2', 'nano-banana-pro'];

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

export const getAllowedModelsForFeature = (
  config: { allowedModelsByFeature?: Record<string, string[]> } | null | undefined,
  featureKey: GenerationProviderRouteKey | null | undefined,
): string[] | null => {
  if (!featureKey) return null;
  const explicit = config?.allowedModelsByFeature?.[featureKey];
  if (Array.isArray(explicit) && explicit.some((modelId) => normalize(modelId) === '*')) return null;
  const source = Array.isArray(explicit) && explicit.length > 0
    ? explicit
    : DEFAULT_ALLOWED_MODELS_BY_FEATURE[featureKey];
  if (!source?.length) return null;
  return Array.from(new Set(source.map(normalize).filter(Boolean)));
};

export const isModelAllowedForFeature = (
  config: { allowedModelsByFeature?: Record<string, string[]> } | null | undefined,
  featureKey: GenerationProviderRouteKey | null | undefined,
  modelId: unknown,
) => {
  const allowed = getAllowedModelsForFeature(config, featureKey);
  return !allowed || allowed.includes(normalize(modelId));
};

export const getImageProviderRouteKey = (characterCount: number): GenerationProviderRouteKey => {
  const count = Math.max(1, Math.min(8, Math.floor(Number(characterCount) || 1)));
  if (count === 1) return 'image_single';
  if (count === 2) return 'image_couple';
  return `image_group_${count}` as GenerationProviderRouteKey;
};

export const inferGenerationProviderRouteKey = (input: {
  queueKind?: unknown;
  toolId?: unknown;
  queuePayload?: Record<string, unknown> | null;
}): GenerationProviderRouteKey | null => {
  const queueKind = normalize(input.queueKind);
  const payload = input.queuePayload || {};
  const recipe = payload.__recipePayload && typeof payload.__recipePayload === 'object'
    ? payload.__recipePayload as Record<string, unknown>
    : payload;
  const recipeType = normalize(recipe.recipeType);
  if (queueKind === 'motion_generate' || recipeType === 'motion_generate_recipe_v1') return 'motion_control';
  if (queueKind === 'video_generate' || recipeType === 'video_generate_recipe_v1') return 'video_generation';
  if (recipeType === 'prompt_image_generate_recipe_v1') return 'image_prompt';
  if (queueKind !== 'image_generate' && recipeType !== 'image_generate_recipe_v1') return null;

  const explicitCount = Math.floor(Number(recipe.characterCount || 0));
  if (explicitCount > 0) return getImageProviderRouteKey(explicitCount);
  const toolId = normalize(input.toolId);
  if (toolId.includes('couple')) return 'image_couple';
  const groupMatch = toolId.match(/group[_-]?(\d+)/);
  if (groupMatch) return getImageProviderRouteKey(Number(groupMatch[1]));
  return 'image_single';
};
