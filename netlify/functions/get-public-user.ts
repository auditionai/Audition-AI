
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
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('id, display_name, photo_url, xp, bio, total_likes, profile_views, weekly_points, equipped_frame_id, equipped_title_id')
            .eq('id', userId)
            .single();

        if (error) {
            console.error("Error fetching user:", error);
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }

        // Optional: Increment profile views asynchronously
        // We don't await this to keep response fast, but Netlify functions might kill it early.
        // For robustness in serverless, usually we await or use background functions.
        // Here we'll just await it as it's a fast RPC or update.
        await supabaseAdmin.rpc('increment_profile_views', { user_id_param: userId }).catch(console.error);

        return {
            statusCode: 200,
            body: JSON.stringify(user),
        };

    } catch (error: any) {
        console.error("get-public-user error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
