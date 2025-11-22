
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
        const { data: { user } } = await (supabaseAdmin.auth as any).getUser(token);
        if (user) currentUserId = user.id;
    }

    // 2. Determine whose posts to fetch (Target User)
    const { userId } = event.queryStringParameters || {};
    const targetUserId = userId || currentUserId;

    if (!targetUserId) {
         return { statusCode: 400, body: JSON.stringify({ error: 'User ID required' }) };
    }

    try {
        // 3. Fetch Posts (Raw)
        const { data: posts, error } = await supabaseAdmin
            .from('posts')
            .select(`
                *,
                likes_count:post_likes(count),
                comments_count:post_comments(count)
            `)
            .eq('user_id', targetUserId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase get-posts error:", error);
            throw error;
        }

        if (!posts || posts.length === 0) {
             return { statusCode: 200, body: JSON.stringify([]) };
        }

        // 4. Fetch User Data Manually (Safe against missing FKs)
        const userIds = [...new Set(posts.map((p: any) => p.user_id))];
        const { data: users } = await supabaseAdmin
            .from('users')
            .select('*')
            .in('id', userIds);
            
        const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));

        // 5. Check "Is Liked By User" manually
        const postIds = posts.map((p: any) => p.id);
        let likedPostIds = new Set<string>();

        if (currentUserId && postIds.length > 0) {
            const { data: likes } = await supabaseAdmin
                .from('post_likes')
                .select('post_id')
                .eq('user_id', currentUserId)
                .in('post_id', postIds);
            
            if (likes) {
                likes.forEach((l: any) => likedPostIds.add(l.post_id));
            }
        }

        const formattedPosts = posts.map((post: any) => {
            const userData = userMap.get(post.user_id);
            
            // Extract counts
            const realLikesCount = post.likes_count?.[0]?.count ?? 0;
            const realCommentsCount = post.comments_count?.[0]?.count ?? 0;

            return {
                ...post,
                likes_count: realLikesCount,
                comments_count: realCommentsCount,
                is_liked_by_user: likedPostIds.has(post.id),
                user: userData ? {
                    ...userData,
                    level: calculateLevelFromXp(userData.xp || 0)
                } : {
                    display_name: 'Unknown User',
                    photo_url: null,
                    level: 1
                }
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(formattedPosts),
        };

    } catch (error: any) {
        console.error("Fetch posts fatal error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
