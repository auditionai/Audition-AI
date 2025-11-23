
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
        const { conversationId, content, type = 'text' } = JSON.parse(event.body || '{}');

        if (!conversationId || !content) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing data' }) };
        }

        // 1. Kiểm tra quyền (User có trong hội thoại không)
        // Use limit(1).maybeSingle() to be safe against duplicates
        const { data: participation, error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (partError) {
             console.error("Send message participation check error:", partError);
        }

        if (!participation) {
            console.log(`User ${user.id} failed to send message to ${conversationId} (Not a participant)`);
            return { statusCode: 403, body: JSON.stringify({ error: 'You are not in this conversation' }) };
        }

        // 2. Gửi tin nhắn (Dùng Admin Client)
        const { data: msg, error: insertError } = await supabaseAdmin
            .from('direct_messages')
            .insert({
                conversation_id: conversationId,
                sender_id: user.id,
                content: content,
                type: type,
                is_read: false
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 3. Cập nhật thời gian hội thoại
        await supabaseAdmin
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        return {
            statusCode: 200,
            body: JSON.stringify(msg),
        };

    } catch (error: any) {
        console.error("Send message error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
