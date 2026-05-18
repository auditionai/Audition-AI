export type VideoScriptDirectorOptions = {
  style?: string;
  theme?: string;
  soundMood?: string;
  voiceDialogue?: boolean;
  trendEdit?: boolean;
  textOverlay?: boolean;
  targetModel?: string;
};

const MAX_DIRECTOR_REQUEST_CHARS = 2_200_000;
const DIRECTOR_IMAGE_MAX_SIDE = 1024;
const DIRECTOR_IMAGE_QUALITY = 0.78;

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Khong the doc anh tham chieu de tao kich ban.'));
    image.src = source;
  });

export const compressDataImageForDirector = async (source: string) => {
  if (!source.startsWith('data:image/')) return source;

  try {
    const image = await loadImage(source);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const maxSide = Math.max(naturalWidth, naturalHeight);
    if (!maxSide) return source;

    const scale = Math.min(1, DIRECTOR_IMAGE_MAX_SIDE / maxSide);
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return source;

    context.drawImage(image, 0, 0, width, height);
    const compressed = canvas.toDataURL('image/jpeg', DIRECTOR_IMAGE_QUALITY);
    return compressed.length < source.length ? compressed : source;
  } catch {
    return source;
  }
};

const parseResponsePayload = async (response: Response) => {
  const raw = await response.text().catch(() => '');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const looksLikeHtml = /<!doctype html|<html[\s>]/i.test(raw);
    return {
      raw: looksLikeHtml
        ? `Video script director gateway error (${response.status}). Vui lòng thử lại sau ít phút.`
        : raw.slice(0, 700),
    };
  }
};

const getPayloadError = (payload: any, response: Response) =>
  payload?.error ||
  payload?.message ||
  payload?.detail ||
  payload?.raw ||
  `Khong the goi video-script-director (${response.status} ${response.statusText || ''}).`;

export const generateVideoScriptWithVertex = async ({
  imageSource,
  durationSeconds,
  userPrompt,
  scriptOptions,
}: {
  imageSource: string;
  durationSeconds: number | string;
  userPrompt?: string;
  scriptOptions?: VideoScriptDirectorOptions;
}) => {
  const preparedImageSource = await compressDataImageForDirector(imageSource);
  const requestBody = JSON.stringify({
    imageSource: preparedImageSource,
    durationSeconds,
    userPrompt: userPrompt || '',
    scriptOptions: scriptOptions || {},
  });

  if (requestBody.length > MAX_DIRECTOR_REQUEST_CHARS) {
    throw new Error('Anh tham chieu qua lon nen khong the gui len Vertex AI de tao kich ban. Vui long dung anh nho hon hoac anh da nen.');
  }

  const endpoints = ['/api/video-script-director', '/.netlify/functions/video-script-director'];
  let response: Response | null = null;
  let payload: any = {};

  for (const endpoint of endpoints) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: AbortSignal.timeout(75_000),
    });

    payload = await parseResponsePayload(response);

    if (response.status === 404 && endpoint !== endpoints[endpoints.length - 1]) {
      continue;
    }

    break;
  }

  if (!response) {
    throw new Error('Khong the ket noi den video-script-director.');
  }

  if (!response.ok) {
    throw new Error(getPayloadError(payload, response));
  }

  const script = typeof payload?.script === 'string' ? payload.script.trim() : '';
  if (!script) {
    throw new Error('Vertex AI khong tra ve kich ban video.');
  }

  return script;
};
