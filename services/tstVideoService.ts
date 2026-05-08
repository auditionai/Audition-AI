import { optimizePayload } from '../utils/imageProcessor';

const TST_IMAGE_UPLOAD_MAX_WIDTH = 1280;
const TST_VIDEO_AND_MOTION_POLL_INTERVAL_MS = 10 * 60 * 1000;
const TST_DEFAULT_TIMEOUT_MS = 120 * 60 * 1000;

const cleanBase64 = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, '');
const isHttpUrl = (value: unknown) => /^https?:\/\//i.test(String(value || '').trim());

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    return data?.error || data?.detail?.error?.message || data?.detail || data?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const extractJobId = (data: any): string | null => {
  const value = data?.job_id || data?.jobId || data?.id || data?.data?.job_id || data?.data?.jobId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const extractResultUrl = (data: any): string | null => {
  if (typeof data?.result === 'string' && data.result.trim()) {
    return data.result.trim();
  }

  if (Array.isArray(data?.result) && typeof data.result[0] === 'string' && data.result[0].trim()) {
    return data.result[0].trim();
  }

  if (typeof data?.output === 'string' && data.output.trim()) {
    return data.output.trim();
  }

  if (typeof data?.data?.result === 'string' && data.data.result.trim()) {
    return data.data.result.trim();
  }

  return null;
};

const dataUrlToBlob = (dataUrl: string) => {
  const normalizedDataUrl = dataUrl.startsWith('data:') ? dataUrl : `data:image/jpeg;base64,${cleanBase64(dataUrl)}`;
  const [meta, base64Payload] = normalizedDataUrl.split(',');
  const mimeType = meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  const binary = atob(base64Payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

const resolveBlob = async (input: File | Blob | string, kind: 'image' | 'video') => {
  if (typeof input !== 'string') {
    return {
      blob: input,
      mimeType: input.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      filename: kind === 'video' ? 'video.mp4' : 'image.jpg',
    };
  }

  if (input.startsWith('http') || input.startsWith('blob:')) {
    const response = await fetch(input);
    const blob = await response.blob();
    return {
      blob,
      mimeType: blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      filename: kind === 'video' ? 'video.mp4' : 'image.jpg',
    };
  }

  const optimizedDataUrl =
    kind === 'image'
      ? await optimizePayload(input.startsWith('data:') ? input : `data:image/jpeg;base64,${cleanBase64(input)}`, TST_IMAGE_UPLOAD_MAX_WIDTH)
      : input;
  const blob = dataUrlToBlob(optimizedDataUrl);
  const extension = blob.type.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg');

  return {
    blob,
    mimeType: blob.type,
    filename: `${kind}.${extension}`,
  };
};

const uploadMedia = async (
  input: File | Blob | string,
  kind: 'image' | 'video',
  onLog: (message: string) => void,
): Promise<string> => {
  onLog(kind === 'video' ? 'Uploading motion video...' : 'Uploading reference image...');
  const { blob, filename } = await resolveBlob(input, kind);
  const formData = new FormData();
  formData.append('file', blob, filename);

  const response = await fetch(kind === 'video' ? '/api/tst-upload-video' : '/api/tst-upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  const url = data?.url || data?.data?.url;
  if (!url) {
    throw new Error(`Upload response missing URL: ${JSON.stringify(data)}`);
  }

  return String(url);
};

const submitJob = async (endpoint: string, payload: Record<string, unknown>, onLog: (message: string) => void) => {
  onLog('Submitting job to Trạm Sáng Tạo...');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  const jobId = extractJobId(data);

  if (!jobId) {
    throw new Error(`TST did not return job_id: ${JSON.stringify(data)}`);
  }

  onLog(`Job created (${jobId})`);
  return jobId;
};

export const prepareTramsangtaoVideoJob = async ({
  prompt,
  modelId,
  duration,
  resolution,
  aspectRatio,
  speed,
  serverId,
  keyframe,
  audio,
  onLog = () => {},
}: {
  prompt: string;
  modelId: string;
  duration: string;
  resolution?: string;
  aspectRatio?: string;
  speed?: string;
  serverId?: string;
  keyframe?: File | Blob | string | null;
  audio?: boolean;
  onLog?: (message: string) => void;
}): Promise<Record<string, unknown>> => {
  const payload: Record<string, unknown> = {
    prompt,
    model: modelId,
    duration,
  };

  if (resolution) payload.resolution = resolution.toLowerCase();
  if (aspectRatio) payload.aspect_ratio = aspectRatio;
  if (speed) payload.speed = speed;
  if (serverId) payload.server_id = serverId;
  if (typeof audio === 'boolean') payload.audio = audio;

  if (keyframe) {
    const keyframeUrl = typeof keyframe === 'string' && isHttpUrl(keyframe)
      ? keyframe.trim()
      : await uploadMedia(keyframe, 'image', onLog);
    payload.img_url = keyframeUrl;
    payload.image_url = keyframeUrl;
    if (modelId === 'kling-2.5-turbo') {
      payload.mode = 'i2v';
    }
  }

  return payload;
};

export const prepareTramsangtaoMotionJob = async ({
  modelId,
  characterImage,
  motionVideo,
  prompt,
  resolution,
  speed,
  serverId,
  onLog = () => {},
}: {
  modelId: string;
  characterImage: File | Blob | string;
  motionVideo: File | Blob | string;
  prompt?: string;
  resolution?: string;
  speed?: string;
  serverId?: string;
  onLog?: (message: string) => void;
}): Promise<Record<string, unknown>> => {
  const [characterImageUrl, motionVideoUrl] = await Promise.all([
    uploadMedia(characterImage, 'image', onLog),
    uploadMedia(motionVideo, 'video', onLog),
  ]);

  const payload: Record<string, unknown> = {
    model: modelId,
    mode: modelId,
    character_image_url: characterImageUrl,
    motion_video_url: motionVideoUrl,
  };

  if (prompt?.trim()) payload.prompt = prompt.trim();
  if (resolution) payload.resolution = resolution.toLowerCase();
  if (speed) payload.speed = speed;
  if (serverId) payload.server_id = serverId;

  return payload;
};

const pollJob = async (
  jobId: string,
  onLog: (message: string) => void,
  {
    timeoutMs = TST_DEFAULT_TIMEOUT_MS,
    pollIntervalMs = TST_VIDEO_AND_MOTION_POLL_INTERVAL_MS,
  }: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<string> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const response = await fetch(`/api/tst-poll?jobId=${encodeURIComponent(jobId)}`);

    if (!response.ok) {
      onLog(`Polling retry: ${await parseErrorMessage(response)}`);
      continue;
    }

    const data = await response.json();
    const status = String(data?.status || 'unknown').toLowerCase();
    const progress = typeof data?.progress === 'number' ? data.progress : 0;

    onLog(`Job status: ${data?.status || 'unknown'} (${progress}%)`);

    if (status === 'completed') {
      const resultUrl = extractResultUrl(data);
      if (!resultUrl) {
        throw new Error(`Job completed but no result URL returned: ${JSON.stringify(data)}`);
      }
      return resultUrl;
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') {
      throw new Error(data?.error || data?.message || 'Job failed');
    }
  }

  throw new Error(`Timeout waiting for job after ${Math.ceil(timeoutMs / 1000)} seconds`);
};

export const runTramsangtaoVideoGenerate = async ({
  prompt,
  modelId,
  duration,
  resolution,
  aspectRatio,
  speed,
  serverId,
  keyframe,
  audio,
  onLog = () => {},
  timeoutMs = TST_DEFAULT_TIMEOUT_MS,
}: {
  prompt: string;
  modelId: string;
  duration: string;
  resolution?: string;
  aspectRatio?: string;
  speed?: string;
  serverId?: string;
  keyframe?: File | Blob | string | null;
  audio?: boolean;
  onLog?: (message: string) => void;
  timeoutMs?: number;
}): Promise<{ jobId: string; resultPromise: Promise<string> }> => {
  const payload = await prepareTramsangtaoVideoJob({
    prompt,
    modelId,
    duration,
    resolution,
    aspectRatio,
    speed,
    serverId,
    keyframe,
    audio,
    onLog,
  });

  const jobId = await submitJob('/api/tst-video-generate', payload, onLog);
  return {
    jobId,
    resultPromise: pollJob(jobId, onLog, {
      timeoutMs,
      pollIntervalMs: TST_VIDEO_AND_MOTION_POLL_INTERVAL_MS,
    }),
  };
};

export const runTramsangtaoMotionGenerate = async ({
  modelId,
  characterImage,
  motionVideo,
  prompt,
  resolution,
  speed,
  serverId,
  onLog = () => {},
  timeoutMs = TST_DEFAULT_TIMEOUT_MS,
}: {
  modelId: string;
  characterImage: File | Blob | string;
  motionVideo: File | Blob | string;
  prompt?: string;
  resolution?: string;
  speed?: string;
  serverId?: string;
  onLog?: (message: string) => void;
  timeoutMs?: number;
}): Promise<{ jobId: string; resultPromise: Promise<string> }> => {
  const payload = await prepareTramsangtaoMotionJob({
    modelId,
    characterImage,
    motionVideo,
    prompt,
    resolution,
    speed,
    serverId,
    onLog,
  });

  const jobId = await submitJob('/api/tst-motion-generate', payload, onLog);
  return {
    jobId,
    resultPromise: pollJob(jobId, onLog, {
      timeoutMs,
      pollIntervalMs: TST_VIDEO_AND_MOTION_POLL_INTERVAL_MS,
    }),
  };
};
