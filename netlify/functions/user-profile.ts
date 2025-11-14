import { Handler, HandlerEvent } from "@netlify/functions";
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