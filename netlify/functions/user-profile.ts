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
            try {
                // 1. Attempt to fetch the profile
                const { data: profile, error: fetchError } = await supabaseAdmin
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profile) {
                    console.log(`[user-profile] Profile found for user ${user.id}.`);
                    return { statusCode: 200, body: JSON.stringify(profile) };
                }

                if (fetchError && fetchError.code !== 'PGRST116') {
                    // This is an unexpected database error during fetch
                    throw new Error(`Initial fetch failed: ${fetchError.message}`);
                }

                // 2. Profile not found, so create it with safe defaults.
                console.log(`[user-profile] Profile not found for ${user.id}. Attempting to create.`);
                const newUserProfile = {
                    id: user.id,
                    email: user.email || `${user.id}@auditionai.placeholder`, // Use a placeholder if email is null
                    display_name: user.user_metadata?.full_name || 'Tân Binh', // "Newbie" in Vietnamese
                    photo_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`, // A default avatar
                };

                const { data: insertedProfile, error: insertError } = await supabaseAdmin
                    .from('users')
                    .insert(newUserProfile)
                    .select()
                    .single();

                if (insertedProfile) {
                    console.log(`[user-profile] Successfully created new profile for ${user.id}.`);
                    return { statusCode: 201, body: JSON.stringify(insertedProfile) };
                }

                // 3. Handle race condition: insertion failed, likely because the DB trigger just created the profile.
                if (insertError && insertError.code === '23505') { // unique_violation
                    console.warn(`[user-profile] Race condition detected for ${user.id}. Retrying fetch.`);
                    const { data: finalProfile, error: finalFetchError } = await supabaseAdmin
                        .from('users')
                        .select('*')
                        .eq('id', user.id)
                        .single();
                    
                    if (finalProfile) {
                        console.log(`[user-profile] Successfully fetched profile for ${user.id} after race condition.`);
                        return { statusCode: 200, body: JSON.stringify(finalProfile) };
                    }
                    
                    // This is a very weird state. The insert failed because the row exists, but we can't fetch it.
                    throw new Error(`Failed to fetch profile after race condition: ${finalFetchError?.message}`);
                }
                
                // 4. Handle other insertion errors
                if (insertError) {
                    throw new Error(`Insert failed: ${insertError.message}`);
                }

                // Fallback for an unknown state that should not be reached
                throw new Error('An unknown error occurred while fetching or creating the profile.');

            } catch (error: any) {
                console.error(`[user-profile] CRITICAL ERROR for user ${user.id}:`, error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: error.message || 'An internal server error occurred.' }) 
                };
            }
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

        default:import type { Handler, HandlerEvent } from "@netlify/functions";
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

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: `Unauthorized: ${authError?.message || 'Invalid token.'}` }) };
        }

        if (event.httpMethod === 'GET') {
            // This function now ensures a profile exists and returns it.
            // It uses `upsert` to atomically handle creation or updates, avoiding race conditions.
            
            const userProfileData = {
                id: user.id,
                email: user.email || `${user.id}@auditionai.placeholder`,
                display_name: user.user_metadata?.full_name || 'Tân Binh',
                photo_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`,
            };

            // Use `upsert`. This will INSERT if the user doesn't exist, or UPDATE if they do.
            // This is atomic and prevents race conditions with the database trigger.
            const { error: upsertError } = await supabaseAdmin
                .from('users')
                .upsert(userProfileData);

            if (upsertError) {
                // If the upsert fails, something is seriously wrong with the DB connection or schema.
                console.error(`[user-profile] CRITICAL UPSERT FAILED for user ${user.id}:`, upsertError);
                throw new Error(`Database operation failed: ${upsertError.message}`);
            }

            // After ensuring the profile exists, fetch the complete and current profile.
            // This guarantees we return the full profile with all default values (diamonds, xp, etc.).
            const { data: finalProfile, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();
            
            if (fetchError || !finalProfile) {
                console.error(`[user-profile] FAILED TO FETCH profile for user ${user.id} AFTER upsert:`, fetchError);
                throw new Error(`Could not retrieve user profile after creation/update.`);
            }

            return { statusCode: 200, body: JSON.stringify(finalProfile) };
        }
        
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
                // Let the main catch block handle this for consistent error logging
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