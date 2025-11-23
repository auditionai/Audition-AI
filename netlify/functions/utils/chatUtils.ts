
import { supabaseAdmin } from './supabaseClient';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Sends a direct message to a specific user.
 * Automatically creates a conversation if one does not exist.
 * Uses Admin privileges to ensure delivery even if RLS usually blocks it.
 */
export const sendSystemMessage = async (userId: string, content: string, senderId: string = SYSTEM_BOT_ID) => {
    try {
        console.log(`[ChatUtils] Sending message from ${senderId} to ${userId}`);

        // 1. Check if Sender exists in public.users (Critical for Foreign Key constraints)
        // If sender is SYSTEM_BOT, verify existence or create placeholder
        if (senderId === SYSTEM_BOT_ID) {
            const { data: botUser } = await supabaseAdmin.from('users').select('id').eq('id', SYSTEM_BOT_ID).single();
            if (!botUser) {
                console.log("[ChatUtils] System Bot missing. Creating placeholder...");
                await supabaseAdmin.from('users').insert({
                    id: SYSTEM_BOT_ID,
                    email: 'system@auditionai.io.vn',
                    display_name: 'HỆ THỐNG',
                    photo_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=System',
                    diamonds: 999999,
                    xp: 999999
                });
            }
        }

        // 2. Find existing conversation
        // Using a manual join strategy that works with Admin client
        let conversationId = null;

        // Get all conversations for Target User
        const { data: userConvs } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (userConvs && userConvs.length > 0) {
            const convIds = userConvs.map(c => c.conversation_id);
            
            // Check if Sender is in any of these
            const { data: existing } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', senderId)
                .in('conversation_id', convIds)
                .limit(1)
                .single();
            
            if (existing) {
                conversationId = existing.conversation_id;
            }
        }

        // 3. If not found, create NEW Conversation atomically
        if (!conversationId) {
            console.log("[ChatUtils] No conversation found. Creating new one...");
            const { data: newConv, error: createError } = await supabaseAdmin
                .from('conversations')
                .insert({})
                .select()
                .single();
            
            if (createError) throw createError;
            conversationId = newConv.id;

            // Insert Participants
            const { error: partError } = await supabaseAdmin.from('conversation_participants').insert([
                { conversation_id: conversationId, user_id: senderId },
                { conversation_id: conversationId, user_id: userId }
            ]);
            
            if (partError) throw partError;
        }

        // 4. Insert Message
        const { error: msgError } = await supabaseAdmin.from('direct_messages').insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: content,
            type: 'text',
            is_read: false
        });

        if (msgError) throw msgError;

        // 5. Update Timestamp
        await supabaseAdmin.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        console.log(`[ChatUtils] Success.`);
        return true;

    } catch (error: any) {
        console.error("[ChatUtils] Failed to send message:", error.message);
        return false;
    }
};
