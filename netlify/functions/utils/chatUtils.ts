
import { supabaseAdmin } from './supabaseClient';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Sends a direct message to a specific user.
 * Automatically creates a conversation if one does not exist.
 */
export const sendSystemMessage = async (userId: string, content: string, senderId: string = SYSTEM_BOT_ID) => {
    try {
        // 1. Find existing conversation between sender and target user
        // Get all conversations the target user is in
        const { data: userConvs, error: userConvsError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (userConvsError) throw userConvsError;

        let conversationId = null;

        if (userConvs && userConvs.length > 0) {
            const convIds = userConvs.map(c => c.conversation_id);
            // Check if Sender is in any of these conversations
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

        // 2. If no conversation, create new one
        if (!conversationId) {
            const { data: newConv, error: createError } = await supabaseAdmin
                .from('conversations')
                .insert({})
                .select()
                .single();
            
            if (createError) throw createError;
            conversationId = newConv.id;

            // Add participants
            await supabaseAdmin.from('conversation_participants').insert([
                { conversation_id: conversationId, user_id: senderId },
                { conversation_id: conversationId, user_id: userId }
            ]);
        }

        // 3. Send the message
        await supabaseAdmin.from('direct_messages').insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: content,
            type: 'text',
            is_read: false
        });

        // 4. Update conversation timestamp
        await supabaseAdmin.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        console.log(`[Message] Sent from ${senderId} to ${userId}: ${content.substring(0, 20)}...`);
        return true;

    } catch (error: any) {
        console.error("[Message] Failed:", error.message);
        return false;
    }
};
