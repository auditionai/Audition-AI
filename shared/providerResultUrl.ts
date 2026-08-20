export type GeneratedAssetType = 'image' | 'video';

const IMAGE_EXTENSIONS = new Set([
  'avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'tif', 'tiff', 'webp',
]);
const VIDEO_EXTENSIONS = new Set([
  'avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'ogv', 'webm',
]);

const normalizeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^https?:\/\//i.test(normalized) ? normalized : null;
};

const getUrlMediaType = (value: string): GeneratedAssetType | null => {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const extension = pathname.match(/\.([a-z0-9]+)$/)?.[1] || '';
    if (IMAGE_EXTENSIONS.has(extension)) return 'image';
    if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  } catch {
    return null;
  }
  return null;
};

export const isResultUrlCompatibleWithAssetType = (
  value: unknown,
  assetType: GeneratedAssetType,
  fieldHint?: GeneratedAssetType | null,
): value is string => {
  if (assetType === 'image' && typeof value === 'string' && /^data:image\//i.test(value.trim())) return true;
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return false;
  if (fieldHint && fieldHint !== assetType) return false;
  const detectedType = getUrlMediaType(normalized);
  return detectedType === null || detectedType === assetType;
};

const COMMON_KEYS = [
  'result', 'output', 'result_url', 'resultUrl', 'output_url', 'outputUrl',
  'download_url', 'downloadUrl', 'file_url', 'fileUrl', 'cdn_url', 'cdnUrl', 'url',
] as const;
const IMAGE_KEYS = ['image_url', 'imageUrl'] as const;
const VIDEO_KEYS = ['video_url', 'videoUrl'] as const;
const COMMON_COLLECTION_KEYS = ['results', 'outputs', 'files', 'artifacts', 'items', 'data'] as const;

const extractFromValue = (
  value: unknown,
  assetType: GeneratedAssetType,
  fieldHint: GeneratedAssetType | null = null,
): string | null => {
  const direct = normalizeHttpUrl(value);
  if (direct) {
    return isResultUrlCompatibleWithAssetType(direct, assetType, fieldHint) ? direct : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractFromValue(item, assetType, fieldHint);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  const objectValue = value as Record<string, unknown>;
  const typeSpecificKeys = assetType === 'video' ? VIDEO_KEYS : IMAGE_KEYS;
  for (const key of typeSpecificKeys) {
    const nested = extractFromValue(objectValue[key], assetType, assetType);
    if (nested) return nested;
  }
  for (const key of COMMON_KEYS) {
    const nested = extractFromValue(objectValue[key], assetType);
    if (nested) return nested;
  }
  for (const key of COMMON_COLLECTION_KEYS) {
    const nested = extractFromValue(objectValue[key], assetType);
    if (nested) return nested;
  }

  const mediaCollection = assetType === 'video' ? objectValue.videos : objectValue.images;
  return extractFromValue(mediaCollection, assetType, assetType);
};

export const extractProviderResultUrl = (
  data: unknown,
  assetType: GeneratedAssetType,
): string | null => extractFromValue(data, assetType);
