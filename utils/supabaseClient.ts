import { createClient, SupabaseClient } from '@supabase/supabase-js';

// The VITE_ prefix is crucial for Vite to expose these variables to the client-side code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
    // Singleton pattern: if an instance already exists, return it.
    if (supabaseInstance) {
        return supabaseInstance;
    }

    // If environment variables are missing, log a critical error and return null.
    // This prevents the app from crashing and allows for graceful error handling.
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error(
            "FATAL: Supabase URL or Anon Key is missing. " +
            "The application cannot connect to the backend. " +
            "Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your environment."
        );
        return null;
    }

    // Create and store the new instance.
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    return supabaseInstance;
};
