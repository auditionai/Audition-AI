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

        // --- GET Method: Fetch or Create User Profile via RPC ---
        if (event.httpMethod === 'GET') {
            const { data: profile, error: rpcError } = await supabaseAdmin
                .rpc('handle_new_user', {
                    p_id: authUser.id,
                    p_email: authUser.email!,
                    p_display_name: authUser.user_metadata?.full_name || 'Tân Binh',
                    p_photo_url: authUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${authUser.id}`,
                })
                .single(); // Ensure we get a single object, not an array

            if (rpcError) {
                throw new Error(`RPC 'handle_new_user' failed: ${rpcError.message}`);
            }
            
            if (!profile) {
                 throw new Error('RPC function returned no profile. This should not happen.');
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