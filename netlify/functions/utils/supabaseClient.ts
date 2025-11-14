import { createClient } from '@supabase/supabase-js';

// Khởi tạo Supabase client cho môi trường server-side (Netlify Functions)
// Sử dụng service_role key để có quyền admin, bỏ qua mọi RLS policies.
// Các biến môi trường này phải được set trên Netlify UI.
const supabaseUrl = process.env.SUPABASE_URL; // CORRECTED: Removed 'VITE_' prefix
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase server environment variables are not set.");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});