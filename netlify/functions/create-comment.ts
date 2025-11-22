
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
        const { postId, content, parentId } = JSON.parse(event.body || '{}');

        if (!postId || !content) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Post ID and Content are required' }) };
        }

        // --- CRITICAL FIX: Ensure User Exists in Public Table ---
        // Sometimes user is in Auth but not Public due to trigger failure.
        // We manually check and sync here to prevent "Unknown" comments.
        let { data: userProfile } = await supabaseAdmin
            .from('users')
            .select('display_name, photo_url')
            .eq('id', user.id)
            .single();
            
        if (!userProfile) {
            console.log(`[Auto-Sync] User ${user.id} missing in public table. Syncing now...`);
            // Call the handle_new_user RPC manually
            await supabaseAdmin.rpc('handle_new_user', {
                p_id: user.id,
                p_email: user.email || '',
                p_display_name: user.user_metadata?.full_name || 'Người dùng mới',
                p_photo_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`
            });
            
            // Refetch
            const { data: retryProfile } = await supabaseAdmin
                .from('users')
                .select('display_name, photo_url')
                .eq('id', user.id)
                .single();
            userProfile = retryProfile;
        }

        const senderName = userProfile?.display_name || 'Người dùng';

        // 2. Insert Comment
        const { data: comment, error: insertError } = await supabaseAdmin
            .from('post_comments')
            .insert({
                post_id: postId,
                user_id: user.id,
                content: content,
                parent_id: parentId || null
            })
            .select('id')
            .single();

        if (insertError) throw insertError;

        // 3. Create Notifications
        
        // 3a. Fetch Post Owner Info
        const { data: postData } = await supabaseAdmin
            .from('posts')
            .select('user_id')
            .eq('id', postId)
            .single();
        
        // Notify Post Owner (if not self)
        if (postData && postData.user_id !== user.id) {
            const { error: notifError } = await supabaseAdmin.from('notifications').insert({
                recipient_id: postData.user_id,
                actor_id: user.id, // Ensure this links to the public user we just verified
                type: 'comment',
                entity_id: postId,
                content: `${senderName} đã bình luận về bài viết của bạn.`,
                is_read: false
            });
            if (notifError) console.error("Failed to insert comment notification:", notifError);
        }

        // 3b. Notify Parent Comment Owner (if replying)
        if (parentId) {
            const { data: parentComment } = await supabaseAdmin
                .from('post_comments')
                .select('user_id')
                .eq('id', parentId)
                .single();
            
            // Only notify if the parent comment owner is NOT the current user AND NOT the post owner (to avoid double notification)
            if (parentComment && parentComment.user_id !== user.id && parentComment.user_id !== postData?.user_id) {
                 const { error: replyError } = await supabaseAdmin.from('notifications').insert({
                    recipient_id: parentComment.user_id,
                    actor_id: user.id,
                    type: 'reply',
                    entity_id: postId,
                    content: `${senderName} đã trả lời bình luận của bạn.`,
                    is_read: false
                });
                if (replyError) console.error("Failed to insert reply notification:", replyError);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, commentId: comment.id }),
        };

    } catch (error: any) {
        console.error("Create comment failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
