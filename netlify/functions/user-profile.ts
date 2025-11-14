import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
    }

    switch (event.httpMethod) {
        case 'GET': {
            // 1. First attempt to fetch the profile
            const { data: profile, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();

            // If found, great, return it.
            if (profile) {
                return { statusCode: 200, body: JSON.stringify(profile) };
            }

            // If not found (PGRST116), proceed to create it. Any other error is a 500.
            if (fetchError && fetchError.code !== 'PGRST116') {
                console.error(`[user-profile] Initial fetch failed for ${user.id}:`, fetchError);
                return { statusCode: 500, body: JSON.stringify({ error: `Database error: ${fetchError.message}` }) };
            }

            // 2. Profile does not exist, so create it.
            // This acts as a reliable fallback if the DB trigger fails or is slow.
            const newUserProfile = {
                id: user.id,
                email: user.email,
                display_name: user.user_metadata?.full_name || 'New User',
                photo_url: user.user_metadata?.avatar_url || '',
            };

            const { data: insertedProfile, error: insertError } = await supabaseAdmin
                .from('users')
                .insert(newUserProfile)
                .select()
                .single();
            
            // If insertion was successful, return the new profile
            if (insertedProfile) {
                return { statusCode: 201, body: JSON.stringify(insertedProfile) };
            }

            // 3. Handle race condition: If insert failed because it already exists...
            if (insertError && insertError.code === '23505') { // 23505 = unique_violation
                console.warn(`[user-profile] Race condition detected for ${user.id}. Retrying fetch...`);
                // ...try fetching one more time.
                const { data: finalProfile, error: finalFetchError } = await supabaseAdmin
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                
                if (finalProfile) {
                    return { statusCode: 200, body: JSON.stringify(finalProfile) };
                }
                
                // If this final fetch fails, something is seriously wrong.
                console.error(`[user-profile] Final fetch failed for ${user.id} after race condition:`, finalFetchError);
                return { statusCode: 500, body: JSON.stringify({ error: 'Failed to retrieve profile after race condition.' }) };
            }
            
            // If insert failed for any other reason, it's a server error.
            if (insertError) {
                console.error(`[user-profile] Insert failed for ${user.id}:`, insertError);
                return { statusCode: 500, body: JSON.stringify({ error: `Could not create user profile: ${insertError.message}` }) };
            }

            // Fallback for an unknown state
            return { statusCode: 500, body: JSON.stringify({ error: 'An unknown error occurred while fetching or creating the profile.' }) };
        }

        case 'PUT': {
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
                return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            }
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };