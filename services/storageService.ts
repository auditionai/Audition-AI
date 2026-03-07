
import { GeneratedImage } from '../types';
import { supabase } from './supabaseClient';
import { getUserProfile } from './economyService';
import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const DB_NAME = 'DMP_AI_Studio_DB';
const STORE_NAME = 'images';
const TABLE_NAME = 'generated_images';

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

// --- NEW: UPLOAD INPUT FILE TO R2 ---
export const uploadFileToR2 = async (file: File | Blob | string, folder: string = 'inputs'): Promise<string> => {
    if (!r2Client) {
        throw new Error("R2 Client not initialized");
    }

    try {
        let buffer: Uint8Array;
        let contentType: string;
        let extension = 'png';

        if (typeof file === 'string') {
            // Base64
            const processed = processBase64Data(file);
            buffer = processed.buffer;
            contentType = processed.type;
            extension = contentType.split('/')[1] || 'png';
        } else {
            // File or Blob
            const arrayBuffer = await file.arrayBuffer();
            buffer = new Uint8Array(arrayBuffer);
            contentType = file.type || 'image/png';
            extension = contentType.split('/')[1] || 'png';
        }

        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: contentType,
        });

        await r2Client.send(command);
        
        // Return Public URL
        return `${R2_PUBLIC_URL}/${fileName}`;

    } catch (error) {
        console.error("R2 Upload Input Error:", error);
        throw error;
    }
};

// --- MAIN SERVICE FUNCTIONS ---

export const saveImageToStorage = async (image: GeneratedImage): Promise<void> => {
  const user = await getUserProfile();
  const imageWithUser = { ...image, userName: user.username, isShared: false };

  // 1. CLOUDFLARE R2 + SUPABASE METADATA (PRIMARY)
  if (r2Client && supabase && user.id.length > 20) {
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
        const { error: dbError } = await supabase
            .from(TABLE_NAME)
            .insert({
                id: image.id,
                user_id: user.id, 
                image_url: publicUrl, // R2 URL
                prompt: image.prompt,
                model_used: image.engine,
                created_at: new Date(image.timestamp).toISOString(),
                is_public: false
            });

        if (dbError) throw dbError;
        return;

    } catch (error: any) {
        console.error("R2 Upload Error details:", error);
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
             console.error("⚠️ LỖI MẠNG/CORS: Vui lòng kiểm tra cấu hình CORS trên R2 Bucket.");
        }
        // Fallback continues below...
    }
  } 
  
  // 2. SUPABASE STORAGE (LEGACY BACKUP)
  else if (supabase && user.id.length > 20 && !r2Client) {
    try {
      const { blob } = processBase64Data(image.url);
      const fileName = `${image.id}.png`;
      
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, blob, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from(TABLE_NAME)
        .insert({
          id: image.id,
          user_id: user.id,
          image_url: publicUrl,
          prompt: image.prompt,
          model_used: image.engine,
          created_at: new Date(image.timestamp).toISOString(),
          is_public: false
        });

      if (dbError) throw dbError;
      return; 
    } catch (error) {
      console.error("Supabase Storage Error (Fallback to Local):", error);
    }
  }

  // 3. INDEXED DB (OFFLINE/LOCAL FALLBACK)
  console.log("[Storage] Saving to Local (Fallback)");
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(imageWithUser);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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

export const getShowcaseImages = async (): Promise<GeneratedImage[]> => {
    // 1. SUPABASE
    if (supabase) {
        try {
            // Fetch images ONLY to avoid 400 errors from missing relationships in schema cache
            const { data: simpleData, error: simpleError } = await supabase
                .from(TABLE_NAME)
                .select('*')
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(20);
            
            if (!simpleError && simpleData) {
                return simpleData.map((row: any) => ({
                    id: row.id,
                    url: row.image_url, 
                    prompt: row.prompt,
                    timestamp: new Date(row.created_at).getTime(),
                    toolId: 'gen_tool', 
                    toolName: row.model_used || 'AI Tool',
                    engine: row.model_used,
                    isShared: row.is_public,
                    userName: 'Artist' // Fallback name
                }));
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
            const shared = results.filter(img => img.isShared);
            resolve(shared.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20));
        };
        request.onerror = () => reject(request.error);
    });
};

export const getAllImagesSystemWide = async (): Promise<GeneratedImage[]> => {
    if (!supabase) return [];
    
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !data) return [];

        return data.map((row: any) => ({
            id: row.id,
            url: row.image_url,
            prompt: row.prompt,
            timestamp: new Date(row.created_at).getTime(),
            toolId: 'gen_tool',
            toolName: row.model_used || 'AI Gen',
            engine: row.model_used,
            isShared: row.is_public,
            userId: row.user_id,
            userName: 'User'
        }));
    } catch (e) {
        console.error("System Wide Fetch Error", e);
        return [];
    }
};

export const getAllImagesFromStorage = async (): Promise<GeneratedImage[]> => {
  // 1. SUPABASE (Fetches metadata, URL points to R2 or Supabase Storage)
  if (supabase) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if(user) {
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (!error && data) {
                return data.map((row: any) => ({
                    id: row.id,
                    url: row.image_url,
                    prompt: row.prompt,
                    timestamp: new Date(row.created_at).getTime(),
                    toolId: 'gen_tool',
                    toolName: row.model_used || 'AI Gen',
                    engine: row.model_used,
                    isShared: row.is_public,
                    userName: 'Me',
                    userId: row.user_id
                }));
            }
        }
    } catch (error) {
      console.error("Supabase Load Error (Fallback to Local):", error);
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
      resolve(results.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
};

export const getUserImagesFromStorage = async (userId: string): Promise<GeneratedImage[]> => {
    if (!supabase) return [];
    
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error || !data) return [];

        return data.map((row: any) => ({
            id: row.id,
            url: row.image_url,
            prompt: row.prompt,
            timestamp: new Date(row.created_at).getTime(),
            toolId: 'gen_tool',
            toolName: row.model_used || 'AI Gen',
            engine: row.model_used,
            isShared: row.is_public,
            userId: row.user_id,
            userName: 'User'
        }));
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
    if (r2Client) {
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

export const cleanupR2Directly = async (): Promise<{ count: number, size: number }> => {
    if (!r2Client) return { count: 0, size: 0 };
    
    console.log("[Cleanup] Starting COMPREHENSIVE R2 storage scan...");
    let deletedCount = 0;
    let deletedSize = 0;
    const now = Date.now();
    const EXPIRATION_MS = 1 * 24 * 60 * 60 * 1000; // 1 Day
    const ORPHAN_EXPIRATION_MS = 1 * 60 * 60 * 1000; // 1 Hour

    try {
        // 1. Fetch ALL images from DB
        let dbImageKeys = new Set<string>();
        let publicImageKeys = new Set<string>();

        if (supabase) {
            console.log("[Cleanup] Fetching database records...");
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .select('image_url, is_public');
            
            if (error) {
                console.error("[Cleanup] DB Fetch Error", error);
                throw error;
            }

            if (data) {
                data.forEach((row: any) => {
                    if (row.image_url) {
                        let key = row.image_url;
                        // Normalize Key
                        if (R2_PUBLIC_URL && key.startsWith(R2_PUBLIC_URL)) {
                            key = key.replace(`${R2_PUBLIC_URL}/`, '');
                        } else if (key.startsWith('http')) {
                            try {
                                const path = decodeURIComponent(new URL(key).pathname);
                                key = path.startsWith('/') ? path.substring(1) : path;
                            } catch(e) {}
                        }
                        
                        dbImageKeys.add(key);
                        if (row.is_public) {
                            publicImageKeys.add(key);
                        }
                    }
                });
            }
            console.log(`[Cleanup] DB Index: ${dbImageKeys.size} total, ${publicImageKeys.size} public.`);
        }

        let isTruncated = true;
        let continuationToken: string | undefined = undefined;
        let totalScanned = 0;

        while (isTruncated) {
            const listCommand = new ListObjectsV2Command({
                Bucket: R2_BUCKET_NAME,
                ContinuationToken: continuationToken,
            });

            const listResponse: any = await r2Client.send(listCommand);
            const objects = listResponse.Contents || [];
            totalScanned += objects.length;
            
            console.log(`[Cleanup] R2 Batch: ${objects.length} objects.`);

            const objectsToDelete = objects.filter((obj: any) => {
                if (!obj.Key || !obj.LastModified) return false;
                
                const key = obj.Key;
                const size = obj.Size || 0;
                const age = now - obj.LastModified.getTime();
                const ageHours = age / (1000 * 60 * 60);

                // 1. PROTECT PUBLIC
                if (publicImageKeys.has(key)) {
                    console.log(`[Cleanup] KEEP (Public): ${key} (${(size/1024/1024).toFixed(2)} MB)`);
                    return false;
                }

                // 2. DELETE ORPHANS
                if (!dbImageKeys.has(key)) {
                    if (age > ORPHAN_EXPIRATION_MS) {
                        console.log(`[Cleanup] DELETE (Orphan): ${key} (${(size/1024/1024).toFixed(2)} MB, Age: ${ageHours.toFixed(1)}h)`);
                        deletedSize += size;
                        return true;
                    }
                    return false; // Keep recent orphans
                }

                // 3. DELETE EXPIRED ACTIVE
                if (age > EXPIRATION_MS) {
                    console.log(`[Cleanup] DELETE (Expired): ${key} (${(size/1024/1024).toFixed(2)} MB, Age: ${ageHours.toFixed(1)}h)`);
                    deletedSize += size;
                    return true;
                }

                // 4. KEEP ACTIVE RECENT
                console.log(`[Cleanup] KEEP (Active Recent): ${key} (Age: ${ageHours.toFixed(1)}h)`);
                return false;

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
                    }
                }
            }

            isTruncated = listResponse.IsTruncated || false;
            continuationToken = listResponse.NextContinuationToken;
        }

        console.log(`[Cleanup] Complete. Scanned: ${totalScanned}. Deleted: ${deletedCount} files (${(deletedSize/1024/1024).toFixed(2)} MB).`);
        return { count: deletedCount, size: deletedSize };
    } catch (e: any) {
        console.error("Cleanup Error", e);
        return { count: deletedCount, size: deletedSize };
    }
};

export const cleanupExpiredImages = async (isSystemWide: boolean = false): Promise<number> => {
    console.log("[Cleanup] Starting database cleanup scan...");
    let images: GeneratedImage[] = [];
    if (isSystemWide) {
        images = await getAllImagesSystemWide();
    } else {
        images = await getAllImagesFromStorage();
    }

    const now = Date.now();
    const EXPIRATION_MS = 1 * 24 * 60 * 60 * 1000; // 1 Day
    
    // Filter Expired Images
    const expiredImages = images.filter(img => {
        return !img.isShared && (now - img.timestamp > EXPIRATION_MS);
    });

    if (expiredImages.length === 0) {
        console.log("[Cleanup] No expired images found in database records.");
        return 0;
    }

    console.log(`[Cleanup] Found ${expiredImages.length} expired images in database. Starting BATCH deletion...`);

    // --- BATCH DELETE R2 ---
    if (r2Client) {
        try {
            // Prepare Keys
            const objectsToDelete = expiredImages.map(img => {
                let key = `${img.userId || 'unknown'}/${img.id}.png`;
                if (img.url && img.url.startsWith('http')) {
                    if (R2_PUBLIC_URL && img.url.startsWith(R2_PUBLIC_URL)) {
                        key = img.url.replace(`${R2_PUBLIC_URL}/`, '');
                    } else {
                        try {
                            const path = decodeURIComponent(new URL(img.url).pathname);
                            key = path.startsWith('/') ? path.substring(1) : path;
                        } catch(e) {}
                    }
                }
                return { Key: key };
            });

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
