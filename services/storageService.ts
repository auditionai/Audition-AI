
import { GeneratedImage } from '../types';
import { supabase } from './supabaseClient';
import { getUserProfile } from './economyService';

const DB_NAME = 'DMP_AI_Studio_DB';
const STORE_NAME = 'images';
const TABLE_NAME = 'generated_images';
const BUCKET_NAME = 'images';

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

const base64ToBlob = (base64: string): Blob => {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

// --- MAIN SERVICE FUNCTIONS ---

export const saveImageToStorage = async (image: GeneratedImage): Promise<void> => {
  // Get current user to attach author name
  const user = await getUserProfile();
  const imageWithUser = { ...image, userName: user.username, isShared: false };

  // 1. SUPABASE (CLOUD)
  if (supabase) {
    try {
      const blob = base64ToBlob(image.url);
      const fileName = `${image.id}.png`;
      
      // Upload file
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, blob, { upsert: true });

      if (uploadError) throw uploadError;

      // Get URL
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      // Save Metadata
      const { error: dbError } = await supabase
        .from(TABLE_NAME)
        .insert({
          id: image.id,
          url: publicUrl,
          prompt: image.prompt,
          timestamp: new Date(image.timestamp).toISOString(),
          tool_name: image.toolName,
          tool_id: image.toolId,
          engine: image.engine,
          user_name: user.username,
          is_shared: false
        });

      if (dbError) throw dbError;
      return; 
    } catch (error) {
      console.error("Supabase Error (Fallback to Local):", error);
    }
  }

  // 2. INDEXED DB (LOCAL)
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
    // 1. SUPABASE
    if (supabase) {
        try {
            const { error } = await supabase
                .from(TABLE_NAME)
                .update({ is_shared: isShared })
                .eq('id', id);
            
            if (!error) return true;
        } catch (e) {
            console.warn("Share cloud error", e);
        }
    }

    // 2. INDEXED DB
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
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .select('*')
                .eq('is_shared', true)
                .order('timestamp', { ascending: false })
                .limit(20);

            if (!error && data) {
                return data.map((row: any) => ({
                    id: row.id,
                    url: row.url,
                    prompt: row.prompt,
                    timestamp: new Date(row.timestamp).getTime(),
                    toolId: row.tool_id,
                    toolName: row.tool_name,
                    engine: row.engine,
                    isShared: row.is_shared,
                    userName: row.user_name
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
            // Filter shared only
            const shared = results.filter(img => img.isShared);
            resolve(shared.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20));
        };
        request.onerror = () => reject(request.error);
    });
};

export const getAllImagesFromStorage = async (): Promise<GeneratedImage[]> => {
  // 1. SUPABASE
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('timestamp', { ascending: false });

      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          url: row.url,
          prompt: row.prompt,
          timestamp: new Date(row.timestamp).getTime(),
          toolId: row.tool_id,
          toolName: row.tool_name,
          engine: row.engine,
          isShared: row.is_shared,
          userName: row.user_name
        }));
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

export const deleteImageFromStorage = async (id: string): Promise<void> => {
  if (supabase) {
    try {
        await supabase.from(TABLE_NAME).delete().eq('id', id);
        await supabase.storage.from(BUCKET_NAME).remove([`${id}.png`]);
    } catch (e) { console.warn("Delete cloud error", e); }
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
