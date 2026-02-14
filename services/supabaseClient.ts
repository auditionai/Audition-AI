
import { createClient } from '@supabase/supabase-js';

// Access Environment Variables (Vite standard)
const metaEnv = (import.meta as any).env || {};
// Fallback safely if process is not defined
const processEnv = typeof window !== 'undefined' && window.process ? window.process.env : {};

const supabaseUrl = metaEnv.VITE_SUPABASE_URL || processEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || processEnv.VITE_SUPABASE_ANON_KEY;

let client = null;

// Initialize Supabase safely - prevent module-level crashes
try {
    if (supabaseUrl && supabaseAnonKey) {
        client = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        // Log connected Project ID (Safe log)
        const projectId = supabaseUrl.split('//')[1]?.split('.')[0] || 'Unknown';
        console.log(`[System] Supabase Client Initialized (Async). Project ID: ${projectId}`);
    } else {
        console.log("[System] Running in Offline Mode (No Supabase Config)");
    }
} catch (e) {
    console.warn("[System] Failed to initialize Supabase Client. Falling back to local mode.", e);
    client = null;
}

export const supabase = client;

export const checkSupabaseConnection = async (): Promise<{ db: boolean; storage: boolean; latency: number }> => {
    if (!supabase) return { db: false, storage: false, latency: 0 };
    
    const start = Date.now();
    try {
        // 1. Check DB Connection via a simple query
        const { error: dbError } = await supabase.from('profiles').select('id').limit(1);
        
        // Note: It might error if table doesn't exist, but connection is still technically 'ok' if error code isn't connection related (e.g. timeout)
        const dbStatus = !dbError || (dbError.code !== 'PGRST301' && !dbError.message?.includes('FetchError')); 

        // 2. Check Storage
        const { data, error: storageError } = await supabase.storage.from('images').list();
        const storageStatus = !storageError;

        const latency = Date.now() - start;
        return { db: dbStatus, storage: storageStatus, latency };
    } catch (e) {
        return { db: false, storage: false, latency: 0 };
    }
};
