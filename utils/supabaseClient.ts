import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
    // Singleton pattern: If the client already exists, return it.
    if (supabase) {
        return supabase;
    }
    
    // The VITE_ prefix is crucial for Vite to expose these variables to the client-side code.
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Graceful failure: If env vars are missing, log an error and return null.
    // The AuthProvider will handle this null value and prevent the app from crashing.
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase URL or Anon Key is missing. The application cannot connect to the backend.");
        return null;
    }

    // Create and store the client for future calls.
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    return supabase;
};
