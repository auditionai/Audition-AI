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
            // Step 1: Prepare the profile data with safe defaults.
            const profileData = {
                id: user.id, // The NEW, correct ID from auth.users
                email: user.email!, // The email that might be causing a conflict
                display_name: user.user_metadata?.full_name || 'Tân Binh',
                photo_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`,
            };

            if (!profileData.email) {
                throw new Error("User email is missing from JWT, cannot create profile.");
            }

            // Step 2: Perform an atomic UPSERT using the 'email' column for conflict resolution.
            // If a user with this email exists, it will UPDATE the row with the new data (including the new ID).
            // If not, it will INSERT a new row. This permanently fixes the "orphan profile" issue.
            const { error: upsertError } = await supabaseAdmin
                .from('users')
                .upsert(profileData, {
                    onConflict: 'email',
                });
            
            if (upsertError) {
                // This will now only trigger on a real database issue, not a simple duplicate.
                throw new Error(`Database error during profile creation: ${upsertError.message}`);
            }

            // Step 3: Now that the profile is guaranteed to exist and have the correct ID, fetch it.
            const { data: finalProfile, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single(); // We can safely use single() because the ID is now unique and correct.

            if (fetchError) {
                // This would be an unexpected error after a successful upsert.
                throw new Error(`Failed to fetch profile after upsert: ${fetchError.message}`);
            }

            return { statusCode: 200, body: JSON.stringify(finalProfile) };
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