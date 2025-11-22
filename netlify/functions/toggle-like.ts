
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
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
        } else {
            // Like
            const { error: likeError } = await supabaseAdmin
                .from('post_likes')
                .insert({ post_id: postId, user_id: user.id });
            
            if (likeError) throw likeError;

            // Create or Update Notification
            const { data: post } = await supabaseAdmin.from('posts').select('user_id').eq('id', postId).single();
            
            // Only notify if liking someone else's post
            if (post && post.user_id !== user.id) {
                const { data: userProfile } = await supabaseAdmin.from('users').select('display_name').eq('id', user.id).single();
                const senderName = userProfile?.display_name || "Ai đó";
                
                // Check if a notification for this action exists (even if read)
                const { data: existingNotif } = await supabaseAdmin
                    .from('notifications')
                    .select('id')
                    .eq('recipient_id', post.user_id)
                    .eq('actor_id', user.id)
                    .eq('type', 'like')
                    .eq('entity_id', postId)
                    .limit(1)
                    .maybeSingle();

                if (existingNotif) {
                    // If exists, UPDATE it to be unread and fresh timestamp. 
                    // This triggers 'UPDATE' event in realtime, so client knows to show notification again.
                    const { error: updateError } = await supabaseAdmin
                        .from('notifications')
                        .update({
                            is_read: false,
                            created_at: new Date().toISOString(),
                            content: `${senderName} đã thích bài viết của bạn.` // Update content in case name changed
                        })
                        .eq('id', existingNotif.id);
                        
                    if (updateError) console.error("Failed to update like notification:", updateError);
                } else {
                    // If not exists, INSERT new
                    const { error: insertError } = await supabaseAdmin.from('notifications').insert({
                        recipient_id: post.user_id,
                        actor_id: user.id,
                        type: 'like',
                        entity_id: postId,
                        content: `${senderName} đã thích bài viết của bạn.`,
                        is_read: false
                    });
                    if (insertError) console.error("Failed to insert like notification:", insertError);
                }
            }
        }

        return { statusCode: 200, body: JSON.stringify({ success: true }) };

    } catch (error: any) {
        console.error("Toggle like failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
