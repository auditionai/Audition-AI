
import { GeneratedImage } from '../types';
import { supabase } from './supabaseClient';
import { getUserProfile } from './economyService';

const DB_NAME = 'DMP_AI_Studio_DB';
const STORE_NAME = 'images';
const TABLE_NAME = 'generated_images';

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

const IMGBB_API_KEY = getEnv('VITE_IMGBB_API_KEY');

export const checkR2Connection = async (): Promise<boolean> => {
    // Legacy function name, now checks ImgBB
    return !!IMGBB_API_KEY;
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

// --- NEW: UPLOAD INPUT FILE TO IMGBB ---
export const uploadFileToR2 = async (file: File | Blob | string, folder: string = 'inputs', customName?: string): Promise<string> => {
    // We keep the function name uploadFileToR2 for backward compatibility with UI components
    if (!IMGBB_API_KEY) {
        throw new Error("ImgBB API Key not configured in .env");
    }

    try {
        const formData = new FormData();
        const fileName = customName || `${folder}_${Date.now()}`;
        
        if (typeof file === 'string') {
            // Base64 string
            if (file.startsWith('data:')) {
                const { blob } = processBase64Data(file);
                formData.append('image', blob, `${fileName}.png`);
            } else {
                // Raw base64 without data URI prefix
                const byteCharacters = atob(file);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'image/png' });
                formData.append('image', blob, `${fileName}.png`);
            }
        } else {
            // File or Blob
            formData.append('image', file, `${fileName}.png`);
        }
        
        // ImgBB supports 'name' parameter to set the image name
        formData.append('name', fileName);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            return data.data.url;
        } else {
            throw new Error(data.error?.message || "ImgBB upload failed");
        }
    } catch (error) {
        console.error("ImgBB Upload Input Error:", error);
        throw error;
    }
};

// --- MAIN SERVICE FUNCTIONS ---

export const saveImageToStorage = async (image: GeneratedImage): Promise<void> => {
  const user = await getUserProfile();
  const imageWithUser = { ...image, userName: user.username, isShared: false };

  // ONLY SAVE TO INDEXED DB (LOCAL STORAGE)
  console.log("[Storage] Saving to Local IndexedDB");
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
    // Local Fallback first to get the image data
    const db = await openDB();
    const localUpdateSuccess = await new Promise<boolean>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = async () => {
            const data = getReq.result as GeneratedImage;
            if (data) {
                data.isShared = isShared;
                const updateReq = store.put(data);
                updateReq.onsuccess = () => resolve(true);
                updateReq.onerror = () => reject(updateReq.error);
                
                // If sharing, upload to cloud
                if (isShared && supabase && IMGBB_API_KEY) {
                    try {
                        // Check if it already exists in Supabase
                        const { data: existing } = await supabase.from(TABLE_NAME).select('id').eq('id', id).single();
                        
                        if (!existing) {
                            const user = await getUserProfile();
                            console.log("[Storage] Uploading shared image to ImgBB...");
                            const publicUrl = await uploadFileToR2(data.url, 'outputs', `${user.username}_${data.id}`);
                            
                            await supabase.from(TABLE_NAME).insert({
                                id: data.id,
                                user_id: user.id, 
                                image_url: publicUrl,
                                prompt: data.prompt,
                                model_used: data.engine,
                                created_at: new Date(data.timestamp).toISOString(),
                                is_public: true
                            });
                        } else {
                            await supabase.from(TABLE_NAME).update({ is_public: true }).eq('id', id);
                        }
                    } catch (e) {
                        console.error("Failed to upload shared image to cloud:", e);
                    }
                } else if (!isShared && supabase) {
                    // Unshare
                    try {
                        await supabase.from(TABLE_NAME).update({ is_public: false }).eq('id', id);
                    } catch (e) {
                        console.error("Failed to unshare image in cloud:", e);
                    }
                }
            } else {
                resolve(false);
            }
        };
        getReq.onerror = () => reject(getReq.error);
    });

    return localUpdateSuccess;
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
            const results = (request.result as GeneratedImage[]) || [];
            if (!Array.isArray(results)) {
                resolve([]);
                return;
            }
            const shared = results.filter(img => img && img.isShared);
            resolve(shared.sort((a, b) => {
                if (!a || !b) return 0;
                const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                const validTsA = isNaN(tsA) ? 0 : tsA;
                const validTsB = isNaN(tsB) ? 0 : tsB;
                return validTsB - validTsA;
            }).slice(0, 20));
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
  // ONLY INDEXED DB (LOCAL STORAGE)
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = (request.result as GeneratedImage[]) || [];
      if (!Array.isArray(results)) {
          resolve([]);
          return;
      }
      resolve(results.sort((a, b) => {
          if (!a || !b) return 0;
          const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          const validTsA = isNaN(tsA) ? 0 : tsA;
          const validTsB = isNaN(tsB) ? 0 : tsB;
          return validTsB - validTsA;
      }));
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
    try {
        // A. Delete from Supabase Storage (Legacy - only if ImgBB not active)
        if (!IMGBB_API_KEY) {
             await supabase.storage.from('images').remove([`${id}.png`]);
        }

        // B. Delete Metadata from DB
        const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
        if (error) throw error;

    } catch (e) { 
        console.warn("Delete DB/Metadata error", e); 
        throw e;
    }
  }

  // C. Delete from Local
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteAllUnsharedImagesFromCloud = async (
    onProgress: (current: number, total: number, message: string) => void
): Promise<void> => {
    if (!supabase) throw new Error("Supabase not connected");

    try {
        // Fetch all images that are NOT public
        const { data: images, error } = await supabase
            .from(TABLE_NAME)
            .select('id, image_url')
            .eq('is_public', false);

        if (error) throw error;
        
        if (!images || images.length === 0) {
            onProgress(0, 0, "Không có ảnh nào cần xóa.");
            return;
        }

        const total = images.length;
        let current = 0;

        // Delete in chunks of 50
        const chunkSize = 50;
        for (let i = 0; i < images.length; i += chunkSize) {
            const chunk = images.slice(i, i + chunkSize);
            const ids = chunk.map(img => img.id);
            
            onProgress(current, total, `Đang xóa ${ids.length} ảnh từ Database...`);
            
            const { error: deleteError } = await supabase
                .from(TABLE_NAME)
                .delete()
                .in('id', ids);

            if (deleteError) {
                console.error("Lỗi khi xóa chunk:", deleteError);
                onProgress(current, total, `Lỗi khi xóa: ${deleteError.message}`);
                continue;
            }

            current += ids.length;
            onProgress(current, total, `Đã xóa ${current}/${total} ảnh`);
        }
        
        onProgress(total, total, "Hoàn tất xóa ảnh không chia sẻ.");
    } catch (e: any) {
        console.error("Lỗi xóa ảnh:", e);
        throw e;
    }
};

export const cleanupExpiredImages = async (isSystemWide: boolean = false): Promise<number> => {
    let images: GeneratedImage[] = [];
    if (isSystemWide) {
        images = (await getAllImagesSystemWide()) || [];
    } else {
        images = (await getAllImagesFromStorage()) || [];
    }

    const now = Date.now();
    const EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days
    
    // Filter Expired Images
    const expiredImages = images.filter(img => {
        if (!img) return false;
        if (img.isShared) return false;
        if (!img.timestamp) return false;
        const ts = new Date(img.timestamp).getTime();
        if (isNaN(ts)) return false;
        return (now - ts > EXPIRATION_MS);
    });

    if (expiredImages.length === 0) {
        console.log("[Cleanup] No expired images found.");
        return 0;
    }

    console.log(`[Cleanup] Found ${expiredImages.length} expired images. Starting BATCH deletion...`);

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
        expiredImages.forEach(img => {
            if (img && img.id) {
                store.delete(img.id);
            }
        });
        console.log("[Cleanup] Local Batch Deletion Complete.");
    } catch (e) {
        console.warn("[Cleanup] Local Delete Failed", e);
    }

    return expiredImages.length;
};
