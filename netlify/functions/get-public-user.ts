
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const { userId } = event.queryStringParameters || {};

    if (!userId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'User ID is required.' }) };
    }

    try {
        // Fetch user public profile data
        // CHANGED: Use select('*') to be safer against schema mismatches (missing bio, stats columns)
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error("Error fetching user:", error);
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found or database error.' }) };
        }

        // Optional: Increment profile views asynchronously
        // We wrap this in a try-catch block specifically to ensure it doesn't crash the main request
        try {
             await supabaseAdmin.rpc('increment_profile_views', { user_id_param: userId });
        } catch (rpcError) {
            console.warn("Failed to increment view count (RPC likely missing):", rpcError);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(user),
        };

    } catch (error: any) {
        console.error("get-public-user fatal error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
