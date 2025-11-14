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
            const { data: profile, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();

            if (fetchError) {
                // If the error code indicates "No rows found", this is expected if the DB trigger is slow.
                // Return a 404, and the client-side logic will handle the retry.
                if (fetchError.code === 'PGRST116') {
                    return { statusCode: 404, body: JSON.stringify({ error: 'User profile not found. Client should retry.' }) };
                }
                // For any other unexpected database error, it's a 500.
                console.error(`Database error fetching profile for ${user.id}:`, fetchError);
                return { statusCode: 500, body: JSON.stringify({ error: `Database error: ${fetchError.message}` }) };
            }

            if (profile) {
                return { statusCode: 200, body: JSON.stringify(profile) };
            }
            
            // Fallback case, should be covered by PGRST116.
            return { statusCode: 404, body: JSON.stringify({ error: 'User profile not found.' }) };
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