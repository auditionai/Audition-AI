
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
    const projectId = supabaseUrl.split('//')[1]?.split('.')[0] || 'Unknown';
    console.log(`[System] Supabase Initialized. Project ID: ${projectId}`);
  } catch (e) {
    console.warn("Lỗi khởi tạo Supabase, chuyển sang chế độ Local Storage", e);
  }
} else {
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. App running in offline mode.");
}

export const supabase = client;

export const checkSupabaseConnection = async (): Promise<{ db: boolean; storage: boolean; latency: number }> => {
    if (!supabase) return { db: false, storage: false, latency: 0 };
    
    const start = Date.now();
    try {
        const { error: dbError } = await supabase.from('users').select('id').limit(1);
        const dbStatus = !dbError || (dbError.code !== 'PGRST301'); 
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
            queryParams: { access_type: 'offline', prompt: 'consent' },
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

    // 1. Create Auth User
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

    // 2. MANUAL INSERT (FAIL-SAFE)
    // We try to insert using the schema that matches economyService.ts (diamonds, photo_url)
    // This allows the app to work even if the Server Trigger fails or is missing.
    if (data.user) {
        console.log("Auth User created. Attempting manual profile creation...");
        
        // Wait briefly for any triggers
        await new Promise(r => setTimeout(r, 500));

        // Check if profile exists
        const { data: profile } = await supabase.from('users').select('id').eq('id', data.user.id).single();

        if (!profile) {
            console.warn("Profile missing. Executing Manual Insert with Legacy Schema...");
            
            // USING CORRECT COLUMN NAMES BASED ON YOUR ECONOMY SERVICE
            const { error: insertError } = await supabase.from('users').insert({
                id: data.user.id,
                email: email,
                display_name: displayName,
                diamonds: 0,        // Correct: diamonds, not balance
                photo_url: '',      // Correct: photo_url, not avatar_url
                is_admin: false,    // Correct: is_admin, not role
                created_at: new Date().toISOString()
            });

            if (insertError) {
                // If this fails with 23505, it means the Trigger actually worked -> Good
                if (insertError.code === '23505') {
                    console.log("Profile already exists (Trigger worked).");
                } else {
                    console.error("Manual Insert Failed:", insertError);
                }
            } else {
                console.log("Manual Insert Successful.");
            }
        }
    }

    return { data, error };
};
