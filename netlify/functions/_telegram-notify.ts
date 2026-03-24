import { createClient } from '@supabase/supabase-js';

type QueuePayloadObject = Record<string, unknown> | null | undefined;

type JobNotificationEvent = 'queued' | 'completed' | 'failed';

type JobNotificationRecord = {
  id: string;
  userId: string;
  prompt?: string | null;
  assetType?: string | null;
  toolId?: string | null;
  toolName?: string | null;
  engine?: string | null;
  queueKind?: string | null;
  costVcoin?: number | null;
  createdAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
  resultUrl?: string | null;
  queuePayload?: QueuePayloadObject;
};

type NotificationUserProfile = {
  email?: string | null;
  display_name?: string | null;
};

const getEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
};

const notifyWebhookUrl = getEnv('TELEGRAM_NOTIFY_WEBHOOK_URL');
const notifyWebhookSecret = getEnv('TELEGRAM_NOTIFY_WEBHOOK_SECRET');
const supabaseUrl = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

const isHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const pushUrl = (collector: Set<string>, value: unknown) => {
  if (isHttpUrl(value)) {
    collector.add(value.trim());
  }
};

const extractInputMedia = (payload: QueuePayloadObject) => {
  const inputUrls = new Set<string>();
  const raw = payload && typeof payload === 'object' ? payload : {};

  pushUrl(inputUrls, raw.sampleImage);
  pushUrl(inputUrls, raw.styleImage);
  pushUrl(inputUrls, raw.sourceImage);
  pushUrl(inputUrls, raw.keyframeImage);
  pushUrl(inputUrls, raw.characterImage);

  for (const key of ['characterImages', 'referenceImages', '__uploadSources'] as const) {
    const values = raw[key];
    if (Array.isArray(values)) {
      values.forEach((value) => pushUrl(inputUrls, value));
    }
  }

  pushUrl(inputUrls, raw.motionVideoDataUrl);

  return [...inputUrls];
};

const inferMode = (toolId: string | null | undefined, payload: QueuePayloadObject) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const recipeType = String(raw.recipeType || '').trim().toLowerCase();
  const characterCount = Number(raw.characterCount || 0);

  if (recipeType === 'motion_generate_recipe_v1') return 'motion_control';
  if (recipeType === 'video_generate_recipe_v1') return 'video_ai';
  if (recipeType === 'image_edit_recipe_v1') return String(toolId || 'image_edit');

  if (recipeType === 'image_generate_recipe_v1') {
    if (characterCount >= 4) return 'group4';
    if (characterCount === 3) return 'group3';
    if (characterCount === 2) return 'couple';
    return 'single';
  }

  return String(toolId || '').trim() || null;
};

const getConfigSummary = (payload: QueuePayloadObject, toolId?: string | null) => {
  const raw = payload && typeof payload === 'object' ? payload : {};

  return {
    recipeType: String(raw.recipeType || '').trim() || null,
    modelId: String(raw.modelId || '').trim() || null,
    mode: inferMode(toolId, raw),
    resolution: String(raw.resolution || '').trim() || null,
    speed: String(raw.speed || '').trim() || null,
    serverId: String(raw.serverId || '').trim() || null,
    aspectRatio: String(raw.aspectRatio || '').trim() || null,
    duration: String(raw.duration || '').trim() || null,
    audio: typeof raw.audio === 'boolean' ? raw.audio : null,
    characterCount: Number.isFinite(Number(raw.characterCount)) ? Number(raw.characterCount) : null,
  };
};

const getUserProfile = async (userId: string): Promise<NotificationUserProfile | null> => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await admin
    .from('users')
    .select('email, display_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[telegram-notify] Failed to load user profile:', error);
    return null;
  }

  return data;
};

const postNotification = async (body: Record<string, unknown>) => {
  if (!notifyWebhookUrl || !notifyWebhookSecret) {
    return;
  }

  const response = await fetch(notifyWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-notify-secret': notifyWebhookSecret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Notification webhook failed: ${response.status} ${text || response.statusText}`);
  }
};

export const sendTelegramJobNotification = async (
  eventType: JobNotificationEvent,
  record: JobNotificationRecord,
) => {
  if (!notifyWebhookUrl || !notifyWebhookSecret) {
    return;
  }

  try {
    const userProfile = await getUserProfile(record.userId);
    const config = getConfigSummary(record.queuePayload, record.toolId);
    const inputUrls = extractInputMedia(record.queuePayload);

    await postNotification({
      eventType,
      app: 'Audition AI',
      job: {
        id: record.id,
        userId: record.userId,
        displayName: userProfile?.display_name || null,
        email: userProfile?.email || null,
        prompt: record.prompt || '',
        assetType: record.assetType || 'image',
        toolId: record.toolId || null,
        toolName: record.toolName || null,
        engine: record.engine || null,
        queueKind: record.queueKind || null,
        costVcoin: Number(record.costVcoin || 0),
        status: eventType === 'queued' ? 'queued' : eventType,
        createdAt: record.createdAt || new Date().toISOString(),
        finishedAt: record.finishedAt || null,
        errorMessage: record.errorMessage || null,
        resultUrl: isHttpUrl(record.resultUrl) ? record.resultUrl : null,
        config,
      },
      media: {
        inputUrls,
        outputUrl: isHttpUrl(record.resultUrl) ? record.resultUrl : null,
      },
    });
  } catch (error) {
    console.warn('[telegram-notify] Failed to send notification:', error);
  }
};

export const fireTelegramJobNotification = (
  eventType: JobNotificationEvent,
  record: JobNotificationRecord,
) => {
  void sendTelegramJobNotification(eventType, record);
};
