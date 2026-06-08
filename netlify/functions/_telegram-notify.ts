import { createClient } from '@supabase/supabase-js';
import type { QueueNotificationMediaEntry } from '../../shared/queueRecipes';

type QueuePayloadObject = Record<string, unknown> | null | undefined;

type JobNotificationEvent = 'queued' | 'completed' | 'failed';

type JobNotificationRecord = {
  id: string;
  userId: string;
  providerJobId?: string | null;
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

type NotificationMediaEntry = QueueNotificationMediaEntry;
type TelegramNotificationEventState = Partial<Record<JobNotificationEvent, string>>;
type OperationalAlertOptions = {
  alertKey?: string;
  cooldownMs?: number;
  severity?: 'info' | 'warning' | 'error';
};

const OPERATIONAL_ALERT_STATE_KEY = 'telegram_operational_alert_state';
const OPERATIONAL_ALERT_DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

const toPayloadObject = (payload: unknown): Record<string, unknown> =>
  payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {};

const getEmbeddedRecipePayload = (payload: QueuePayloadObject): Record<string, unknown> => {
  const raw = toPayloadObject(payload);
  return raw.__recipePayload && typeof raw.__recipePayload === 'object'
    ? { ...(raw.__recipePayload as Record<string, unknown>) }
    : {};
};

const getRecipeAwarePayload = (payload: QueuePayloadObject) => {
  const raw = toPayloadObject(payload);
  const recipe = getEmbeddedRecipePayload(payload);
  return Object.keys(recipe).length > 0 ? recipe : raw;
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

const pushInputMedia = (
  collector: Map<string, NotificationMediaEntry>,
  value: unknown,
  role: NotificationMediaEntry['role'],
  kind: NotificationMediaEntry['kind'] = 'image',
  userProvided = true,
) => {
  if (isHttpUrl(value)) {
    const url = value.trim();
    collector.set(url, {
      url,
      role,
      kind,
      userProvided,
    });
  }
};

const extractInputMedia = (payload: QueuePayloadObject) => {
  const inputMedia = new Map<string, NotificationMediaEntry>();
  const raw = toPayloadObject(payload);
  const recipePayload = getEmbeddedRecipePayload(payload);
  const source = Object.keys(recipePayload).length > 0 ? recipePayload : raw;

  const explicit = Array.isArray(raw.__notifyInputMedia)
    ? raw.__notifyInputMedia
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const url = typeof (entry as NotificationMediaEntry).url === 'string'
            ? (entry as NotificationMediaEntry).url.trim()
            : '';
          if (!url || !isHttpUrl(url)) return null;
          return {
            url,
            role: typeof (entry as NotificationMediaEntry).role === 'string'
              ? (entry as NotificationMediaEntry).role
              : 'reference',
            kind: (entry as NotificationMediaEntry).kind === 'video' ? 'video' : 'image',
            userProvided: (entry as NotificationMediaEntry).userProvided !== false,
          } as NotificationMediaEntry;
        })
        .filter((entry): entry is NotificationMediaEntry => Boolean(entry))
    : [];

  if (explicit.length > 0) {
    explicit.forEach((entry) => inputMedia.set(entry.url, entry));
  } else {
    pushInputMedia(inputMedia, source.sampleImage, 'sample', 'image', true);
    pushInputMedia(inputMedia, source.styleImage, 'style', 'image', false);
    pushInputMedia(inputMedia, source.sourceImage, 'source', 'image', true);
    pushInputMedia(inputMedia, source.keyframeImage, 'keyframe', 'image', true);
    pushInputMedia(inputMedia, source.characterImage, 'character', 'image', true);

    for (const key of ['characterImages', 'referenceImages', '__uploadSources'] as const) {
      const values = source[key];
      if (Array.isArray(values)) {
        values.forEach((value) => pushInputMedia(inputMedia, value, key === 'characterImages' ? 'character' : 'reference', 'image', true));
      }
    }

    pushInputMedia(inputMedia, source.motionVideoDataUrl, 'motion', 'video', true);
  }

  return [...inputMedia.values()];
};

const inferMode = (toolId: string | null | undefined, payload: QueuePayloadObject) => {
  const raw = getRecipeAwarePayload(payload);
  const recipeType = String(raw.recipeType || '').trim().toLowerCase();
  const characterCount = Number(raw.characterCount || 0);

  if (recipeType === 'motion_generate_recipe_v1') return 'motion_control';
  if (recipeType === 'video_generate_recipe_v1') return 'video_ai';
  if (recipeType === 'image_edit_recipe_v1') return String(toolId || 'image_edit');

  if (recipeType === 'image_generate_recipe_v1') {
    if (characterCount >= 5) return 'group5';
    if (characterCount === 4) return 'group4';
    if (characterCount === 3) return 'group3';
    if (characterCount === 2) return 'couple';
    return 'single';
  }

  return String(toolId || '').trim() || null;
};

const getConfigSummary = (payload: QueuePayloadObject, toolId?: string | null) => {
  const raw = toPayloadObject(payload);
  const source = getRecipeAwarePayload(payload);

  return {
    recipeType: String(source.recipeType || '').trim() || null,
    modelId: String(source.modelId || raw.modelId || raw.model || '').trim() || null,
    mode: inferMode(toolId, payload),
    resolution: String(source.resolution || raw.resolution || '').trim() || null,
    speed: String(source.speed || raw.speed || '').trim() || null,
    serverId: String(source.serverId || raw.serverId || raw.server_id || '').trim() || null,
    aspectRatio: String(source.aspectRatio || raw.aspectRatio || raw.aspect_ratio || '').trim() || null,
    duration: String(source.duration || raw.duration || '').trim() || null,
    audio: typeof source.audio === 'boolean' ? source.audio : (typeof raw.audio === 'boolean' ? raw.audio : null),
    characterCount: Number.isFinite(Number(source.characterCount)) ? Number(source.characterCount) : null,
  };
};

const getDisplayToolName = (
  toolName: string | null | undefined,
  queueKind: string | null | undefined,
  config: ReturnType<typeof getConfigSummary>,
) => {
  if (queueKind === 'image_generate') {
    if (config.mode === 'couple') return 'Couple 3D Mode';
    if (config.mode === 'group3') return 'Squad of 3';
    if (config.mode === 'group4') return 'Clan of 4';
    if (config.mode === 'group5') return 'Group of 5';
    if (config.mode === 'single') return 'Single 3D Character';
  }

  if (queueKind === 'motion_generate' && config.mode === 'motion_control') {
    return 'Motion Control';
  }

  if (queueKind === 'video_generate' && config.mode === 'video_ai') {
    return 'Video AI';
  }

  return String(toolName || '').trim() || null;
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

const getAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const buildNotificationSignature = (
  eventType: JobNotificationEvent,
  record: JobNotificationRecord,
) => {
  if (eventType === 'failed') {
    return String(record.errorMessage || '').trim() || 'failed';
  }
  if (eventType === 'completed') {
    return String(record.resultUrl || '').trim() || 'completed';
  }
  return 'queued';
};

const shouldSkipDuplicateNotification = async (
  eventType: JobNotificationEvent,
  record: JobNotificationRecord,
) => {
  const admin = getAdminClient();
  if (!admin || !record.id) {
    return false;
  }

  const { data, error } = await admin
    .from('generated_images')
    .select('queue_payload')
    .eq('id', record.id)
    .maybeSingle();

  if (error) {
    console.warn('[telegram-notify] Failed to inspect notification state:', error);
    return false;
  }

  const queuePayload =
    data?.queue_payload && typeof data.queue_payload === 'object'
      ? { ...(data.queue_payload as Record<string, unknown>) }
      : {};

  const currentState =
    queuePayload.__telegramNotifications &&
    typeof queuePayload.__telegramNotifications === 'object'
      ? (queuePayload.__telegramNotifications as TelegramNotificationEventState)
      : {};

  const signature = buildNotificationSignature(eventType, record);
  if (currentState[eventType] === signature) {
    return true;
  }

  const nextPayload = {
    ...queuePayload,
    __telegramNotifications: {
      ...currentState,
      [eventType]: signature,
    },
  };

  const { error: updateError } = await admin
    .from('generated_images')
    .update({
      queue_payload: nextPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', record.id);

  if (updateError) {
    console.warn('[telegram-notify] Failed to persist notification state:', updateError);
  }

  return false;
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

const normalizeAlertKey = (value: string) =>
  String(value || 'operational-alert')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'operational-alert';

const buildOperationalAlertSignature = (title: string, details: Record<string, unknown>) => {
  try {
    return JSON.stringify({ title, details });
  } catch {
    return title;
  }
};

const shouldSkipDuplicateOperationalAlert = async (
  alertKey: string,
  signature: string,
  cooldownMs: number,
) => {
  const admin = getAdminClient();
  if (!admin) {
    return false;
  }

  const { data, error } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', OPERATIONAL_ALERT_STATE_KEY)
    .maybeSingle();

  if (error) {
    console.warn('[telegram-notify] Failed to load operational alert state:', error);
    return false;
  }

  const state = toPayloadObject(data?.value);
  const current = toPayloadObject(state[alertKey]);
  const lastSentAt = typeof current.sentAt === 'string' ? new Date(current.sentAt).getTime() : 0;
  const now = Date.now();

  if (
    current.signature === signature &&
    lastSentAt > 0 &&
    now - lastSentAt < Math.max(cooldownMs, 60_000)
  ) {
    return true;
  }

  const nextState = {
    ...state,
    [alertKey]: {
      signature,
      sentAt: new Date(now).toISOString(),
    },
  };

  const { error: upsertError } = await admin
    .from('system_settings')
    .upsert({ key: OPERATIONAL_ALERT_STATE_KEY, value: nextState }, { onConflict: 'key' });

  if (upsertError) {
    console.warn('[telegram-notify] Failed to persist operational alert state:', upsertError);
  }

  return false;
};

export const sendTelegramJobNotification = async (
  eventType: JobNotificationEvent,
  record: JobNotificationRecord,
) => {
  if (eventType === 'queued') {
    return;
  }

  if (!notifyWebhookUrl || !notifyWebhookSecret) {
    return;
  }

  try {
    if (await shouldSkipDuplicateNotification(eventType, record)) {
      return;
    }

    const userProfile = await getUserProfile(record.userId);
    const config = getConfigSummary(record.queuePayload, record.toolId);
    const displayToolName = getDisplayToolName(record.toolName, record.queueKind, config);
    const inputMedia = extractInputMedia(record.queuePayload);
    const inputUrls = inputMedia.map((entry) => entry.url);

    await postNotification({
      eventType,
      app: 'Audition AI',
      job: {
        id: record.id,
        providerJobId: record.providerJobId || null,
        userId: record.userId,
        displayName: userProfile?.display_name || null,
        email: userProfile?.email || null,
        prompt: record.prompt || '',
        assetType: record.assetType || 'image',
        toolId: record.toolId || null,
        toolName: displayToolName,
        engine: record.engine || null,
        queueKind: record.queueKind || null,
        costVcoin: Number(record.costVcoin || 0),
        status: eventType,
        createdAt: record.createdAt || new Date().toISOString(),
        finishedAt: record.finishedAt || null,
        errorMessage: record.errorMessage || null,
        resultUrl: isHttpUrl(record.resultUrl) ? record.resultUrl : null,
        config,
      },
      media: {
        inputMedia,
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
  if (eventType === 'queued') {
    return;
  }

  void sendTelegramJobNotification(eventType, record);
};

export const sendTelegramOperationalAlert = async (
  title: string,
  details: Record<string, unknown> = {},
  options: OperationalAlertOptions = {},
) => {
  if (!notifyWebhookUrl || !notifyWebhookSecret) {
    return;
  }

  try {
    const alertKey = normalizeAlertKey(options.alertKey || title);
    const signature = buildOperationalAlertSignature(title, details);
    const cooldownMs = Number.isFinite(options.cooldownMs)
      ? Number(options.cooldownMs)
      : OPERATIONAL_ALERT_DEFAULT_COOLDOWN_MS;

    if (await shouldSkipDuplicateOperationalAlert(alertKey, signature, cooldownMs)) {
      return;
    }

    await postNotification({
      eventType: 'queue_alert',
      app: 'Audition AI',
      alert: {
        title,
        details,
        severity: options.severity || 'warning',
        key: alertKey,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn('[telegram-notify] Failed to send operational alert:', error);
  }
};
