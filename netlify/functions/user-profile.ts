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

        if (event.httpMethod === 'GET') {
            // --- THE DEFINITIVE "CLEANUP AND CREATE" LOGIC ---

            // 1. Detect Conflict: Check for an orphaned profile (same email, different ID)
            const { data: orphanedProfile, error: orphanCheckError } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', authUser.email!)
                .neq('id', authUser.id)
                .single();

            if (orphanCheckError && orphanCheckError.code !== 'PGRST116') { // PGRST116 = no rows found
                throw new Error(`Orphan check failed: ${orphanCheckError.message}`);
            }

            // 2. Cleanup: If an orphaned profile exists, delete it completely
            if (orphanedProfile) {
                console.log(`[CLEANUP] Found orphaned profile for ${authUser.email} with old ID ${orphanedProfile.id}. Deleting...`);
                
                // This is the safest way to delete a user and all their associated data
                // as it triggers all database cascade deletes.
                const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(orphanedProfile.id);

                if (deleteError) {
                    // Log the error but proceed, as the insert might still work if the user was partially deleted.
                    console.error(`[CLEANUP_ERROR] Failed to delete orphaned user ${orphanedProfile.id}:`, deleteError.message);
                } else {
                    console.log(`[CLEANUP_SUCCESS] Successfully deleted orphaned user ${orphanedProfile.id}.`);
                }
            }

            // 3. Create or Fetch: Now, try to get the correct profile. If it doesn't exist, create it.
            let { data: finalProfile, error: finalProfileError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', authUser.id)
                .single();

            if (!finalProfile) { // Profile for the NEW ID doesn't exist, so create it.
                console.log(`[CREATE] No profile found for new ID ${authUser.id}. Creating new profile...`);
                const { data: newProfile, error: insertError } = await supabaseAdmin
                    .from('users')
                    .insert({
                        id: authUser.id,
                        email: authUser.email!,
                        display_name: authUser.user_metadata?.full_name || 'Tân Binh',
                        photo_url: authUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${authUser.id}`,
                    })
                    .select()
                    .single();
                
                if (insertError) {
                    console.error('[CREATE FAILED]', insertError);
                    throw new Error(`Failed to create new profile after cleanup: ${insertError.message}`);
                }
                finalProfile = newProfile;
            }
            
            console.log(`[SUCCESS] Profile for ${authUser.email} is ensured to be correct.`);
            return { statusCode: 200, body: JSON.stringify(finalProfile) };
        }
        
        // --- PUT Method: Update User Profile (unchanged) ---
        if (event.httpMethod === 'PUT') {
            const { display_name } = JSON.parse(event.body || '{}');
            if (!display_name || typeof display_name !== 'string' || display_name.length > 50) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid display name.' }) };
            }
            const { data, error } = await supabaseAdmin.from('users').update({ display_name: display_name.trim() }).eq('id', authUser.id).select('display_name').single();
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