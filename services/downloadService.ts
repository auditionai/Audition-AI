import { trackEvent } from './analyticsService';

const dataUrlToBlob = (dataUrl: string) => {
  const [header, body] = dataUrl.split(',', 2);
  const mimeType = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const downloadBlob = (blob: Blob, filename: string) => {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
};

const triggerBrowserDownload = (href: string, filename: string) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadAssetToBrowser = async (url: string, filename: string) => {
  if (!url) {
    throw new Error('Missing asset URL');
  }

  let blob: Blob;

  if (url.startsWith('data:')) {
    blob = dataUrlToBlob(url);
  } else if (url.startsWith('blob:')) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to read local blob: ${response.status}`);
    }
    blob = await response.blob();
  } else {
    const proxyUrl = `/api/download-proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    triggerBrowserDownload(proxyUrl, filename);
    trackEvent('asset_download', {
      source_type: 'remote',
      file_extension: filename.split('.').pop()?.toLowerCase() || 'unknown',
    });
    return;
  }

  downloadBlob(blob, filename);
  trackEvent('asset_download', {
    source_type: url.startsWith('data:') ? 'data_url' : 'blob_url',
    file_extension: filename.split('.').pop()?.toLowerCase() || 'unknown',
  });
};
