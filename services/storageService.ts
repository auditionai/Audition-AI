import { GeneratedImage } from '../types';
import { supabase } from './supabaseClient';
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_DOMAIN } from './r2Client';
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getUserProfile } from './economyService';

const DB_NAME = 'DMP_AI_Studio_DB';
const STORE_NAME = 'images';
const TABLE_NAME = 'generated_images';

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
  const user = await getUserProfile();
  const imageWithUser = { ...image, userName: user.username, isShared: false };

  // 1. CLOUDFLARE R2 (IMAGE FILE) + SUPABASE (METADATA)
  if (r2Client && supabase && user.id.length > 20 && R2_BUCKET_NAME && R2_PUBLIC_DOMAIN) {
    try {
      console.log("[Storage] Attempting to upload to Cloudflare R2...");
      const blob = base64ToBlob(image.url);
      // Ensure strict Content-Type to allow browser viewing
      const contentType = image.url.substring(5, image.url.indexOf(';')); 
      const fileName = `${user.id}/${image.id}.png`; // Organize by UserID
      
      // Upload file to R2
      const command = new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          Body: blob,
          ContentType: contentType,
          // ACL: 'public-read' // R2 manages access via bucket settings/workers usually
      });

      await r2Client.send(command);

      // Construct Public URL (Assuming R2_PUBLIC_DOMAIN is configured like 'https://pub-xxx.r2.dev')
      const publicUrl = `${R2_PUBLIC_DOMAIN}/${fileName}`;
      console.log("[Storage] Uploaded to R2:", publicUrl);

      // Save Metadata to Supabase DB (Table 'generated_images')
      const { error: dbError } = await supabase
        .from(TABLE_NAME)
        .insert({
          id: image.id,
          user_id: user.id, 
          image_url: publicUrl, // Save R2 URL
          prompt: image.prompt,
          model_used: image.engine,
          created_at: new Date(image.timestamp).toISOString(),
          is_public: false 
        });

      if (dbError) {
          console.error("[Storage] DB Metadata Insert Failed:", dbError.message);
          throw dbError;
      }
      
      console.log("[Storage] Metadata saved to DB.");
      return; 
    } catch (error: any) {
      console.warn("R2/DB Error (Fallback to Local). Details:", error.message || error);
      if (process.env.NODE_ENV === 'development') alert("Cloud Save Failed: " + (error.message || "Unknown error"));
    }
  } else {
      if(!r2Client) console.warn("[Storage] R2 Client missing");
      if(!supabase) console.warn("[Storage] Supabase missing");
  }

  // 2. INDEXED DB (LOCAL FALLBACK)
  console.log("[Storage] Saving to Local IndexedDB...");
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
    // 1. SUPABASE METADATA UPDATE
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

    // 2. INDEXED DB UPDATE
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
    // 1. SUPABASE FETCH
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
                    url: row.image_url, // Use the stored R2 URL
                    prompt: row.prompt,
                    timestamp: new Date(row.created_at).getTime(),
                    toolId: 'gen_tool',
                    toolName: row.model_used || 'AI Tool',
                    engine: row.model_used,
                    isShared: row.is_public,
                    userName: row.users?.display_name || 'Artist'
                }));
            }
        } catch (e) {
            console.warn("Fetch showcase cloud error", e);
        }
    }

    // 2. INDEXED DB FETCH
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

export const getAllImagesFromStorage = async (): Promise<GeneratedImage[]> => {
  let cloudImages: GeneratedImage[] = [];
  
  // 1. SUPABASE FETCH (METADATA which points to R2 URL)
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
                    url: row.image_url, // Points to R2
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
    } catch (error) {
      console.error("Supabase Load Error (Merging Local):", error);
    }
  }

  // 2. INDEXED DB (LOCAL)
  const db = await openDB();
  const localImages = await new Promise<GeneratedImage[]>((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
        resolve((request.result as GeneratedImage[]) || []);
    };
    request.onerror = () => reject(request.error);
  });

  // 3. MERGE & DEDUPLICATE
  const imageMap = new Map<string, GeneratedImage>();
  localImages.forEach(img => imageMap.set(img.id, img));
  cloudImages.forEach(img => imageMap.set(img.id, img));

  return Array.from(imageMap.values()).sort((a, b) => b.timestamp - a.timestamp);
};

export const deleteImageFromStorage = async (id: string): Promise<void> => {
  // 1. CLOUDFLARE R2 DELETE + SUPABASE DB DELETE
  if (r2Client && supabase && R2_BUCKET_NAME) {
    try {
        const user = await getUserProfile();
        // Delete metadata first or after? Usually parallel is fine, but safety first.
        const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
        
        if (!error) {
            // Delete actual file from R2
            const fileName = `${user.id}/${id}.png`; 
            const command = new DeleteObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: fileName,
            });
            await r2Client.send(command);
        }
    } catch (e) { console.warn("Delete cloud error", e); }
  }

  // 2. INDEXED DB DELETE
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
