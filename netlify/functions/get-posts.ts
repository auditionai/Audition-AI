import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const calculateLevelFromXp = (xp: number): number => {
    return Math.floor((xp || 0) / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // 1. Identify the requester (Current User)
    const authHeader = event.headers['authorization'];
    let currentUserId = null;
    
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) currentUserId = user.id;
    }

    // 2. Determine whose posts to fetch (Target User)
    const { userId } = event.queryStringParameters || {};
    // If userId param exists, fetch that user's posts. Otherwise fetch requester's posts (My Profile).
    const targetUserId = userId || currentUserId;

    if (!targetUserId) {
         return { statusCode: 400, body: JSON.stringify({ error: 'User ID required' }) };
    }

    try {
        // 3. Fetch Posts
        const { data, error } = await supabaseAdmin
            .from('posts')
            .select(`
                *,
                user:users (display_name, photo_url, xp, equipped_frame_id, equipped_title_id)
            `)
            .eq('user_id', targetUserId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 4. Process Posts (Add is_liked_by_user flag)
        const posts = data || [];
        
        // If we have a logged-in user, check which posts they liked
        const postIds = posts.map(p => p.id);
        let likedPostIds = new Set<string>();

        if (currentUserId && postIds.length > 0) {
            const { data: likes } = await supabaseAdmin
                .from('post_likes')
                .select('post_id')
                .eq('user_id', currentUserId)
                .in('post_id', postIds);
            
            if (likes) {
                likes.forEach(l => likedPostIds.add(l.post_id));
            }
        }

        const formattedPosts = posts.map((post: any) => {
            const userData = Array.isArray(post.user) ? post.user[0] : post.user;
            return {
                ...post,
                is_liked_by_user: likedPostIds.has(post.id), // Server-side check
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