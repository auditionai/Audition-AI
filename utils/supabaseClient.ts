import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Gets the Supabase client instance, initializing it asynchronously and dynamically on the first call.
 * This is the core of the freeze fix: by delaying the `import`, we prevent the Supabase library
 * from executing its initialization code (which reads localStorage) at the top level, thus avoiding
 * catastrophic crashes when the stored session is in a "poisonous" state.
 * @returns A Promise that resolves to the SupabaseClient instance or null if initialization fails.
 */
export const getSupabaseClient = async (): Promise<SupabaseClient | null> => {
    // Singleton pattern: If the client already exists, return it.
    if (supabaseInstance) {
        return supabaseInstance;
    }

    try {
        // Dynamically import the createClient function.
        // This is the CRITICAL change: the module is only loaded and executed when this function is called.
        const { createClient } = await import('@supabase/supabase-js');
        
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error("Supabase URL or Anon Key is missing.");
            return null;
        }

        // Create and store the client for future calls.
        supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
        return supabaseInstance;
    } catch (error) {
        console.error("CRITICAL FAILURE: Failed to dynamically import or create Supabase client. This is likely due to corrupted localStorage state that the Supabase library cannot handle on initialization.", error);
        // This failure is now caught gracefully instead of freezing the entire browser tab.
        return null;
    }
};
