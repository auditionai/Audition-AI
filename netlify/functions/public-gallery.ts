import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // FIX: Use Supabase v1 `api.getUser(token)` instead of v2 `auth.getUser(token)` and correct the destructuring.
    const { user, error: authError } = await supabaseAdmin.auth.api.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('diamond_transactions_log')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50); // Limit to last 50 transactions for performance

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify(data || []),
        };

    } catch (error: any) {
        console.error("Failed to fetch transaction history:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };