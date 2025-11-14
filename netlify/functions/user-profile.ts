import { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Authenticate user
    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header required.' }) };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token missing.' }) };
    }

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: `Unauthorized: ${authError?.message || 'Invalid token.'}` }) };
        }

        // --- GET Method: Get or Create User Profile ---
        if (event.httpMethod === 'GET') {
            // 2. Prepare profile data with safe defaults for the upsert operation.
            const profileToUpsert = {
                id: user.id,
                email: user.email || `${user.id}@auditionai.placeholder`,
                display_name: user.user_metadata?.full_name || 'Tân Binh',
                photo_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`,
            };

            // 3. Perform an atomic UPSERT.
            // This inserts the user if they don't exist, or does nothing if they do (based on primary key `id`).
            // This completely prevents race conditions.
            const { error: upsertError } = await supabaseAdmin
                .from('users')
                .upsert(profileToUpsert);

            if (upsertError) {
                console.error('[user-profile] Upsert failed:', upsertError);
                throw new Error(`Database error during profile creation: ${upsertError.message}`);
            }

            // 4. Fetch the complete profile. It is now GUARANTEED to exist.
            // CRITICAL FIX: Do NOT use .single(). Fetch as an array and take the first element.
            // This makes the function resilient to pre-existing duplicate user entries.
            const { data: userProfiles, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', user.id);

            if (fetchError) {
                throw new Error(`Database error fetching profile: ${fetchError.message}`);
            }

            if (!userProfiles || userProfiles.length === 0) {
                 // This case should be virtually impossible after a successful upsert.
                throw new Error(`CRITICAL: Profile for user ${user.id} not found after successful upsert.`);
            }
            
            // Return the first profile found, ignoring potential duplicates.
            const userProfile = userProfiles[0];

            return { statusCode: 200, body: JSON.stringify(userProfile) };
        }
        
        // --- PUT Method: Update User Profile ---
        if (event.httpMethod === 'PUT') {
            const { display_name } = JSON.parse(event.body || '{}');

            if (!display_name || typeof display_name !== 'string' || display_name.length > 50) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid display name.' }) };
            }

            const { data, error } = await supabaseAdmin
                .from('users')
                .update({ display_name: display_name.trim() })
                .eq('id', user.id)
                .select('display_name')
                .single();

            if (error) {
                throw error;
            }
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    } catch (error: any) {
        console.error(`[user-profile] Unhandled error:`, error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: error.message || 'An internal server error occurred.' }) 
        };
    }
};

export { handler };