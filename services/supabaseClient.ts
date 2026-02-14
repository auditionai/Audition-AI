
import { createClient } from '@supabase/supabase-js';

// Access Environment Variables Safely
const metaEnv = (import.meta as any).env || {};
const processEnv = typeof window !== 'undefined' && (window as any).process ? (window as any).process.env : {};

const supabaseUrl = metaEnv.VITE_SUPABASE_URL || processEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || processEnv.VITE_SUPABASE_ANON_KEY;

let client = null;

// AGGRESSIVE SAFETY CHECK
try {
    if (supabaseUrl && supabaseAnonKey && typeof supabaseUrl === 'string' && supabaseUrl.startsWith('http')) {
        client = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        console.log("[System] Supabase Connected.");
    } else {
        console.warn("[System] Supabase Config Missing or Invalid. App will run in Offline Mode.");
    }
} catch (e) {
    console.error("[System] Supabase Init Crash Prevented:", e);
    client = null; 
}

// Export a safe client or null. 
// Usage sites must check "if (supabase)"
export const supabase = client;

// Safe connection checker that never throws
export const checkSupabaseConnection = async (): Promise<{ db: boolean; storage: boolean; latency: number }> => {
    if (!supabase) return { db: false, storage: false, latency: 0 };
    
    const start = Date.now();
    try {
        const { error: dbError } = await supabase.from('profiles').select('id').limit(1);
        const dbStatus = !dbError || (dbError.code !== 'PGRST301' && !dbError.message?.includes('FetchError')); 
        
        const latency = Date.now() - start;
        return { db: dbStatus, storage: true, latency };
    } catch (e) {
        return { db: false, storage: false, latency: 0 };
    }
};
