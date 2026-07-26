const configuredModel = (name: string, fallback: string) => {
  const value = process.env[name]?.trim();
  return value || fallback;
};

// Canonical model map shared by Netlify Functions and the Render queue worker.
// Deployment environments can override a model without requiring a source edit.
export const VERTEX_TEXT_FLASH_MODEL = configuredModel(
  'VERTEX_TEXT_FLASH_MODEL',
  'gemini-3-flash-preview',
);
export const VERTEX_TEXT_PRO_MODEL = configuredModel(
  'VERTEX_TEXT_PRO_MODEL',
  'gemini-3.1-pro-preview',
);
export const VERTEX_IMAGE_FLASH_MODEL = configuredModel(
  'VERTEX_IMAGE_FLASH_MODEL',
  'gemini-3.1-flash-image',
);
export const VERTEX_IMAGE_PRO_MODEL = configuredModel(
  'VERTEX_IMAGE_PRO_MODEL',
  'gemini-3-pro-image-preview',
);

export const buildVertexGenerateContentUrl = (
  projectId: string,
  model: string,
  location = 'global',
) =>
  `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
  `/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}` +
  ':generateContent';
