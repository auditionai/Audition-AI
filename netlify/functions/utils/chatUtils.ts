
import { supabaseAdmin } from './supabaseClient';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Sends a direct message to a specific user.
 * BRUTE FORCE MODE:
 * 1. Ensures Admin/System User exists in public.users table via UPSERT.
 * 2. Checks if conversation exists.
 * 3. If not, creates Conversation AND forcefully inserts both participants using Admin privileges.
 * 4. Inserts the message.
 */
export const sendSystemMessage = async (userId: string, content: string, senderId: string = SYSTEM_BOT_ID) => {
    try {
        console.log(`[ChatUtils] Sending message from ${senderId} to ${userId}`);

        // 1. ENSURE SENDER EXISTS IN PUBLIC.USERS (Critical for Foreign Key)
        let senderDisplayName = 'HỆ THỐNG';
        let senderAvatar = 'https://api.dicebear.com/7.x/bottts/svg?seed=System';

        // If sender is a real admin (not the system bot), try to fetch their details to use in the profile
        if (senderId !== SYSTEM_BOT_ID) {
            try {
                const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(senderId);
                if (authUser) {
                    senderDisplayName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || 'Admin';
                    senderAvatar = authUser.user_metadata?.avatar_url || senderAvatar;
                }
            } catch (e) {
                console.warn("[ChatUtils] Could not fetch admin details from Auth, using defaults.");
            }
        }

        // Force Upsert Sender Profile to ensure FK constraints are met
        const { error: userUpsertError } = await supabaseAdmin.from('users').upsert({
            id: senderId,
            email: senderId === SYSTEM_BOT_ID ? 'system@auditionai.io.vn' : undefined, // Only set dummy email for bot
            display_name: senderDisplayName,
            photo_url: senderAvatar,
            // Don't overwrite existing currency if user exists, but set high defaults for new bot
            diamonds: 999999, 
            xp: 999999
        }, { onConflict: 'id', ignoreDuplicates: true }); // Use ignoreDuplicates to avoid overwriting real user data if existing

        if (userUpsertError) console.warn(`[ChatUtils] Warning upserting sender: ${userUpsertError.message}`);

        // 2. FIND EXISTING CONVERSATION MANUALLY (Bypass RPC for transparency)
        // We look for a conversation that has BOTH participants.
        let conversationId = null;

        // Get all conversation IDs for the target user
        const { data: userConvs } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (userConvs && userConvs.length > 0) {
            const convIds = userConvs.map(c => c.conversation_id);
            // Check if any of these conversations also include the sender
            const { data: existing } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', senderId)
                .in('conversation_id', convIds)
                .limit(1)
                .maybeSingle(); // Use maybeSingle to avoid error on null
            
            if (existing) conversationId = existing.conversation_id;
        }

        // 3. CREATE CONVERSATION IF MISSING
        if (!conversationId) {
            console.log("[ChatUtils] Creating new conversation...");
            const { data: newConv, error: createError } = await supabaseAdmin
                .from('conversations')
                .insert({})
                .select()
                .single();
            
            if (createError) throw createError;
            conversationId = newConv.id;

            // Force insert both participants
            const { error: partError } = await supabaseAdmin.from('conversation_participants').insert([
                { conversation_id: conversationId, user_id: senderId },
                { conversation_id: conversationId, user_id: userId }
            ]);
            if (partError) throw partError;
        }

        // 4. INSERT MESSAGE
        const { error: msgError } = await supabaseAdmin.from('direct_messages').insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: content,
            type: 'text',
            is_read: false
        });

        if (msgError) throw msgError;

        // 5. UPDATE TIMESTAMP
        await supabaseAdmin.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        console.log(`[ChatUtils] Success.`);
        return true;

    } catch (error: any) {
        console.error("[ChatUtils] FAILURE:", error.message);
        return false;
    }
};
