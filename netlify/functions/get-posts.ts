
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const calculateLevelFromXp = (xp: number): number => {
    return Math.floor((xp || 0) / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    const { userId } = event.queryStringParameters || {};
    const targetUserId = userId || user.id;

    try {
        const { data, error } = await supabaseAdmin
            .from('posts')
            .select(`
                *,
                user:users (display_name, photo_url, xp, equipped_frame_id, equipped_title_id)
            `)
            .eq('user_id', targetUserId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const formattedPosts = (data || []).map((post: any) => {
            const userData = Array.isArray(post.user) ? post.user[0] : post.user;
            return {
                ...post,
                user: userData ? {
                    ...userData,
                    level: calculateLevelFromXp(userData.xp || 0)
                } : null
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(formattedPosts),
        };

    } catch (error: any) {
        console.error("Fetch posts error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
