
import { createClient } from '@supabase/supabase-js';

// Access Environment Variables (Vite standard)
const metaEnv = (import.meta as any).env || {};
const supabaseUrl = metaEnv.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

let client = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        }
    });
    // Log connected Project ID (Safe log)
    const projectId = supabaseUrl.split('//')[1]?.split('.')[0] || 'Unknown';
    console.log(`[System] Supabase Initialized. Project ID: ${projectId}`);
  } catch (e) {
    console.warn("Lỗi khởi tạo Supabase, chuyển sang chế độ Local Storage", e);
  }
} else {
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. App running in offline mode.");
  console.log("Env Check:", { hasUrl: !!supabaseUrl, hasKey: !!supabaseAnonKey });
}

export const supabase = client;

export const checkSupabaseConnection = async (): Promise<{ db: boolean; storage: boolean; latency: number }> => {
    if (!supabase) return { db: false, storage: false, latency: 0 };
    
    const start = Date.now();
    try {
        // 1. Check DB Connection via a simple query
        const { error: dbError } = await supabase.from('profiles').select('id').limit(1);
        
        // Note: It might error if table doesn't exist, but connection is still technically 'ok' if error code isn't connection related
        const dbStatus = !dbError || (dbError.code !== 'PGRST301'); 

        // 2. Check Storage
        const { data, error: storageError } = await supabase.storage.from('images').list();
        const storageStatus = !storageError;

        const latency = Date.now() - start;
        return { db: dbStatus, storage: storageStatus, latency };
    } catch (e) {
        return { db: false, storage: false, latency: 0 };
    }
};
