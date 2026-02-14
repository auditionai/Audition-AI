
import { GeneratedImage } from '../types';
import { supabase } from './supabaseClient';
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_DOMAIN } from './r2Client';
import { getUserProfile } from './economyService';

const DB_NAME = 'DMP_AI_Studio_DB';
const STORE_NAME = 'images';
const TABLE_NAME = 'generated_images';

// --- INDEXED DB HELPERS ---
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
  const user = await getUserProfile();
  const imageWithUser = { ...image, userName: user.username, isShared: false };
  const client = await getR2Client();

  // 1. CLOUDFLARE R2 (IMAGE FILE) + SUPABASE (METADATA)
  if (client && supabase && user.id.length > 20 && R2_BUCKET_NAME && R2_PUBLIC_DOMAIN) {
    try {
      console.log("[Storage] Uploading to R2...");
      const blob = base64ToBlob(image.url);
      const contentType = image.url.substring(5, image.url.indexOf(';')); 
      const fileName = `${user.id}/${image.id}.png`;
      
      // Dynamic import Command
      // @ts-ignore
      const { PutObjectCommand } = await import("https://esm.sh/@aws-sdk/client-s3@3.620.0");

      const command = new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          Body: blob,
          ContentType: contentType,
      });

      await client.send(command);

      const publicUrl = `${R2_PUBLIC_DOMAIN}/${fileName}`;
      console.log("[Storage] Uploaded:", publicUrl);

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
    } catch (error: any) {
      console.warn("Cloud Save Failed (Using Local):", error.message);
    }
  }

  // 2. INDEXED DB (LOCAL FALLBACK)
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
    if (supabase) {
        try {
            const { error } = await supabase
                .from(TABLE_NAME)
                .update({ is_public: isShared }) 
                .eq('id', id);
            if (!error) return true;
        } catch (e) { console.warn("Share error", e); }
    }

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
            const data = getReq.result as GeneratedImage;
            if (data) {
                data.isShared = isShared;
                store.put(data).onsuccess = () => resolve(true);
            } else {
                resolve(false);
            }
        };
        getReq.onerror = () => reject(getReq.error);
    });
};

export const getShowcaseImages = async (): Promise<GeneratedImage[]> => {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .select('*, users(display_name)')
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!error && data) {
                return data.map((row: any) => ({
                    id: row.id,
                    url: row.image_url,
                    prompt: row.prompt,
                    timestamp: new Date(row.created_at).getTime(),
                    toolId: 'gen_tool',
                    toolName: row.model_used || 'AI Tool',
                    engine: row.model_used,
                    isShared: row.is_public,
                    userName: row.users?.display_name || 'Artist'
                }));
            }
        } catch (e) { console.warn("Fetch showcase error", e); }
    }

    const db = await openDB();
    return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result as GeneratedImage[];
            resolve(results.filter(img => img.isShared).sort((a, b) => b.timestamp - a.timestamp).slice(0, 20));
        };
        request.onerror = () => resolve([]);
    });
};

export const getAllImagesFromStorage = async (): Promise<GeneratedImage[]> => {
  let cloudImages: GeneratedImage[] = [];
  
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
                cloudImages = data.map((row: any) => ({
                    id: row.id,
                    url: row.image_url,
                    prompt: row.prompt,
                    timestamp: new Date(row.created_at).getTime(),
                    toolId: 'gen_tool',
                    toolName: row.model_used || 'AI Gen',
                    engine: row.model_used,
                    isShared: row.is_public,
                    userName: 'Me'
                }));
            }
        }
    } catch (e) {}
  }

  const db = await openDB();
  const localImages = await new Promise<GeneratedImage[]>((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as GeneratedImage[]) || []);
    request.onerror = () => resolve([]);
  });

  const imageMap = new Map<string, GeneratedImage>();
  localImages.forEach(img => imageMap.set(img.id, img));
  cloudImages.forEach(img => imageMap.set(img.id, img));

  return Array.from(imageMap.values()).sort((a, b) => b.timestamp - a.timestamp);
};

export const deleteImageFromStorage = async (id: string): Promise<void> => {
  const client = await getR2Client();
  
  if (client && supabase && R2_BUCKET_NAME) {
    try {
        const user = await getUserProfile();
        const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
        
        if (!error) {
            const fileName = `${user.id}/${id}.png`;
            // @ts-ignore
            const { DeleteObjectCommand } = await import("https://esm.sh/@aws-sdk/client-s3@3.620.0");
            const command = new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: fileName });
            await client.send(command);
        }
    } catch (e) { console.warn("Delete cloud error", e); }
  }

  const db = await openDB();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id).onsuccess = () => resolve();
  });
};
