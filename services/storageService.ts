
import { GeneratedImage } from '../types';
import type { QueueProgressLogEntry } from '../shared/queueRecipes';
import { normalizeQueueProgressLogs, repairVietnameseMojibake } from '../shared/queueLogText';
import { classifyQueueError, isTerminalRescueFailureMessage, normalizeQueueErrorMessage, pickQueueFailureMessage } from '../shared/queueErrorClassifier';
import { hasFailedRescuePending } from '../shared/queueRescueState';
import { isDirectImageEditQueueKind } from '../shared/queueKinds';
import { getSupabaseAuthHeader, getSupabaseUser, supabase } from './supabaseClient';
import { getUserProfile } from './economyService';
import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const DB_NAME = 'DMP_AI_Studio_DB';
const STORE_NAME = 'images';
const TABLE_NAME = 'generated_images';
const HISTORY_RETENTION_DAYS = 30;
const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const GALLERY_HISTORY_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVE_GALLERY_CLIENT_CACHE_TTL_MS = 8_000;
const IDLE_GALLERY_CLIENT_CACHE_TTL_MS = 120_000;
const GALLERY_API_TIMEOUT_MS = 12_000;
const GENERATED_IMAGE_ROW_SELECT = 'id, image_url, prompt, created_at, updated_at, asset_type, queue_kind, tool_id, tool_name, model_used, is_public, user_id, user_name, status, job_id, progress, queue_payload, error_message, cost_vcoin';
const GENERATED_IMAGE_ROW_LIGHT_SELECT = 'id, image_url, prompt, created_at, updated_at, asset_type, queue_kind, tool_id, tool_name, model_used, is_public, user_id, user_name, status, job_id, progress, error_message, cost_vcoin';
const GENERATED_IMAGE_ROW_RECOVERY_SELECT = 'id, image_url, created_at, updated_at, asset_type, queue_kind, tool_id, tool_name, model_used, is_public, user_id, user_name, status, job_id, progress, error_message, cost_vcoin';

// --- CLOUDFLARE R2 CONFIGURATION ---
// Helper to get Env Var from either Vite's import.meta.env or process.env shim
const getEnv = (key: string) => {
    // Priority 1: Vite Environment
    const viteEnv = (import.meta as any).env?.[key];
    if (viteEnv) return viteEnv;
    
    // Priority 2: Process Env (if injected differently)
    try {
        return process.env[key];
    } catch (e) {
        return undefined;
    }
};

const R2_ENDPOINT = getEnv('VITE_R2_ENDPOINT');
const R2_ACCESS_KEY_ID = getEnv('VITE_R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = getEnv('VITE_R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = getEnv('VITE_R2_BUCKET_NAME');
const R2_PUBLIC_URL = getEnv('VITE_R2_PUBLIC_URL'); 

let r2Client: S3Client | null = null;
let galleryFetchPromise: Promise<GeneratedImage[]> | null = null;
let galleryFetchCache: { userId: string; expiresAt: number; images: GeneratedImage[] } | null = null;

const shouldShowInGenerationHistory = (image: Pick<GeneratedImage, 'queueKind' | 'showInGenerationHistory'>) => {
    if (!isDirectImageEditQueueKind(image.queueKind)) {
        return true;
    }

    return image.showInGenerationHistory === true;
};

const excludeDirectEditHistory = (images: GeneratedImage[]) =>
    images.filter((image) => shouldShowInGenerationHistory(image));

export const invalidateGalleryCache = () => {
    galleryFetchPromise = null;
    galleryFetchCache = null;
};

export const subscribeToGeneratedImagesRealtime = ({
    userId,
    onEvent,
}: {
    userId: string;
    onEvent: () => void;
}) => {
    if (!supabase || !userId) {
        return () => {};
    }

    const channel = supabase
        .channel(`generated-images:${userId}:${Date.now()}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: TABLE_NAME,
                filter: `user_id=eq.${userId}`,
            },
            () => {
                invalidateGalleryCache();
                onEvent();
            },
        )
        .subscribe((status: string) => {
            if (status === 'CHANNEL_ERROR') {
                console.warn('[Storage] Realtime subscription failed for generated_images.');
            }
        });

    return () => {
        void supabase.removeChannel(channel);
    };
};

// Debug Log on Init
console.log("[System] R2 Config Check:", {
    hasEndpoint: !!R2_ENDPOINT,
    hasKeyId: !!R2_ACCESS_KEY_ID,
    hasSecret: !!R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET_NAME
});

if (R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    try {
        r2Client = new S3Client({
            region: "auto",
            endpoint: R2_ENDPOINT,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });
        console.log("[System] R2 Storage Client Initialized");
    } catch (e) {
        console.error("Failed to init R2 Client", e);
    }
} else {
    console.warn("[System] R2 Config Missing. Please ensure Env Vars start with 'VITE_'. Falling back to Local/Supabase Storage.");
}

export const checkR2Connection = async (): Promise<boolean> => {
    // FIX: Do not make a network request (like ListBuckets) here.
    // Browsers block ListBuckets by default due to CORS policies, causing red errors in console.
    // We simply return true if the client was initialized with keys.
    return !!r2Client;
};

// --- INDEXED DB HELPERS (FALLBACK) ---
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const readLocalImages = async (): Promise<GeneratedImage[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result as GeneratedImage[];
      const mappedResults = results.map(img => ({
        ...img,
        toolName: mapEngineName(img.toolName),
        engine: mapEngineName(img.engine)
      }));
      resolve(excludeDirectEditHistory(mappedResults).sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
};

const saveLocalImage = async (image: GeneratedImage): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(image);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getSessionAuthHeader = async () => {
  return getSupabaseAuthHeader();
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const replaceLocalImagesForUser = async (userId: string, images: GeneratedImage[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    getAllRequest.onsuccess = () => {
      const existingImages = getAllRequest.result as GeneratedImage[];
      existingImages
        .filter((image) => image?.userId === userId)
        .forEach((image) => {
          store.delete(image.id);
        });

      images.forEach((image) => {
        store.put(image);
      });
    };

    getAllRequest.onerror = () => reject(getAllRequest.error);
  });
};

export const saveImageToLocalCache = async (image: GeneratedImage): Promise<void> => {
  const user = await getUserProfile();
  const imageWithUser = {
    ...image,
    updatedAt: image.updatedAt || Date.now(),
    userName: image.userName || user.username,
    userId: image.userId || user.id,
    isShared: image.isShared ?? false,
  };
  await saveLocalImage(imageWithUser);
};

const getVersionTimestamp = (image: GeneratedImage): number => image.updatedAt || image.timestamp || 0;
const isTerminalStatus = (status?: GeneratedImage['status']) => status === 'completed' || status === 'failed';

const mergeImageVersions = (cloudImage: GeneratedImage, localImage: GeneratedImage): GeneratedImage => {
  const cloudVersion = getVersionTimestamp(cloudImage);
  const localVersion = getVersionTimestamp(localImage);

  const cloudLooksMoreComplete =
    (!!cloudImage.url && !localImage.url) ||
    (cloudImage.status === 'completed' && localImage.status !== 'completed') ||
    (cloudImage.status === 'failed' && !isTerminalStatus(localImage.status));

  const preferCloud = cloudLooksMoreComplete || cloudVersion >= localVersion;
  const primary = preferCloud ? cloudImage : localImage;
  const secondary = preferCloud ? localImage : cloudImage;

  return {
    ...secondary,
    ...primary,
    assetType: primary.assetType || secondary.assetType,
    queueKind: primary.queueKind || secondary.queueKind,
    url: primary.url || secondary.url,
    prompt: primary.prompt || secondary.prompt,
    toolId: primary.toolId || secondary.toolId,
    toolName: primary.toolName || secondary.toolName,
    engine: primary.engine || secondary.engine,
    userName: primary.userName || secondary.userName,
    userId: primary.userId || secondary.userId,
    isShared: primary.isShared ?? secondary.isShared,
    cost: primary.cost ?? secondary.cost,
    progress: primary.progress ?? secondary.progress,
    error: primary.error || secondary.error,
    status: primary.status || secondary.status,
    jobId: primary.jobId ?? secondary.jobId,
    timestamp: primary.timestamp || secondary.timestamp,
    updatedAt: Math.max(cloudVersion, localVersion)
  };
};

const mergeCloudAndLocalImages = (cloudImages: GeneratedImage[], localImages: GeneratedImage[]): GeneratedImage[] => {
  const merged = new Map<string, GeneratedImage>();

  for (const image of cloudImages) {
    merged.set(image.id, image);
  }

  for (const localImage of localImages) {
    const existing = merged.get(localImage.id);
    if (!existing) {
      merged.set(localImage.id, localImage);
      continue;
    }

    merged.set(localImage.id, mergeImageVersions(existing, localImage));
  }

  return Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
};

const inferAssetType = (
  toolId?: string,
  modelUsed?: string,
  assetUrl?: string,
  queueKind?: string,
  toolName?: string,
): 'image' | 'video' => {
  const normalizedToolId = (toolId || '').toLowerCase();
  const normalizedQueueKind = (queueKind || '').toLowerCase();
  const normalizedToolName = (toolName || '').toLowerCase();
  if (
    normalizedToolId.includes('video') ||
    normalizedToolId.includes('motion') ||
    normalizedQueueKind.includes('video') ||
    normalizedQueueKind.includes('motion') ||
    normalizedToolName.includes('video') ||
    normalizedToolName.includes('motion')
  ) {
    return 'video';
  }
  const normalizedModel = (modelUsed || '').toLowerCase();
  const normalizedUrl = (assetUrl || '').toLowerCase();
  if (
    normalizedModel.includes('kling') ||
    normalizedModel.includes('motion') ||
    normalizedModel.includes('video') ||
    normalizedUrl.endsWith('.mp4') ||
    normalizedUrl.includes('.mp4?') ||
    normalizedUrl.includes('/video/')
  ) {
    return 'video';
  }
  return 'image';
};

const isR2Url = (assetUrl?: string | null) => {
  if (!assetUrl || !R2_PUBLIC_URL) return false;
  return assetUrl.startsWith(R2_PUBLIC_URL);
};

const extractR2KeyFromUrl = (assetUrl?: string | null) => {
  if (!assetUrl || !isR2Url(assetUrl)) return null;
  return assetUrl.replace(`${R2_PUBLIC_URL}/`, '');
};

const buildMetadataPayload = (image: GeneratedImage, user: { id: string; username?: string }, imageUrl: string | null) => ({
  id: image.id,
  user_id: user.id,
  image_url: imageUrl || '',
  prompt: image.prompt,
  model_used: image.engine,
  created_at: new Date(image.timestamp).toISOString(),
  is_public: image.isShared ?? false,
  tool_id: image.toolId || inferToolId(image.engine, imageUrl || undefined),
  tool_name: image.toolName || image.engine || 'AI Gen',
  status: image.status || (imageUrl ? 'completed' : 'processing'),
  job_id: image.jobId || null,
  progress: image.progress ?? (imageUrl ? 100 : 0),
  error_message: image.error || null,
  cost_vcoin: image.cost ?? null,
  asset_type: image.assetType || inferAssetType(image.toolId, image.engine, imageUrl || undefined, image.queueKind, image.toolName),
  queue_kind: image.queueKind || null,
  updated_at: new Date(image.updatedAt || Date.now()).toISOString(),
});

const upsertImageMetadata = async (image: GeneratedImage, user: { id: string; username?: string }, imageUrl: string | null) => {
  if (!supabase) return;

  const extendedPayload = buildMetadataPayload(image, user, imageUrl);
  const { error } = await supabase.from(TABLE_NAME).upsert(extendedPayload, { onConflict: 'id' });

  if (!error) {
    return;
  }

  // Fallback for legacy schemas that still only have the minimal columns.
  const legacyPayload = {
    id: image.id,
    user_id: user.id,
    image_url: imageUrl || '',
    prompt: image.prompt,
    model_used: image.engine,
    created_at: new Date(image.timestamp).toISOString(),
    is_public: image.isShared ?? false,
  };

  const { error: legacyError } = await supabase.from(TABLE_NAME).upsert(legacyPayload, { onConflict: 'id' });
  if (legacyError) {
    throw legacyError;
  }
};

const mapGeneratedImageRow = (row: any, fallbackUserName: string, fallbackCost?: number): GeneratedImage => {
  const queuePayload =
    row.queue_payload && typeof row.queue_payload === 'object'
      ? row.queue_payload
      : null;
  const embeddedRecipe =
    queuePayload &&
    queuePayload.__recipePayload &&
    typeof queuePayload.__recipePayload === 'object'
      ? queuePayload.__recipePayload as Record<string, unknown>
      : null;
  const recipePayload =
    embeddedRecipe ||
    (queuePayload && typeof queuePayload.recipeType === 'string'
      ? queuePayload as Record<string, unknown>
      : null);
  const userPrompt =
    typeof recipePayload?.userPromptInput === 'string' && recipePayload.userPromptInput.trim()
      ? recipePayload.userPromptInput.trim()
      : undefined;
  const providerPrompt =
    typeof queuePayload?.prompt === 'string' && queuePayload.prompt.trim() && queuePayload.prompt.trim() !== String(row.prompt || '').trim()
      ? queuePayload.prompt.trim()
      : undefined;
  const queueLogs =
    queuePayload &&
    Array.isArray(queuePayload.__logs)
      ? normalizeQueueProgressLogs(queuePayload.__logs.filter((entry: any): entry is QueueProgressLogEntry =>
          entry &&
          typeof entry === 'object' &&
          typeof entry.at === 'string' &&
          typeof entry.stage === 'string' &&
          typeof entry.level === 'string' &&
          typeof entry.message === 'string'
        ))
      : undefined;
  const displayErrorSource = pickQueueFailureMessage(row.error_message || undefined, queueLogs);
  const errorInfo = classifyQueueError(displayErrorSource || row.error_message || undefined);
  const isRescuing =
    String(row.status || '') === 'failed' &&
    hasFailedRescuePending(queuePayload) &&
    !isTerminalRescueFailureMessage(displayErrorSource) &&
    (errorInfo.category === 'provider' || errorInfo.category === 'unknown');

  return ({
  id: row.id,
  url: row.image_url || '',
  prompt: row.prompt,
  userPrompt,
  providerPrompt,
  timestamp: new Date(row.created_at).getTime(),
  updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : new Date(row.created_at).getTime(),
  assetType: row.asset_type || inferAssetType(row.tool_id, row.model_used, row.image_url, row.queue_kind, row.tool_name),
  queueKind: row.queue_kind || undefined,
  showInGenerationHistory:
    queuePayload &&
    typeof queuePayload.__showInGenerationHistory === 'boolean'
      ? queuePayload.__showInGenerationHistory
      : !isDirectImageEditQueueKind(row.queue_kind),
  toolId: row.tool_id || inferToolId(row.model_used, row.image_url),
  toolName: row.tool_name || mapEngineName(row.model_used),
  engine: mapEngineName(row.model_used),
  isShared: row.is_public,
  userId: row.user_id,
  userName: row.user_name || fallbackUserName,
  status: row.status || (row.image_url ? 'completed' : 'processing'),
  displayStatus: isRescuing ? 'rescuing' : (row.status || (row.image_url ? 'completed' : 'processing')),
  jobId: row.job_id || undefined,
  progress: typeof row.progress === 'number' ? row.progress : undefined,
  queueStage:
    queuePayload &&
    typeof queuePayload.__stage === 'string'
      ? queuePayload.__stage
      : undefined,
  queueLogs,
  error: normalizeQueueErrorMessage(displayErrorSource || row.error_message || undefined) || undefined,
  errorCategory: errorInfo.category,
  errorRaw: repairVietnameseMojibake(row.error_message || undefined) || undefined,
  cost: Number.isFinite(Number(row.cost_vcoin)) ? Number(row.cost_vcoin) : fallbackCost,
  });
};

const getGeneratedImageChargeMap = async (userId: string, imageIds: string[]): Promise<Map<string, number>> => {
  if (!supabase || imageIds.length === 0) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from('vcoin_transactions')
      .select('reference_id, amount')
      .eq('user_id', userId)
      .eq('reference_type', 'generated_image_charge')
      .in('reference_id', imageIds);

    if (error || !data) {
      return new Map();
    }

    return new Map(
      data
        .map((row: any) => {
          const referenceId = typeof row.reference_id === 'string' ? row.reference_id : '';
          const amount = Math.abs(Number(row.amount) || 0);
          if (!referenceId || !Number.isFinite(amount) || amount <= 0) {
            return null;
          }
          return [referenceId, amount] as const;
        })
        .filter((entry: readonly [string, number] | null): entry is readonly [string, number] => entry !== null)
    );
  } catch (error) {
    console.warn('[Storage] Failed to load generated image charge map', error);
    return new Map();
  }
};

const fetchCurrentUserGeneratedImagesDirectly = async (userId: string): Promise<any[]> => {
  if (!supabase || !userId) return [];
  const sinceIso = new Date(Date.now() - GALLERY_HISTORY_LOOKBACK_MS).toISOString();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(GENERATED_IMAGE_ROW_LIGHT_SELECT)
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  return data || [];
};

const fetchCurrentUserGeneratedImagesFromLedger = async (userId: string): Promise<any[]> => {
  if (!supabase || !userId) return [];
  const sinceIso = new Date(Date.now() - GALLERY_HISTORY_LOOKBACK_MS).toISOString();

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('vcoin_transactions')
    .select('reference_id, created_at')
    .eq('user_id', userId)
    .eq('reference_type', 'generated_image_charge')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(24);

  if (ledgerError || !ledgerRows) {
    if (ledgerError) throw ledgerError;
    return [];
  }

  const ids = Array.from(new Set(
    ledgerRows
      .map((row: any) => String(row?.reference_id || '').trim())
      .filter((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
  ));
  const rows: any[] = [];

  for (let index = 0; index < ids.length; index += 8) {
    const { data: batchRows, error: batchError } = await supabase
      .from(TABLE_NAME)
      .select(GENERATED_IMAGE_ROW_RECOVERY_SELECT)
      .in('id', ids.slice(index, index + 8));

    if (batchError) {
      console.warn('[Storage] Ledger gallery recovery batch failed', batchError);
      continue;
    }

    rows.push(...(batchRows || []));
  }

  const orderMap = new Map(ids.map((id, index) => [id, index]));
  return rows
    .filter((row) => row?.user_id === userId)
    .sort((a, b) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER));
};

// Modified to return Uint8Array for AWS SDK compatibility
const processBase64Data = (base64: string): { blob: Blob, type: string, buffer: Uint8Array } => {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return { 
      blob: new Blob([uInt8Array], { type: contentType }), 
      type: contentType,
      buffer: uInt8Array // Direct buffer for R2
  };
};

const mimeTypeToFileExtension = (contentType: string) => {
    const normalized = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
    const overrides: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'video/quicktime': 'mov',
        'video/x-m4v': 'm4v',
    };
    return overrides[normalized] || normalized.split('/')[1] || 'bin';
};

// --- NEW: UPLOAD INPUT FILE TO R2 ---
export const uploadFileToR2 = async (file: File | Blob | string, folder: string = 'inputs'): Promise<string> => {
    try {
        let buffer: Uint8Array;
        let blob: Blob;
        let contentType: string;
        let extension = 'png';

        if (typeof file === 'string') {
            // Base64
            const processed = processBase64Data(file);
            buffer = processed.buffer;
            blob = processed.blob;
            contentType = processed.type;
            extension = mimeTypeToFileExtension(contentType);
        } else {
            // File or Blob
            const arrayBuffer = await file.arrayBuffer();
            buffer = new Uint8Array(arrayBuffer);
            contentType = file.type || 'image/png';
            blob = new Blob([arrayBuffer], { type: contentType });
            extension = mimeTypeToFileExtension(contentType);
        }

        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

        if (r2Client) {
            const command = new PutObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: fileName,
                Body: buffer,
                ContentType: contentType,
            });

            await r2Client.send(command);
            return `${R2_PUBLIC_URL}/${fileName}`;
        }

        if (supabase) {
            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(fileName, blob, { upsert: true, contentType });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('images').getPublicUrl(fileName);
            if (data?.publicUrl) {
                return data.publicUrl;
            }
        }

        throw new Error("R2 Client not initialized");

    } catch (error) {
        console.error("R2 Upload Input Error:", error);
        throw error;
    }
};

const fetchAssetBlobForPersistence = async (assetUrl: string): Promise<Blob> => {
    if (assetUrl.startsWith('data:')) {
        return processBase64Data(assetUrl).blob;
    }

    try {
        const response = await fetch(assetUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`Direct fetch failed: ${response.status}`);
        return await response.blob();
    } catch (directError) {
        const proxyUrl = `/api/download-proxy?url=${encodeURIComponent(assetUrl)}`;
        const proxyResponse = await fetch(proxyUrl);
        if (!proxyResponse.ok) {
            throw directError instanceof Error ? directError : new Error('Failed to fetch asset for publish');
        }
        return await proxyResponse.blob();
    }
};

// --- MAIN SERVICE FUNCTIONS ---

export const saveImageToStorage = async (image: GeneratedImage): Promise<void> => {
  const user = await getUserProfile();
  const imageWithUser = {
    ...image,
    updatedAt: image.updatedAt || Date.now(),
    userName: image.userName || user.username,
    userId: image.userId || user.id,
    isShared: image.isShared ?? false
  };
  const persistLocal = async () => {
    await saveLocalImage(imageWithUser);
  };

  // 0. DIRECT URL (TRẠM SÁNG TẠO API)
  if (image.url && image.url.startsWith('http') && supabase && user.id.length > 20) {
      console.log("[Storage] Image is already a URL. Saving metadata only...");
      try {
          await upsertImageMetadata(imageWithUser, user, image.url);
          await persistLocal();
          return;
      } catch (error) {
          console.error("Supabase DB Error (Direct URL):", error);
          // Fallback to IndexedDB
      }
  }
  // 1. CLOUDFLARE R2 + SUPABASE METADATA (PRIMARY - For Base64)
  else if (image.url && image.url.startsWith('data:') && r2Client && supabase && user.id.length > 20) {
    console.log("[Storage] Attempting R2 Upload...");
    try {
        const { blob, type, buffer } = processBase64Data(image.url);
        const fileName = `${user.id}/${image.id}.png`; 
        
        // A. Upload file to R2
        // FIX: Using 'buffer' (Uint8Array) instead of 'blob' to avoid "getReader is not a function" error
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: fileName,
            Body: buffer, 
            ContentType: type,
            // ACL: 'public-read' // Uncomment if bucket is not public by default but allows ACL
        });

        await r2Client.send(command);
        console.log("[Storage] R2 Upload Success");
        
        // B. Construct Public URL
        const publicUrl = `${R2_PUBLIC_URL}/${fileName}`;

        // C. Save Metadata to Supabase DB
        await upsertImageMetadata({ ...imageWithUser, url: publicUrl }, user, publicUrl);
        await persistLocal();
        return;

    } catch (error: any) {
        console.error("R2 Upload Error details:", error);
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
             console.error("⚠️ LỖI MẠNG/CORS: Vui lòng kiểm tra cấu hình CORS trên R2 Bucket.");
        }
        // Fallback continues below...
    }
  } 
  
  // 2. SUPABASE STORAGE (LEGACY BACKUP - For Base64)
  else if (image.url && image.url.startsWith('data:') && supabase && user.id.length > 20 && !r2Client) {
    try {
      const { blob } = processBase64Data(image.url);
      const fileName = `${image.id}.png`;
      
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, blob, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);

      await upsertImageMetadata({ ...imageWithUser, url: publicUrl }, user, publicUrl);
      await persistLocal();
      return; 
    } catch (error) {
      console.error("Supabase Storage Error (Fallback to Local):", error);
    }
  }

  if (supabase && user.id.length > 20) {
    try {
      await upsertImageMetadata(imageWithUser, user, image.url || null);
    } catch (error) {
      console.error("Supabase Metadata Save Error (Fallback to Local):", error);
    }
  }

  // 3. INDEXED DB (OFFLINE/LOCAL FALLBACK)
  console.log("[Storage] Saving to Local (Fallback)");
  await persistLocal();
};

export const shareImageToShowcase = async (id: string, isShared: boolean): Promise<boolean> => {
    // Sharing logic remains metadata-based in Supabase
    if (supabase) {
        try {
            const { error } = await supabase
                .from(TABLE_NAME)
                .update({ is_public: isShared })
                .eq('id', id);
            
            if (!error) return true;
        } catch (e) {
            console.warn("Share cloud error", e);
        }
    }

    // Local Fallback
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
            const data = getReq.result as GeneratedImage;
            if (data) {
                data.isShared = isShared;
                const updateReq = store.put(data);
                updateReq.onsuccess = () => resolve(true);
                updateReq.onerror = () => reject(updateReq.error);
            } else {
                resolve(false);
            }
        };
        getReq.onerror = () => reject(getReq.error);
    });
};

export const publishImageToShowcase = async (image: GeneratedImage): Promise<GeneratedImage> => {
    if (!image.url) {
        throw new Error('Image URL is missing');
    }
    if ((image.assetType || inferAssetType(image.toolId, image.engine, image.url)) === 'video') {
        throw new Error('Only images can be published to the showcase');
    }
    if (!supabase) {
        throw new Error('No Database');
    }
    if (!r2Client || !R2_PUBLIC_URL || !R2_BUCKET_NAME) {
        throw new Error('R2 storage is not configured for publishing');
    }

    const user = await getUserProfile();
    const ownerId = image.userId || user.id;
    const blob = await fetchAssetBlobForPersistence(image.url);
    const contentType = blob.type || 'image/png';
    const extension = contentType.includes('jpeg') ? 'jpg' : (contentType.split('/')[1] || 'png');
    const fileName = `published/${ownerId}/${image.id}.${extension}`;

    const buffer = new Uint8Array(await blob.arrayBuffer());
    await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
        Body: buffer,
        ContentType: contentType,
    }));

    const persistentUrl = `${R2_PUBLIC_URL}/${fileName}`;
    const updatedImage: GeneratedImage = {
        ...image,
        url: persistentUrl,
        isShared: true,
        updatedAt: Date.now(),
    };

    const { error } = await supabase
        .from(TABLE_NAME)
        .update({
            is_public: true,
            image_url: persistentUrl,
            updated_at: new Date().toISOString(),
        })
        .eq('id', image.id);

    if (error) {
        throw error;
    }

    await saveLocalImage(updatedImage);
    return updatedImage;
};

const mapEngineName = (engine: string) => {
    if (!engine) return 'AI Gen';
    return engine
        .replace('Gemini 2.5 Flash', 'Gemini 3.1 Flash')
        .replace('Gemini 2.5 Pro', 'Gemini 3 Pro')
        .replace('Gemini 3.0 Pro', 'Gemini 3 Pro');
};

const inferToolId = (modelUsed?: string, assetUrl?: string) => {
    const normalizedModel = (modelUsed || '').toLowerCase();
    const normalizedUrl = (assetUrl || '').toLowerCase();

    if (
        normalizedModel.includes('kling') ||
        normalizedModel.includes('motion') ||
        normalizedUrl.endsWith('.mp4') ||
        normalizedUrl.includes('.mp4?')
    ) {
        return normalizedModel.includes('motion') ? 'motion_control_gen' : 'video_gen';
    }

    return 'gen_tool';
};

export const getShowcaseImages = async (): Promise<GeneratedImage[]> => {
    // 1. SUPABASE
    if (supabase) {
        try {
            // Fetch images ONLY to avoid 400 errors from missing relationships in schema cache
            const { data: simpleData, error: simpleError } = await supabase
                .from(TABLE_NAME)
                .select(GENERATED_IMAGE_ROW_SELECT)
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(20);
            
            if (!simpleError && simpleData) {
                return simpleData
                    .map((row: any) => mapGeneratedImageRow(row, 'Artist'))
                    .filter((img: GeneratedImage) => (img.assetType || inferAssetType(img.toolId, img.engine, img.url)) === 'image');
            }
        } catch (e) {
            console.warn("Fetch showcase cloud error", e);
        }
    }

    // 2. INDEXED DB
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const results = request.result as GeneratedImage[];
            const mappedResults = results.map(img => ({
                ...img,
                toolName: mapEngineName(img.toolName),
                engine: mapEngineName(img.engine)
            }));
            const shared = mappedResults.filter(img => img.isShared && (img.assetType || inferAssetType(img.toolId, img.engine, img.url)) === 'image');
            resolve(shared.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20));
        };
        request.onerror = () => reject(request.error);
    });
};

export const getAllImagesSystemWide = async (): Promise<GeneratedImage[]> => {
    if (!supabase) return [];
    const sinceIso = new Date(Date.now() - GALLERY_HISTORY_LOOKBACK_MS).toISOString();
    
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select(GENERATED_IMAGE_ROW_SELECT)
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error || !data) return [];

        return data.map((row: any) => mapGeneratedImageRow(row, 'User'));
    } catch (e) {
        console.error("System Wide Fetch Error", e);
        return [];
    }
};

export const getAllImagesFromStorage = async (): Promise<GeneratedImage[]> => {
  const localImages = await readLocalImages().catch((error) => {
    console.warn("Local image cache load failed", error);
    return [] as GeneratedImage[];
  });

  // 1. SUPABASE (Fetches metadata, URL points to R2 or Supabase Storage)
  if (supabase) {
    try {
        const user = await getSupabaseUser();
        if(user) {
            const localImagesForUser = localImages.filter((image) => image.userId === user.id);
            if (galleryFetchCache && galleryFetchCache.userId === user.id && galleryFetchCache.expiresAt > Date.now()) {
              return mergeCloudAndLocalImages(galleryFetchCache.images, localImagesForUser);
            }

            if (galleryFetchPromise) {
              const pendingImages = await galleryFetchPromise.catch(() => null);
              if (pendingImages) {
                return mergeCloudAndLocalImages(pendingImages, localImagesForUser);
              }
            }

            const authHeader = await getSessionAuthHeader();
            galleryFetchPromise = (async () => {
              try {
                const response = await fetchWithTimeout('/api/gallery-images', {
                  method: 'GET',
                  headers: authHeader,
                }, GALLERY_API_TIMEOUT_MS);
                const payload = await response.json().catch(() => ({}));

                if (response.ok && Array.isArray(payload?.images)) {
                    const cloudImages = payload.images.map((row: any) => mapGeneratedImageRow(row, 'Me'));
                    const mergedImages = excludeDirectEditHistory(mergeCloudAndLocalImages(cloudImages, localImagesForUser));
                    galleryFetchCache = {
                      userId: user.id,
                      expiresAt:
                        Date.now() +
                        (mergedImages.some((image) => image.displayStatus === 'queued' || image.displayStatus === 'processing' || image.displayStatus === 'rescuing')
                          ? ACTIVE_GALLERY_CLIENT_CACHE_TTL_MS
                          : IDLE_GALLERY_CLIENT_CACHE_TTL_MS),
                      images: mergedImages,
                    };
                    void replaceLocalImagesForUser(user.id, mergedImages).catch((syncError) => {
                      console.warn('[Storage] Failed to sync local cache from cloud', syncError);
                    });
                    return mergedImages;
                }

                console.warn('[Storage] Gallery API failed, trying direct Supabase fallback', payload?.error || response.statusText);
              } catch (apiError) {
                console.warn('[Storage] Gallery API request failed, trying direct Supabase fallback', apiError);
              }

              try {
                const directRows = await fetchCurrentUserGeneratedImagesDirectly(user.id);
                if (directRows.length > 0) {
                  const directImages = directRows.map((row: any) => mapGeneratedImageRow(row, 'Me'));
                  const mergedImages = excludeDirectEditHistory(mergeCloudAndLocalImages(directImages, localImagesForUser));
                  galleryFetchCache = {
                    userId: user.id,
                    expiresAt: Date.now() + IDLE_GALLERY_CLIENT_CACHE_TTL_MS,
                    images: mergedImages,
                  };
                  void replaceLocalImagesForUser(user.id, mergedImages).catch((syncError) => {
                    console.warn('[Storage] Failed to sync local cache from direct gallery load', syncError);
                  });
                  return mergedImages;
                }
              } catch (directError) {
                console.warn('[Storage] Direct gallery fallback failed', directError);
              }

              try {
                const recoveryRows = await fetchCurrentUserGeneratedImagesFromLedger(user.id);
                if (recoveryRows.length > 0) {
                  const recoveryImages = recoveryRows.map((row: any) => mapGeneratedImageRow(row, 'Me'));
                  const mergedImages = excludeDirectEditHistory(mergeCloudAndLocalImages(recoveryImages, localImagesForUser));
                  galleryFetchCache = {
                    userId: user.id,
                    expiresAt: Date.now() + ACTIVE_GALLERY_CLIENT_CACHE_TTL_MS,
                    images: mergedImages,
                  };
                  void replaceLocalImagesForUser(user.id, mergedImages).catch((syncError) => {
                    console.warn('[Storage] Failed to sync local cache from ledger gallery recovery', syncError);
                  });
                  return mergedImages;
                }
              } catch (recoveryError) {
                console.warn('[Storage] Ledger gallery recovery failed', recoveryError);
              }

              const filteredLocalImages = excludeDirectEditHistory(localImagesForUser);
              galleryFetchCache = {
                userId: user.id,
                expiresAt: Date.now() + ACTIVE_GALLERY_CLIENT_CACHE_TTL_MS,
                images: filteredLocalImages,
              };
              return filteredLocalImages;
            })();

            try {
              return await galleryFetchPromise;
            } finally {
              galleryFetchPromise = null;
            }
        }
    } catch (error) {
      console.error("Supabase Load Error (Fallback to Local):", error);
    }
  }

  // 2. INDEXED DB
  return excludeDirectEditHistory(localImages);
};

export const getUserImagesFromStorage = async (userId: string, limit = 80): Promise<GeneratedImage[]> => {
    if (!supabase) return [];
    const sinceIso = new Date(Date.now() - GALLERY_HISTORY_LOOKBACK_MS).toISOString();
    
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select(GENERATED_IMAGE_ROW_SELECT)
            .eq('user_id', userId)
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];

        const missingCostIds = data
            .filter((row: any) => !Number.isFinite(Number(row.cost_vcoin)))
            .map((row: any) => row.id)
            .filter((value: any): value is string => typeof value === 'string' && value.length > 0);
        const chargeMap = await getGeneratedImageChargeMap(userId, missingCostIds);
        return data
            .map((row: any) => mapGeneratedImageRow(row, 'User', chargeMap.get(row.id)))
            .filter((image: GeneratedImage) => !isDirectImageEditQueueKind(image.queueKind));
    } catch (e) {
        console.error("User Images Fetch Error", e);
        return [];
    }
};



export const deleteImageFromStorage = async (id: string, targetUserId?: string, imageUrl?: string): Promise<void> => {
  const user = await getUserProfile();
  const userId = targetUserId || user.id;

  if (supabase && userId) {
    // A. Delete from R2 (if configured)
    if (r2Client && (!imageUrl || isR2Url(imageUrl))) {
        try {
            let fileName = `${userId}/${id}.png`; // Default fallback
            
            // Robust Key Extraction Strategy
            if (imageUrl && imageUrl.startsWith('http')) {
                // Strategy 1: Remove R2_PUBLIC_URL prefix (Handles custom domains/paths)
                if (R2_PUBLIC_URL && imageUrl.startsWith(R2_PUBLIC_URL)) {
                    fileName = imageUrl.replace(`${R2_PUBLIC_URL}/`, '');
                }
                // Strategy 2: Use Pathname (Handles domain changes)
                else {
                    try {
                        const urlObj = new URL(imageUrl);
                        const path = decodeURIComponent(urlObj.pathname);
                        fileName = path.startsWith('/') ? path.substring(1) : path;
                    } catch (e) {
                        console.warn(`[Storage] URL Parse Failed for ${imageUrl}`);
                    }
                }
            }

            console.warn(`[Storage] DELETING R2 KEY: [${fileName}]`);
            await r2Client.send(new DeleteObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: fileName
            }));
            console.warn(`[Storage] R2 Delete Sent for: ${fileName}`);
        } catch (e) {
            console.error("[Storage] R2 Delete Failed:", e);
            throw e;
        }
    } 
    
    try {
        // B. Delete from Supabase Storage (Legacy - only if R2 not active)
        if (!r2Client) {
             await supabase.storage.from('images').remove([`${id}.png`]);
        }

        // C. Delete Metadata from DB
        const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
        if (error) throw error;

    } catch (e) { 
        console.warn("Delete DB/Metadata error", e); 
        throw e;
    }
  }

  // D. Delete from Local
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const cleanupR2Directly = async (): Promise<number> => {
    if (!r2Client) return 0;
    
    let deletedCount = 0;
    const now = Date.now();
    const EXPIRATION_MS = HISTORY_RETENTION_MS;

    try {
        // Get all public images from DB to protect them
        let publicImageKeys = new Set<string>();
        if (supabase) {
            const { data } = await supabase.from(TABLE_NAME).select('image_url').eq('is_public', true);
            if (data) {
                data.forEach((row: any) => {
                    if (row.image_url && R2_PUBLIC_URL && row.image_url.startsWith(R2_PUBLIC_URL)) {
                        const key = row.image_url.replace(`${R2_PUBLIC_URL}/`, '');
                        publicImageKeys.add(key);
                    }
                });
            }
        }

        let isTruncated = true;
        let continuationToken: string | undefined = undefined;

        while (isTruncated) {
            const listCommand = new ListObjectsV2Command({
                Bucket: R2_BUCKET_NAME,
                ContinuationToken: continuationToken,
            });

            const listResponse: any = await r2Client.send(listCommand);
            const objects = listResponse.Contents || [];

            const objectsToDelete = objects.filter((obj: any) => {
                if (!obj.Key || !obj.LastModified) return false;
                
                // Protect public images
                if (publicImageKeys.has(obj.Key)) return false;

                // Check expiration
                const age = now - obj.LastModified.getTime();
                return age > EXPIRATION_MS;
            }).map((obj: any) => ({ Key: obj.Key }));

            if (objectsToDelete.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < objectsToDelete.length; i += chunkSize) {
                    const chunk = objectsToDelete.slice(i, i + chunkSize);
                    try {
                        await r2Client.send(new DeleteObjectsCommand({
                            Bucket: R2_BUCKET_NAME,
                            Delete: { Objects: chunk }
                        }));
                        deletedCount += chunk.length;
                    } catch (e: any) {
                        console.error("R2 Batch Delete Error", e);
                        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                            throw new Error("CORS_ERROR: Vui lòng cấu hình CORS cho R2 Bucket để cho phép lệnh DELETE.");
                        }
                    }
                }
            }

            isTruncated = listResponse.IsTruncated || false;
            continuationToken = listResponse.NextContinuationToken;
        }

        console.log(`[Cleanup] Directly deleted ${deletedCount} expired objects from R2.`);
        return deletedCount;
    } catch (e: any) {
        console.error("R2 Direct Cleanup Error", e);
        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
            throw new Error("CORS_ERROR: Vui lòng cấu hình CORS cho R2 Bucket để cho phép lệnh GET/DELETE.");
        }
        if (e.message && e.message.includes("CORS_ERROR")) throw e;
        return deletedCount;
    }
};

export const cleanupExpiredImages = async (isSystemWide: boolean = false): Promise<number> => {
    let images: GeneratedImage[] = [];
    if (isSystemWide) {
        images = await getAllImagesSystemWide();
    } else {
        images = await readLocalImages();
    }

    const now = Date.now();
    const EXPIRATION_MS = HISTORY_RETENTION_MS;
    
    // Filter Expired Images
    const expiredImages = images.filter(img => {
        return !img.isShared && (now - img.timestamp > EXPIRATION_MS);
    });

    if (expiredImages.length === 0) {
        console.log("[Cleanup] No expired images found.");
        return 0;
    }

    console.log(`[Cleanup] Found ${expiredImages.length} expired images. Starting BATCH deletion...`);

    // --- BATCH DELETE R2 ---
    if (r2Client) {
        try {
            // Prepare Keys
            const objectsToDelete = expiredImages
                .map(img => extractR2KeyFromUrl(img.url))
                .filter((key): key is string => !!key)
                .map((key) => ({ Key: key }));

            // Split into chunks of 50 (Safe size for Browser & CORS)
            const chunkSize = 50;
            for (let i = 0; i < objectsToDelete.length; i += chunkSize) {
                const chunk = objectsToDelete.slice(i, i + chunkSize);
                console.log(`[Cleanup] Deleting R2 Batch ${Math.floor(i/chunkSize) + 1} (${chunk.length} items)...`);
                
                try {
                    await r2Client.send(new DeleteObjectsCommand({
                        Bucket: R2_BUCKET_NAME,
                        Delete: { Objects: chunk }
                    }));
                } catch (batchErr: any) {
                    console.error(`[Cleanup] R2 Batch Error:`, batchErr);
                    if (batchErr.name === 'TypeError' && batchErr.message === 'Failed to fetch') {
                        console.error("🚨 LỖI CORS: Trình duyệt đã chặn yêu cầu xóa. Bạn CẦN cấu hình CORS trên R2 Bucket.");
                        throw new Error("CORS_ERROR: Vui lòng cấu hình CORS cho R2 Bucket để cho phép lệnh DELETE.");
                    }
                }
            }
            console.log("[Cleanup] R2 Batch Deletion Complete.");
        } catch (e: any) {
            console.error("[Cleanup] R2 Batch Delete Failed Global", e);
            if (e.message.includes("CORS_ERROR")) throw e; // Re-throw to notify UI
        }
    }

    // --- BATCH DELETE DB ---
    if (supabase) {
        try {
            const ids = expiredImages.map(img => img.id);
            // Delete in chunks of 50 for DB safety
            const chunkSize = 50;
            for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize);
                const { error } = await supabase.from(TABLE_NAME).delete().in('id', chunk);
                if (error) {
                    console.error("[Cleanup] DB Batch Delete Error", error);
                }
            }
            console.log("[Cleanup] DB Batch Deletion Complete.");
        } catch (e) {
            console.error("[Cleanup] DB Delete Failed", e);
        }
    }

    // --- BATCH DELETE LOCAL (IndexedDB) ---
    try {
        const db = await openDB();
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        expiredImages.forEach(img => store.delete(img.id));
        console.log("[Cleanup] Local Batch Deletion Complete.");
    } catch (e) {
        console.warn("[Cleanup] Local Delete Failed", e);
    }

    return expiredImages.length;
};

export const getHistoryRetentionDays = () => HISTORY_RETENTION_DAYS;
