import { createClient } from '@supabase/supabase-js';

// The VITE_ prefix is crucial for Vite to expose these variables to the client-side code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    const errorMessage = "Supabase URL or Anon Key is missing. Make sure they are set in your Netlify build environment variables and prefixed with VITE_.";
    console.error(errorMessage);
    // Halt execution to make the configuration error obvious
    throw new Error(errorMessage);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);