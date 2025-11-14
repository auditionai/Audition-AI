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
            // Step 1: Try to fetch the user profile
            const { data: existingProfile, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();

            // Step 2: If profile exists, return it
            if (existingProfile) {
                return { statusCode: 200, body: JSON.stringify(existingProfile) };
            }

            // Step 3: If profile does NOT exist (fetchError code PGRST116 means 0 rows found)
            // Create the profile on-the-fly. This makes the system resilient to trigger failures.
            if (!existingProfile && (fetchError?.code === 'PGRST116' || !fetchError)) {
                console.warn(`Profile for user ${user.id} not found. Creating it now.`);

                const newProfileData = {
                    id: user.id,
                    email: user.email,
                    // Extract metadata from the Google sign-in
                    display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'New User',
                    photo_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/8.x/initials/svg?seed=${user.email}`,
                    // Set default values directly, bypassing the need for another function call
                    diamonds: 10,
                    xp: 0
                };
                
                const { data: createdProfile, error: insertError } = await supabaseAdmin
                    .from('users')
                    .insert(newProfileData)
                    .select()
                    .single();

                if (insertError) {
                    // This could happen in a race condition where the trigger runs right after our check.
                    // In that case, we can try fetching one last time.
                    if (insertError.code === '23505') { // unique_violation
                         const { data: finalProfile, error: finalFetchError } = await supabaseAdmin.from('users').select('*').eq('id', user.id).single();
                         if (finalProfile) return { statusCode: 200, body: JSON.stringify(finalProfile) };
                         if (finalFetchError) return { statusCode: 500, body: JSON.stringify({ error: `Could not create or re-fetch user profile: ${finalFetchError.message}` }) };
                    }
                    console.error(`Failed to lazily create profile for ${user.id}:`, insertError);
                    return { statusCode: 500, body: JSON.stringify({ error: `Could not create user profile: ${insertError.message}` }) };
                }

                // Return the newly created profile
                return { statusCode: 201, body: JSON.stringify(createdProfile) };
            }
            
            // If it was a different kind of unhandled error, fail
            if (fetchError) {
                console.error(`Unhandled database error fetching profile for ${user.id}:`, fetchError);
                return { statusCode: 500, body: JSON.stringify({ error: `Database error: ${fetchError.message}` }) };
            }
            
            // Fallback for an unexpected case
            return { statusCode: 500, body: JSON.stringify({ error: 'An unknown error occurred while fetching the user profile.' }) };
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