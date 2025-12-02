
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // 1. Auth Check
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    // 2. Admin Check
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    const { action, contentToDelete } = JSON.parse(event.body || '{}');

    try {
        // --- MODE 1: DEDUPLICATE (Xóa tin trùng, giữ lại 1) ---
        if (action === 'deduplicate') {
            console.log("[Cleanup] Starting deduplication for System messages...");

            // Fetch ALL messages sent by System Bot
            // We select minimal fields to avoid memory issues
            const { data: messages, error: fetchError } = await supabaseAdmin
                .from('direct_messages')
                .select('id, conversation_id, content, created_at')
                .eq('sender_id', SYSTEM_BOT_ID)
                .order('created_at', { ascending: false }); // Mới nhất lên đầu

            if (fetchError) throw fetchError;

            if (!messages || messages.length === 0) {
                return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Không tìm thấy tin nhắn hệ thống nào.' }) };
            }

            const uniqueKeys = new Set<string>();
            const idsToDelete: string[] = [];

            for (const msg of messages) {
                // Key duy nhất: ID hội thoại + Nội dung tin nhắn
                // Vì ta đã sort mới nhất lên đầu, tin đầu tiên gặp sẽ được giữ lại (vào Set)
                // Các tin sau có cùng key sẽ bị xóa
                const key = `${msg.conversation_id}_${msg.content.trim()}`;
                
                if (uniqueKeys.has(key)) {
                    idsToDelete.push(msg.id);
                } else {
                    uniqueKeys.add(key);
                }
            }

            console.log(`[Cleanup] Found ${idsToDelete.length} duplicate messages to delete.`);

            // Batch Delete (Max 1000 at a time if needed, but Supabase handles large arrays reasonably well via filter)
            // Chia nhỏ mảng nếu quá lớn để tránh lỗi URL length hoặc timeout
            const BATCH_SIZE = 500;
            for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
                const batch = idsToDelete.slice(i, i + BATCH_SIZE);
                const { error: deleteError } = await supabaseAdmin
                    .from('direct_messages')
                    .delete()
                    .in('id', batch);
                
                if (deleteError) throw deleteError;
            }

            return { 
                statusCode: 200, 
                body: JSON.stringify({ 
                    success: true, 
                    message: `Đã quét ${messages.length} tin. Đã xóa ${idsToDelete.length} tin nhắn trùng lặp.` 
                }) 
            };
        }

        // --- MODE 2: RETRACT (Thu hồi toàn bộ tin nhắn có nội dung cụ thể) ---
        if (action === 'retract' && contentToDelete) {
            const { count, error } = await supabaseAdmin
                .from('direct_messages')
                .delete({ count: 'exact' })
                .eq('sender_id', SYSTEM_BOT_ID)
                .eq('content', contentToDelete);

            if (error) throw error;

            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: `Đã thu hồi tin nhắn khỏi ${count} hộp thư người dùng.`
                })
            };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action.' }) };

    } catch (error: any) {
        console.error("Cleanup error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
