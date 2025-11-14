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

        // --- GET Method: The definitive "Get or Create" User Profile Logic ---
        if (event.httpMethod === 'GET') {
            // Step 1: Attempt to fetch the user profile with the correct, current ID.
            const { data: correctProfile } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', authUser.id)
                .single();

            // If found, everything is perfect. Return the profile.
            if (correctProfile) {
                return { statusCode: 200, body: JSON.stringify(correctProfile) };
            }
            
            // Step 2: If no profile with the correct ID exists, check for a stale/orphaned profile
            // with the same email but a different (old) ID.
            const { data: staleProfile } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', authUser.email)
                .neq('id', authUser.id)
                .maybeSingle();

            // Step 3: If a stale profile is found, perform a full cleanup.
            if (staleProfile) {
                console.warn(`[CLEANUP] Found stale profile for email ${authUser.email} with old ID ${staleProfile.id}. Deleting it now.`);
                
                // Use the master admin function to delete the user from the entire system.
                const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(staleProfile.id);
                
                if (deleteError && deleteError.message !== 'User not found') {
                    console.error(`[CLEANUP] Error deleting stale user ${staleProfile.id} from auth:`, deleteError.message);
                } else {
                    console.log(`[CLEANUP] Successfully initiated deletion for stale user ${staleProfile.id}.`);
                }

                // CRITICAL FIX: Add a delay to allow the asynchronous cascade delete to complete in the database.
                // This prevents a race condition where the subsequent insert fails due to the old record still existing.
                console.log('[CLEANUP] Waiting for 2 seconds for DB cascade to complete...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Step 4: Create the new, correct user profile.
            // This runs for both brand-new users and users whose stale profile was just deleted.
            const newProfileData = {
                id: authUser.id,
                email: authUser.email!,
                display_name: authUser.user_metadata?.full_name || 'Tân Binh',
                photo_url: authUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${authUser.id}`,
            };

            const { data: createdProfile, error: insertError } = await supabaseAdmin
                .from('users')
                .insert(newProfileData)
                .select()
                .single();

            if (insertError) {
                 throw new Error(`Failed to create new profile after cleanup: ${insertError.message}`);
            }

            console.log(`[SUCCESS] Successfully created new profile for user ${authUser.id}`);
            return { statusCode: 201, body: JSON.stringify(createdProfile) };
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