
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const { conversationId } = event.queryStringParameters || {};
    if (!conversationId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing conversationId' }) };

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        // 1. Kiểm tra xem user có quyền xem hội thoại này không (Bằng cách check bảng participants)
        const { data: participation } = await supabaseAdmin
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id)
            .single();

        if (!participation) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        // 2. Lấy tin nhắn (Dùng Admin Client để bỏ qua RLS)
        const { data: messages, error } = await supabaseAdmin
            .from('direct_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify(messages || []),
        };

    } catch (error: any) {
        console.error("Get messages error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
