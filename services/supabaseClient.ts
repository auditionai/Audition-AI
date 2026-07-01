
import { createClient } from '@supabase/supabase-js';

// Access Environment Variables (Vite standard)
const metaEnv = (import.meta as any).env || {};
const supabaseUrl = metaEnv.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

let client = null;
const SESSION_CACHE_TTL_MS = 5000;
let cachedSession: any = null;
let cachedUser: any = null;
let sessionFetchedAt = 0;
let inFlightSessionPromise: Promise<any> | null = null;
const BROWSER_DEVICE_KEY_STORAGE = 'audition_browser_device_key_v1';
const BROWSER_DEVICE_KEY_COOKIE = 'audition_device_key_v1';

if (supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        }
    });
    client.auth.onAuthStateChange((_event: any, session: any) => {
        cachedSession = session || null;
        cachedUser = session?.user || null;
        sessionFetchedAt = Date.now();
        inFlightSessionPromise = null;
    });
    const projectId = supabaseUrl.split('//')[1]?.split('.')[0] || 'Unknown';
    console.log(`[System] Supabase Initialized. Project ID: ${projectId}`);
  } catch (e) {
    console.warn("Lỗi khởi tạo Supabase, chuyển sang chế độ Local Storage", e);
  }
} else {
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. App running in offline mode.");
}

// Export as any to bypass strict type checks in legacy code, but ensure it's not null for the compiler if possible
export const supabase = client as any;

const hasFreshSessionCache = () => sessionFetchedAt > 0 && Date.now() - sessionFetchedAt < SESSION_CACHE_TTL_MS;

export const getSupabaseSession = async (force = false) => {
    if (!supabase) return null;

    if (!force && inFlightSessionPromise) {
        return inFlightSessionPromise;
    }

    if (!force && hasFreshSessionCache()) {
        return cachedSession;
    }

    inFlightSessionPromise = supabase.auth
        .getSession()
        .then(({ data }: any) => {
            cachedSession = data?.session || null;
            cachedUser = cachedSession?.user || null;
            sessionFetchedAt = Date.now();
            return cachedSession;
        })
        .finally(() => {
            inFlightSessionPromise = null;
        });

    return inFlightSessionPromise;
};

export const getSupabaseUser = async (force = false) => {
    if (!supabase) return null;

    if (!force && hasFreshSessionCache()) {
        return cachedUser;
    }

    const session = await getSupabaseSession(force);
    return session?.user || null;
};

export const getSupabaseAccessToken = async (force = false) => {
    const session = await getSupabaseSession(force);
    return session?.access_token || null;
};

export const getSupabaseAuthHeader = async (force = false) => {
    const accessToken = await getSupabaseAccessToken(force);
    if (!accessToken) {
        throw new Error("Unauthorized");
    }

    return {
        Authorization: `Bearer ${accessToken}`,
        'X-Audition-Device-Key': getBrowserDeviceKey(),
    };
};

export const getBrowserDeviceKey = () => {
    if (typeof window === 'undefined') return '';

    try {
        const existing = window.localStorage.getItem(BROWSER_DEVICE_KEY_STORAGE);
        if (existing && existing.length >= 24) return existing;

        const cookieMatch = document.cookie
            .split(';')
            .map((entry) => entry.trim())
            .find((entry) => entry.startsWith(`${BROWSER_DEVICE_KEY_COOKIE}=`));
        const cookieValue = cookieMatch ? decodeURIComponent(cookieMatch.split('=').slice(1).join('=')) : '';
        if (cookieValue && cookieValue.length >= 24) {
            window.localStorage.setItem(BROWSER_DEVICE_KEY_STORAGE, cookieValue);
            return cookieValue;
        }

        const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(BROWSER_DEVICE_KEY_STORAGE, next);
        document.cookie = `${BROWSER_DEVICE_KEY_COOKIE}=${encodeURIComponent(next)}; Max-Age=31536000; Path=/; SameSite=Lax`;
        return next;
    } catch {
        return '';
    }
};

export const clearSupabaseSessionCache = () => {
    cachedSession = null;
    cachedUser = null;
    sessionFetchedAt = 0;
    inFlightSessionPromise = null;
};

// --- SECONDARY CLIENT: CAULENHAU.IO.VN ---
const clhUrl = metaEnv.VITE_CAULENHAU_SUPABASE_URL || process.env.CAULENHAU_SUPABASE_URL;
const clhKey = metaEnv.VITE_CAULENHAU_SUPABASE_ANON_KEY || process.env.CAULENHAU_SUPABASE_ANON_KEY;

export const caulenhauClient = (clhUrl && clhKey) ? createClient(clhUrl, clhKey) : null;

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

export const signUpWithEmail = async (email: string, password: string, preferredDisplayName?: string) => {
    if (!supabase) return { data: null, error: { message: "Chức năng yêu cầu kết nối Database." } };
    
    const displayName = preferredDisplayName?.trim() || email.split('@')[0];

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
    // We try to insert using the schema that matches economyService.ts (vcoin_balance, photo_url)
    // This allows the app to work even if the Server Trigger fails or is missing.
    if (data.user) {
        console.log("Auth User created. Attempting manual profile creation...");
        
        // Wait briefly for any triggers
        await new Promise(r => setTimeout(r, 500));

        // Check if profile exists
        const { data: profile } = await supabase.from('users').select('id').eq('id', data.user.id).maybeSingle();

        if (!profile) {
            console.warn("Profile missing. Executing Manual Insert with Legacy Schema...");
            
            // USING CORRECT COLUMN NAMES BASED ON YOUR ECONOMY SERVICE
            const { error: insertError } = await supabase.from('users').upsert({
                id: data.user.id,
                email: email,
                display_name: displayName,
                vcoin_balance: 0,        // Updated: Set default to 0
                photo_url: '',      // Correct: photo_url, not avatar_url
                is_admin: false,    // Correct: is_admin, not role
                created_at: new Date().toISOString()
            }, { onConflict: 'id' });

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
