
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        const { postId } = JSON.parse(event.body || '{}');
        if (!postId) return { statusCode: 400, body: JSON.stringify({ error: 'Post ID required' }) };

        // 1. Check if already liked
        const { data: existingLike } = await supabaseAdmin
            .from('post_likes')
            .select('*')
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .single();

        if (existingLike) {
            // Unlike
            await supabaseAdmin
                .from('post_likes')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', user.id);
            
            // Note: We usually don't delete notifications for unlikes to keep history simpler, 
            // or we could delete if we want "clean" history. For now, keep it simple.
        } else {
            // Like
            await supabaseAdmin
                .from('post_likes')
                .insert({ post_id: postId, user_id: user.id });

            // Create Notification
            const { data: post } = await supabaseAdmin.from('posts').select('user_id').eq('id', postId).single();
            
            if (post && post.user_id !== user.id) {
                const { data: userProfile } = await supabaseAdmin.from('users').select('display_name').eq('id', user.id).single();
                
                await supabaseAdmin.from('notifications').insert({
                    recipient_id: post.user_id,
                    actor_id: user.id,
                    type: 'like',
                    entity_id: postId,
                    content: `${userProfile?.display_name} đã thích bài viết của bạn.`,
                    is_read: false
                });
            }
        }

        return { statusCode: 200, body: JSON.stringify({ success: true }) };

    } catch (error: any) {
        console.error("Toggle like failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
