
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

        // --- 1. FORCE SYNC: AGGRESSIVELY ENSURE USER EXISTS ---
        // Use data from the Auth token to repair/create the public user record immediately
        const meta = user.user_metadata || {};
        const displayName = meta.full_name || meta.name || `User ${user.id.substring(0,4)}`;
        const avatarUrl = meta.avatar_url || meta.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`;

        const { error: upsertError } = await supabaseAdmin.from('users').upsert({
            id: user.id,
            email: user.email || '',
            display_name: displayName,
            photo_url: avatarUrl,
        }, { onConflict: 'id', ignoreDuplicates: false }); // Force update to ensure latest info

        if (upsertError) console.warn("Like: User sync warning:", upsertError.message);

        // --- 2. TOGGLE LIKE ---
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

            // --- 3. NOTIFICATION LOGIC ---
            const { data: post } = await supabaseAdmin.from('posts').select('user_id').eq('id', postId).single();
            
            // Only notify if liking someone else's post
            if (post && post.user_id !== user.id) {
                
                // Check if a notification already exists (to avoid spamming or duplicates)
                // We use .maybeSingle() to avoid 406 errors if 0 rows
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
                    // Recycle existing notification: Mark unread + Update time
                    // This ensures it pops up again without creating DB clutter
                    await supabaseAdmin
                        .from('notifications')
                        .update({
                            is_read: false,
                            created_at: new Date().toISOString(),
                            content: `${displayName} đã thích bài viết của bạn.`
                        })
                        .eq('id', existingNotif.id);
                } else {
                    // Insert new notification
                    await supabaseAdmin.from('notifications').insert({
                        recipient_id: post.user_id,
                        actor_id: user.id,
                        type: 'like',
                        entity_id: postId,
                        content: `${displayName} đã thích bài viết của bạn.`,
                        is_read: false,
                        created_at: new Date().toISOString()
                    });
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
