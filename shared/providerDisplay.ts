export const sanitizeProviderDisplayText = (value?: string | null) => {
  if (!value) return '';

  return String(value)
    .replace(/GOMMO_ERROR/gi, 'PROVIDER_ERROR')
    .replace(/GOMMO_/gi, 'PROVIDER_')
    .replace(/\bGOMMO\b/gi, 'dịch vụ AI')
    .replace(/\bTST\b/gi, 'dịch vụ AI');
};
