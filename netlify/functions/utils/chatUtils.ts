
import { supabaseAdmin } from './supabaseClient';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Sends a direct message from the System Bot to a specific user.
 * Automatically creates a conversation if one does not exist.
 */
export const sendSystemMessage = async (userId: string, content: string) => {
    try {
        // 1. Check if a conversation exists between System and User
        // We search for a conversation where the current user is a participant
        // and the other participant is the System Bot.
        
        // Optimized approach: Find conversations the target user is in
        const { data: userConvs, error: userConvsError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (userConvsError) throw userConvsError;

        let conversationId = null;

        if (userConvs && userConvs.length > 0) {
            const convIds = userConvs.map(c => c.conversation_id);
            // Check if System Bot is in any of these conversations
            const { data: existing } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', SYSTEM_BOT_ID)
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
                { conversation_id: conversationId, user_id: SYSTEM_BOT_ID },
                { conversation_id: conversationId, user_id: userId }
            ]);
        }

        // 3. Send the message
        await supabaseAdmin.from('direct_messages').insert({
            conversation_id: conversationId,
            sender_id: SYSTEM_BOT_ID,
            content: content,
            type: 'text',
            is_read: false
        });

        // 4. Update conversation timestamp
        await supabaseAdmin.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        console.log(`[System Message] Sent to ${userId}: ${content}`);
        return true;

    } catch (error: any) {
        console.error("[System Message] Failed:", error.message);
        return false;
    }
};
