import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        const { conversationId } = JSON.parse(event.body || '{}');
        if (!conversationId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing conversationId' }) };

        // Cập nhật tất cả tin nhắn trong hội thoại này thành đã đọc, 
        // TRỪ những tin nhắn do chính user gửi (vì user gửi thì user đã đọc rồi/không cần mark read cho chính mình)
        // VÀ chỉ mark những tin chưa đọc.
        const { error } = await supabaseAdmin
            .from('direct_messages')
            .update({ is_read: true })
            .eq('conversation_id', conversationId)
            .eq('is_read', false)
            .neq('sender_id', user.id); // Quan trọng: Chỉ mark tin nhắn người khác gửi cho mình

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };

    } catch (error: any) {
        console.error("Mark read error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };