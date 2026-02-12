import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        // 1. Lấy danh sách các conversation ID mà user tham gia
        const { data: myParticipations } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', user.id);

        const conversationIds = myParticipations?.map(p => p.conversation_id) || [];

        if (conversationIds.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ count: 0 }) };
        }

        // 2. Đếm tổng số tin nhắn chưa đọc trong các hội thoại đó (người gửi != me)
        const { count, error } = await supabaseAdmin
            .from('direct_messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', conversationIds)
            .eq('is_read', false)
            .neq('sender_id', user.id);

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify({ count: count || 0 }),
        };

    } catch (error: any) {
        console.error("Get unread count error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };