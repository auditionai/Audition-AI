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
        const { commentId } = JSON.parse(event.body || '{}');
        if (!commentId) return { statusCode: 400, body: JSON.stringify({ error: 'Comment ID is required' }) };

        // Verify ownership
        const { data: comment } = await supabaseAdmin
            .from('post_comments')
            .select('user_id, post_id')
            .eq('id', commentId)
            .single();

        if (!comment) return { statusCode: 404, body: JSON.stringify({ error: 'Comment not found' }) };

        // Allow deletion if: User is comment owner OR User is post owner OR User is Admin
        const { data: post } = await supabaseAdmin.from('posts').select('user_id').eq('id', comment.post_id).single();
        const { data: userProfile } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();

        const isCommentOwner = comment.user_id === user.id;
        const isPostOwner = post?.user_id === user.id;
        const isAdmin = userProfile?.is_admin;

        if (!isCommentOwner && !isPostOwner && !isAdmin) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        const { error: deleteError } = await supabaseAdmin
            .from('post_comments')
            .delete()
            .eq('id', commentId);

        if (deleteError) throw deleteError;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Đã xóa bình luận.' }),
        };

    } catch (error: any) {
        console.error("Delete comment failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };