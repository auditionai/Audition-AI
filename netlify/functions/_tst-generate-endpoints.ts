const normalizeModelId = (value: unknown) => String(value || '').trim().toLowerCase();

export const getTstVideoGeneratePath = (model: unknown) => {
  const modelId = normalizeModelId(model);
  if (modelId.startsWith('seedance')) return '/seedance/generate';
  if (modelId.startsWith('grok')) return '/grok/generate';
  return '/video/generate';
};

export const getTstGeneratePath = (queueKind: string, providerPayload?: Record<string, unknown>) => {
  switch (queueKind) {
    case 'image_generate':
      return '/image/generate';
    case 'video_generate':
      return getTstVideoGeneratePath(providerPayload?.model);
    case 'motion_generate':
      return '/motion/generate';
    default:
      throw new Error(`Unsupported queue kind: ${queueKind}`);
  }
};

