
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

        // --- 1. FORCE SYNC: AGGRESSIVELY ENSURE USER EXISTS IN PUBLIC TABLE ---
        // We fetch metadata from the Auth User object (which is the source of truth)
        const meta = user.user_metadata || {};
        const displayName = meta.full_name || meta.name || `User ${user.id.substring(0,4)}`;
        const avatarUrl = meta.avatar_url || meta.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`;

        // Perform UPSERT to public.users. This fixes the "Unknown" issue by forcing the data to exist.
        const { error: upsertError } = await supabaseAdmin.from('users').upsert({
            id: user.id,
            email: user.email || '',
            display_name: displayName,
            photo_url: avatarUrl,
            // We generally preserve existing XP/Diamonds, but if it's a new insert, defaults will apply from DB definition or be null
        }, { onConflict: 'id', ignoreDuplicates: false }); // update it to ensure fresh name/avatar

        if (upsertError) {
            console.error("User Sync Failed:", upsertError);
            // Don't throw, try to proceed, maybe the user exists
        }

        // --- 2. INSERT COMMENT ---
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

        // --- 3. ROBUST NOTIFICATION LOGIC ---
        
        // Fetch Post Owner
        const { data: postData } = await supabaseAdmin
            .from('posts')
            .select('user_id')
            .eq('id', postId)
            .single();
        
        // A. Notify Post Owner
        if (postData && postData.user_id !== user.id) {
            // Delete old unread notifications of same type to prevent spamming if they spam comments? 
            // No, for comments we usually keep all of them.
            
            const { error: notifError } = await supabaseAdmin.from('notifications').insert({
                recipient_id: postData.user_id,
                actor_id: user.id, 
                type: 'comment',
                entity_id: postId,
                content: `${displayName} đã bình luận về bài viết của bạn.`,
                is_read: false,
                created_at: new Date().toISOString()
            });
            
            if (notifError) console.error("Failed to insert comment notification:", notifError);
        }

        // B. Notify Parent Comment Owner (Reply)
        if (parentId) {
            const { data: parentComment } = await supabaseAdmin
                .from('post_comments')
                .select('user_id')
                .eq('id', parentId)
                .single();
            
            if (parentComment && parentComment.user_id !== user.id && parentComment.user_id !== postData?.user_id) {
                 const { error: replyError } = await supabaseAdmin.from('notifications').insert({
                    recipient_id: parentComment.user_id,
                    actor_id: user.id,
                    type: 'reply',
                    entity_id: postId,
                    content: `${displayName} đã trả lời bình luận của bạn.`,
                    is_read: false,
                    created_at: new Date().toISOString()
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
