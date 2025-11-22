
import { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { sendSystemMessage } from './utils/chatUtils';

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
        // FIX: Use Supabase v2 `auth.getUser` by casting to any
        const { data: { user: authUser }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
        if (authError || !authUser) {
            return { statusCode: 401, body: JSON.stringify({ error: `Unauthorized: ${authError?.message || 'Invalid token.'}` }) };
        }

        // --- GET Method: Fetch User Profile ---
        if (event.httpMethod === 'GET') {
            // OPTIMIZATION: Try to fetch the user directly first.
            // This prevents the 'handle_new_user' RPC from running unnecessarily and potentially 
            // resetting user fields (like equipped items) to default values on every page load.
            
            let { data: profile, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', authUser.id)
                .single();

            // If user doesn't exist, THEN try to create/init via RPC
            if (!profile || fetchError) {
                console.log("User not found in public table, initializing via RPC...");
                
                const { error: rpcError } = await supabaseAdmin
                    .rpc('handle_new_user', {
                        p_id: authUser.id,
                        p_email: authUser.email!,
                        p_display_name: authUser.user_metadata?.full_name || 'Tân Binh',
                        p_photo_url: authUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${authUser.id}`,
                    });

                if (rpcError) {
                    console.warn(`RPC 'handle_new_user' warning: ${rpcError.message}`);
                } else {
                    // --- NEW USER ONBOARDING LOGIC ---
                    // Send all historical system broadcasts to this new user
                    try {
                        const { data: broadcasts } = await supabaseAdmin
                            .from('system_broadcasts')
                            .select('content')
                            .order('created_at', { ascending: true }); // Chronological order

                        if (broadcasts && broadcasts.length > 0) {
                            console.log(`Sending ${broadcasts.length} historical broadcasts to new user ${authUser.id}`);
                            // Send sequentially to maintain order
                            for (const msg of broadcasts) {
                                await sendSystemMessage(authUser.id, msg.content);
                            }
                        }
                    } catch (broadcastError) {
                        console.error("Failed to send historical broadcasts:", broadcastError);
                    }
                }
                
                // Retry fetch after RPC
                const { data: newProfile, error: retryError } = await supabaseAdmin
                    .from('users')
                    .select('*')
                    .eq('id', authUser.id)
                    .single();
                
                if (retryError || !newProfile) {
                     throw new Error(`Failed to fetch/create user profile: ${retryError?.message || 'Unknown error'}`);
                }
                profile = newProfile;
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
