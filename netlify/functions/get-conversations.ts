
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    // 1. Xác thực người dùng
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        // 2. Lấy danh sách các cuộc hội thoại mà user tham gia
        const { data: myParticipations, error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', user.id);

        if (partError) throw partError;

        const conversationIds = myParticipations.map(p => p.conversation_id);

        if (conversationIds.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // 3. Lấy chi tiết cuộc hội thoại và người tham gia khác
        const { data: conversations, error: convError } = await supabaseAdmin
            .from('conversations')
            .select(`
                id, created_at, updated_at,
                participants:conversation_participants(
                    user_id
                )
            `)
            .in('id', conversationIds)
            .order('updated_at', { ascending: false });

        if (convError) throw convError;

        // 4. [NEW] Lấy số lượng tin nhắn chưa đọc cho từng hội thoại
        const { data: unreadMessages } = await supabaseAdmin
            .from('direct_messages')
            .select('conversation_id')
            .in('conversation_id', conversationIds)
            .eq('is_read', false)
            .neq('sender_id', user.id);

        const unreadCountMap = new Map<string, number>();
        unreadMessages?.forEach((msg: any) => {
            const count = unreadCountMap.get(msg.conversation_id) || 0;
            unreadCountMap.set(msg.conversation_id, count + 1);
        });

        // 5. Lấy thông tin User của các đối tác (bao gồm Cosmetics)
        const allParticipantIds = new Set<string>();
        conversations.forEach((c: any) => {
            c.participants.forEach((p: any) => allParticipantIds.add(p.user_id));
        });

        // CHANGED: Added equipped_frame_id, equipped_title_id, equipped_name_effect_id
        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, display_name, photo_url, equipped_frame_id, equipped_title_id, equipped_name_effect_id, xp')
            .in('id', Array.from(allParticipantIds));

        const userMap = new Map(users?.map(u => [u.id, u]));

        // 6. Format dữ liệu trả về frontend
        const formatted = conversations.map((c: any) => {
            // Tìm người không phải là mình
            let partnerId = c.participants.find((p: any) => p.user_id !== user.id)?.user_id;
            
            // Nếu không tìm thấy (chat với chính mình hoặc lỗi), fallback
            if (!partnerId) partnerId = user.id; 

            let partnerUser = userMap.get(partnerId);

            if (!partnerUser && partnerId === SYSTEM_BOT_ID) {
                partnerUser = {
                    id: SYSTEM_BOT_ID,
                    display_name: 'HỆ THỐNG',
                    photo_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=System',
                    equipped_frame_id: 'default', // Or specific system frame
                    equipped_name_effect_id: 'name-glitch' // Cool effect for system
                };
            } else if (!partnerUser) {
                partnerUser = {
                    id: partnerId,
                    display_name: 'Người dùng ẩn danh',
                    photo_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Unknown'
                };
            }

            return {
                id: c.id,
                created_at: c.created_at,
                updated_at: c.updated_at,
                participants: [{ user: partnerUser }],
                unread_count: unreadCountMap.get(c.id) || 0
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(formatted),
        };

    } catch (error: any) {
        console.error("Get conversations error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
