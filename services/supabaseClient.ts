
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
        const { error: dbError } = await supabase.from('users').select('id').limit(1);
        
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

export const signInWithGoogle = async () => {
    if (!supabase) return { error: { message: "Chức năng yêu cầu kết nối Database." } };
    return await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin,
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
        },
    });
};

export const signInWithEmail = async (email: string, password: string) => {
    if (!supabase) return { data: null, error: { message: "Chức năng yêu cầu kết nối Database." } };
    return await supabase.auth.signInWithPassword({ email, password });
};

export const signUpWithEmail = async (email: string, password: string) => {
    if (!supabase) return { data: null, error: { message: "Chức năng yêu cầu kết nối Database." } };
    
    const displayName = email.split('@')[0];

    // 1. Create Auth User with Explicit Metadata
    // Metadata is critical for the Trigger to pick up the name
    const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
            data: {
                display_name: displayName, 
                full_name: displayName,
                avatar_url: ''
            }
        }
    });

    if (error) return { data, error };

    // 2. Manual Insert Fallback (Belt and Suspenders)
    // We try to insert directly into public.users just in case the trigger fails or delays.
    if (data.user) {
        // Check if session exists. If not, Email Confirmation might be ON.
        // Without a session, RLS will block the insert below unless the policy allows 'anon' (which is insecure)
        // or the trigger handles it (which runs as admin).
        if (!data.session) {
            console.log("SignUp success but NO SESSION returned. Email confirmation likely required.");
            console.log("Skipping manual profile insert. Relying on DB Trigger.");
            return { data, error };
        }

        // Wait 100ms to avoid race condition with Trigger
        await new Promise(r => setTimeout(r, 100));

        const { error: profileError } = await supabase.from('users').insert({
            id: data.user.id,
            email: email,
            display_name: displayName,
            balance: 0,
            role: 'user',
            created_at: new Date().toISOString()
        });

        if (profileError) {
            // Ignore Duplicate Key error (23505) because it means Trigger worked!
            if (profileError.code === '23505') {
                 console.log("Trigger successfully created user before manual insert.");
            } else {
                 console.warn("Manual profile creation failed:", profileError.message, profileError.code);
            }
        }
    }

    return { data, error };
};
