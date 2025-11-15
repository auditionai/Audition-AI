import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Authenticate user
    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { code } = JSON.parse(event.body || '{}');
        if (!code || typeof code !== 'string') {
            return { statusCode: 400, body: JSON.stringify({ error: 'Giftcode is required.' }) };
        }

        // Call the RPC function in the database
        const { data, error } = await supabaseAdmin
            .rpc('redeem_gift_code', {
                p_code: code.trim(),
                p_user_id: user.id
            });

        // The RPC function will raise an exception on failure, which is caught here.
        if (error) {
            // The user-friendly error message comes directly from the database function.
            return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
        }

        // The RPC function returns a JSON object on success.
        return {
            statusCode: 200,
            body: JSON.stringify(data),
        };

    } catch (error: any) {
        console.error("Redeem gift code failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };