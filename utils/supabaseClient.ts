import { createClient } from '@supabase/supabase-js';

// Fix: Use `process.env` to align with server-side code and avoid `import.meta.env` type errors.
// Vite will replace these with the actual values during the build process.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase URL or Anon Key is missing. Please check your .env file.");
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);