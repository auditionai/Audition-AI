import { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Authenticate user (common for all methods)
    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header required.' }) };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token missing.' }) };
    }

    try {
        // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
        const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authUser) {
            return { statusCode: 401, body: JSON.stringify({ error: `Unauthorized: ${authError?.message || 'Invalid token.'}` }) };
        }

        // --- GET Method: Fetch or Create User Profile ---
        if (event.httpMethod === 'GET') {
            // Step 1: Call RPC to handle "new user" logic (create if not exists, insert defaults)
            // We rely on this mainly for the side-effect of creation/initialization.
            const { error: rpcError } = await supabaseAdmin
                .rpc('handle_new_user', {
                    p_id: authUser.id,
                    p_email: authUser.email!,
                    p_display_name: authUser.user_metadata?.full_name || 'Tân Binh',
                    p_photo_url: authUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${authUser.id}`,
                });

            if (rpcError) {
                console.warn(`RPC 'handle_new_user' warning: ${rpcError.message}`);
                // Continue execution, as the user might already exist and RPC just failed on duplicate key or similar, 
                // or we can try to fetch anyway.
            }
            
            // Step 2: CRITICAL FIX - Fetch directly from 'users' table.
            // The RPC return value might be cached or stale (missing new columns like equipped_name_effect_id).
            // Selecting '*' ensures we get the absolute latest schema structure.
            const { data: profile, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', authUser.id)
                .single();

            if (fetchError || !profile) {
                 throw new Error(`Failed to fetch user profile: ${fetchError?.message || 'Profile not found'}`);
            }

            return { statusCode: 200, body: JSON.stringify(profile) };
        }
        
        // --- PUT Method: Update User Profile (unchanged) ---
        if (event.httpMethod === 'PUT') {
            const { display_name } = JSON.parse(event.body || '{}');
            if (!display_name || typeof display_name !== 'string' || display_name.length > 50) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid display name.' }) };
            }
            const { data, error } = await supabaseAdmin
                .from('users')
                .update({ display_name: display_name.trim() })
                .eq('id', authUser.id)
                .select('display_name')
                .single();
            if (error) throw error;
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    } catch (error: any) {
        console.error(`[user-profile] CRITICAL ERROR:`, error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: error.message || 'An internal server error occurred.' }) 
        };
    }
};

export { handler };