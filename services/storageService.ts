
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
export const uploadFileToR2 = async (file: File | Blob | string, folder: string = 'inputs'): Promise<string> => {
    // We keep the function name uploadFileToR2 for backward compatibility with UI components
    if (!IMGBB_API_KEY) {
        throw new Error("ImgBB API Key not configured in .env");
    }

    try {
        const formData = new FormData();
        
        if (typeof file === 'string') {
            // Base64 string
            const base64Data = file.includes(',') ? file.split(',')[1] : file;
            formData.append('image', base64Data);
        } else {
            // File or Blob
            formData.append('image', file);
        }

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

  // 1. IMGBB + SUPABASE METADATA (PRIMARY)
  if (IMGBB_API_KEY && supabase && user.id.length > 20) {
    console.log("[Storage] Attempting ImgBB Upload...");
    try {
        // A. Upload file to ImgBB
        const publicUrl = await uploadFileToR2(image.url);
        console.log("[Storage] ImgBB Upload Success");

        // C. Save Metadata to Supabase DB
        const { error: dbError } = await supabase
            .from(TABLE_NAME)
            .insert({
                id: image.id,
                user_id: user.id, 
                image_url: publicUrl, // ImgBB URL
                prompt: image.prompt,
                model_used: image.engine,
                created_at: new Date(image.timestamp).toISOString(),
                is_public: false
            });

        if (dbError) throw dbError;
        return;

    } catch (error: any) {
        console.error("ImgBB Upload Error details:", error);
        // Fallback continues below...
    }
  } 
  
  // 2. SUPABASE STORAGE (LEGACY BACKUP)
  else if (supabase && user.id.length > 20 && !IMGBB_API_KEY) {
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

export const cleanupExpiredImages = async (isSystemWide: boolean = false): Promise<number> => {
    let images: GeneratedImage[] = [];
    if (isSystemWide) {
        images = await getAllImagesSystemWide();
    } else {
        images = await getAllImagesFromStorage();
    }

    const now = Date.now();
    const EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days
    
    // Filter Expired Images
    const expiredImages = images.filter(img => {
        return !img.isShared && (now - img.timestamp > EXPIRATION_MS);
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
        expiredImages.forEach(img => store.delete(img.id));
        console.log("[Cleanup] Local Batch Deletion Complete.");
    } catch (e) {
        console.warn("[Cleanup] Local Delete Failed", e);
    }

    return expiredImages.length;
};
