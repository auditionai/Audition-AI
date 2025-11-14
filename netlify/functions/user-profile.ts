import { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const MAX_RETRIES = 4;
const RETRY_DELAY = 500; // ms

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
            let userProfile = null;

            // 1. Poll for the user profile, expecting the DB trigger to create it.
            for (let i = 0; i < MAX_RETRIES; i++) {
                const { data, error } = await supabaseAdmin
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (error && error.code !== 'PGRST116') { // PGRST116 = "No rows found"
                    throw error; // A real database error occurred
                }

                if (data) {
                    userProfile = data;
                    break; // Profile found, exit loop
                }

                // Profile not found, wait and retry with increasing delay
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
            }

            // 2. If polling fails, the trigger likely failed. Attempt a manual insert as a fallback.
            if (!userProfile) {
                console.warn(`[user-profile] Profile for ${user.id} not found after polling. DB trigger may have failed. Attempting manual insert.`);

                const fallbackProfileData = {
                    id: user.id,
                    email: user.email || `${user.id}@auditionai.placeholder`,
                    display_name: user.user_metadata?.full_name || 'Tân Binh',
                    photo_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`,
                };

                const { data: insertedProfile, error: insertError } = await supabaseAdmin
                    .from('users')
                    .insert(fallbackProfileData)
                    .select()
                    .single();

                if (insertError) {
                    // It might fail with a unique constraint violation if the trigger finally ran.
                    // In that case, we can try one last fetch.
                    if (insertError.code === '23505') { // unique_violation
                        console.log(`[user-profile] Manual insert failed due to race condition. Retrying final fetch.`);
                        const { data: finalAttemptProfile, error: finalFetchError } = await supabaseAdmin
                            .from('users')
                            .select('*')
                            .eq('id', user.id)
                            .single();
                        
                        if (finalFetchError) throw finalFetchError;
                        userProfile = finalAttemptProfile;
                    } else {
                        // A different error occurred during insert
                        throw insertError;
                    }
                } else {
                    userProfile = insertedProfile;
                }
            }
            
            // 3. If after all attempts we still don't have a profile, it's a critical failure.
            if (!userProfile) {
                 throw new Error(`CRITICAL: Unable to fetch or create profile for user ${user.id}.`);
            }

            return { statusCode: 200, body: JSON.stringify(userProfile) };
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