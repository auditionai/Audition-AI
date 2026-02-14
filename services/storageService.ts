
import { GeneratedImage } from '../types';
import { supabase } from './supabaseClient';
import { getUserProfile } from './economyService';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";

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
    if (!r2Client) return false;
    try {
        await r2Client.send(new ListBucketsCommand({}));
        return true;
    } catch (e) {
        console.error("R2 Connection Check Failed (Check CORS or Keys)", e);
        return false;
    }
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
            // ATTEMPT 1: Fetch with User Info (Might fail due to RLS on users table for anon)
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

            // ATTEMPT 2: Fallback (Fetch images ONLY, ignore user info if joined query failed)
            // This ensures images show up even if User table is private
            if (error) {
                console.warn("Showcase: Joined query failed, retrying simple fetch...", error.message);
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
                    userName: 'Me'
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

export const deleteImageFromStorage = async (id: string): Promise<void> => {
  const user = await getUserProfile();
  
  if (supabase && user.id) {
    try {
        // A. Delete from R2 (if configured)
        if (r2Client) {
            const fileName = `${user.id}/${id}.png`;
            await r2Client.send(new DeleteObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: fileName
            }));
        } 
        // B. Delete from Supabase Storage (Legacy)
        else {
             await supabase.storage.from('images').remove([`${id}.png`]);
        }

        // C. Delete Metadata from DB
        await supabase.from(TABLE_NAME).delete().eq('id', id);

    } catch (e) { 
        console.warn("Delete cloud error", e); 
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
