import { getSupabaseAuthHeader } from './supabaseClient';

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

export const generateVideoScriptWithGrok = async ({
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
  const authHeader = await getSupabaseAuthHeader();
  const requestBody = JSON.stringify({
    imageSource: preparedImageSource,
    durationSeconds,
    userPrompt: userPrompt || '',
    scriptOptions: scriptOptions || {},
  });

  if (requestBody.length > MAX_DIRECTOR_REQUEST_CHARS) {
    throw new Error('Anh tham chieu qua lon nen khong the gui len Grok de tao kich ban. Vui long dung anh nho hon hoac anh da nen.');
  }

  const submitResponse = await fetch('/api/video-script-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: requestBody,
    signal: AbortSignal.timeout(20_000),
  });
  const submitPayload = await parseResponsePayload(submitResponse);
  if (!submitResponse.ok || !submitPayload?.jobId) throw new Error(getPayloadError(submitPayload, submitResponse));

  const deadline = Date.now() + 10 * 60_000;
  let pollDelayMs = 2_000;
  while (Date.now() < deadline) {
    // Back off while Grok works; a hidden tab should not keep hammering
    // Supabase/Netlify and will catch up as soon as it becomes visible again.
    const hiddenMultiplier = typeof document !== 'undefined' && document.hidden ? 3 : 1;
    await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs * hiddenMultiplier));
    const statusResponse = await fetch(`/api/video-script-status?id=${encodeURIComponent(submitPayload.jobId)}`, { headers: authHeader, signal: AbortSignal.timeout(20_000) });
    const statusPayload = await parseResponsePayload(statusResponse);
    if (!statusResponse.ok) throw new Error(getPayloadError(statusPayload, statusResponse));
    if (statusPayload.status === 'completed' && typeof statusPayload.script === 'string' && statusPayload.script.trim()) return statusPayload.script.trim();
    if (statusPayload.status === 'failed') throw new Error(String(statusPayload.error || 'Grok khong tao duoc kich ban video.'));
    pollDelayMs = Math.min(20_000, Math.round(pollDelayMs * 1.7));
  }
  throw new Error('Grok dang xu ly lau hon du kien. Vui long mo Lai lich su sau it phut de kiem tra ket qua.');
};

/** @deprecated Use generateVideoScriptWithGrok. */
export const generateVideoScriptWithVertex = generateVideoScriptWithGrok;
