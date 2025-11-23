
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
        // 1. Fetch user public profile data
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error("Error fetching user:", error);
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found or database error.' }) };
        }

        // 2. Manual Increment Logic (Robust approach without RPC)
        // Get current views, default to 0 if null
        const currentViews = user.profile_views || 0;
        const newViews = currentViews + 1;

        // Update the database
        await supabaseAdmin
            .from('users')
            .update({ profile_views: newViews })
            .eq('id', userId);

        // Update the returned object so the UI updates immediately
        user.profile_views = newViews;

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
