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
        if (!postId) return { statusCode: 400, body: JSON.stringify({ error: 'Post ID is required' }) };

        // Verify ownership
        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('user_id')
            .eq('id', postId)
            .single();

        if (!post) return { statusCode: 404, body: JSON.stringify({ error: 'Post not found' }) };
        
        // Check if user is owner or admin
        const { data: userProfile } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
        
        if (post.user_id !== user.id && !userProfile?.is_admin) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        // Delete post (Cascade deletion should handle comments/likes in DB if configured, otherwise explicit delete needed)
        // Assuming Supabase Cascade Delete is ON for foreign keys
        const { error: deleteError } = await supabaseAdmin
            .from('posts')
            .delete()
            .eq('id', postId);

        if (deleteError) throw deleteError;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Đã xóa bài viết.' }),
        };

    } catch (error: any) {
        console.error("Delete post failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };