
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const calculateLevelFromXp = (xp: number): number => {
    return Math.floor((xp || 0) / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const { postId } = event.queryStringParameters || {};
    if (!postId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Post ID is required' }) };
    }

    try {
        // 1. Fetch Raw Comments
        const { data: comments, error: commentsError } = await supabaseAdmin
            .from('post_comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (commentsError) throw commentsError;

        if (!comments || comments.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // 2. Collect User IDs
        const userIds = [...new Set(comments.map((c: any) => c.user_id))];

        // 3. Fetch User Details (Using Admin Client - Bypasses RLS)
        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('*')
            .in('id', userIds);

        if (usersError) throw usersError;

        // Create User Map
        const userMap = new Map<string, any>();
        users?.forEach((u: any) => {
            userMap.set(u.id, u);
        });

        // 4. Map Comments with User Data
        const enrichedComments = comments.map((comment: any) => {
            const user = userMap.get(comment.user_id);
            
            // Logic to resolve parent user for replies
            let parentUser = null;
            if (comment.parent_id) {
                const parentComment = comments.find((c: any) => c.id === comment.parent_id);
                if (parentComment) {
                    const pUser = userMap.get(parentComment.user_id);
                    if (pUser) {
                        parentUser = { display_name: pUser.display_name };
                    }
                }
            }

            // Fallback user object if missing in DB (should be rare with Admin fetch)
            const displayUser = user ? {
                ...user,
                level: calculateLevelFromXp(user.xp || 0)
            } : {
                display_name: 'Người dùng', // Fallback name
                photo_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${comment.user_id}`, // Deterministic avatar
                level: 1
            };

            return {
                ...comment,
                user: displayUser,
                parent_comment: parentUser ? { user: parentUser } : null
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(enrichedComments),
        };

    } catch (error: any) {
        console.error("Get comments error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
