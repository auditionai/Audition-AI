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
        const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authUser) {
            return { statusCode: 401, body: JSON.stringify({ error: `Unauthorized: ${authError?.message || 'Invalid token.'}` }) };
        }

        // --- GET Method: The Definitive "Upsert" User Profile Logic ---
        if (event.httpMethod === 'GET') {
            
            // Prepare the data for the user profile. This data will be used for both
            // creating a new profile and updating an existing one (if the ID is stale).
            const profileData = {
                id: authUser.id,
                email: authUser.email!,
                display_name: authUser.user_metadata?.full_name || 'Tân Binh',
                photo_url: authUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${authUser.id}`,
            };

            // Perform the UPSERT operation.
            // This tells the database: "Try to INSERT this profileData. If a row
            // with this `email` already exists (onConflict), then UPDATE that
            // existing row with this new `profileData` instead of throwing an error."
            // This is an atomic operation, completely eliminating race conditions.
            const { data: upsertedProfile, error: upsertError } = await supabaseAdmin
                .from('users')
                .upsert(profileData, { onConflict: 'email' })
                .select()
                .single();

            if (upsertError) {
                console.error('[UPSERT FAILED]', upsertError);
                throw new Error(`Database error during profile creation: ${upsertError.message}`);
            }
            
            console.log(`[SUCCESS] Profile for ${authUser.email} is ensured to be correct.`);
            return { statusCode: 200, body: JSON.stringify(upsertedProfile) };
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

            if (error) {
                throw error;
            }
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