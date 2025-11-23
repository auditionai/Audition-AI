
import { supabaseAdmin } from './supabaseClient';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Sends a direct message to a specific user.
 * Automatically creates a conversation if one does not exist.
 * Uses Admin privileges to ensure delivery even if RLS usually blocks it.
 * BRUTE FORCE MODE: Aggressively creates/repairs user records to prevent FK failures.
 */
export const sendSystemMessage = async (userId: string, content: string, senderId: string = SYSTEM_BOT_ID) => {
    try {
        console.log(`[ChatUtils] Sending message from ${senderId} to ${userId}`);

        // 1. BRUTE FORCE: Ensure SENDER exists in public.users (Crucial for Foreign Key)
        // If sender is NOT System Bot, we must check if they exist in public.users table.
        // Sometimes admins exist in auth but not public.users due to RLS or sync issues.
        
        let senderDisplayName = 'HỆ THỐNG';
        let senderAvatar = 'https://api.dicebear.com/7.x/bottts/svg?seed=System';

        // Check/Create Sender
        const { data: senderUser } = await supabaseAdmin.from('users').select('id, display_name, photo_url').eq('id', senderId).single();
        
        if (!senderUser) {
            console.log(`[ChatUtils] Sender ${senderId} missing in public.users. Forcing creation...`);
            
            // If it's the System Bot, use default constants. 
            // If it's an Admin (human), try to fetch from Auth API or use placeholders.
            if (senderId !== SYSTEM_BOT_ID) {
                try {
                    // Try to get real details from Auth
                    const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(senderId);
                    if (authUser) {
                        senderDisplayName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || 'Admin';
                        senderAvatar = authUser.user_metadata?.avatar_url || senderAvatar;
                    }
                } catch (e) {
                    console.warn("[ChatUtils] Failed to fetch auth user details, using defaults.");
                }
            }

            // Force Insert
            await supabaseAdmin.from('users').upsert({
                id: senderId,
                email: senderId === SYSTEM_BOT_ID ? 'system@auditionai.io.vn' : `${senderId}@placeholder.com`,
                display_name: senderDisplayName,
                photo_url: senderAvatar,
                diamonds: 999999,
                xp: 999999
            }, { onConflict: 'id' });
        }

        // 2. Get/Create Conversation ID (Using RPC if available for atomic safety, else fallback)
        let conversationId = null;

        try {
            // Try RPC first
            const { data: rpcConvId, error: rpcError } = await supabaseAdmin.rpc('get_or_create_conversation', { other_user_id: userId });
            if (!rpcError && rpcConvId) {
                conversationId = rpcConvId;
            }
        } catch (e) {
            console.warn("[ChatUtils] RPC failed, falling back to manual join logic.");
        }

        // Fallback Logic if RPC failed or returned null
        if (!conversationId) {
            // Get all conversations for Target User
            const { data: userConvs } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', userId);

            if (userConvs && userConvs.length > 0) {
                const convIds = userConvs.map(c => c.conversation_id);
                const { data: existing } = await supabaseAdmin
                    .from('conversation_participants')
                    .select('conversation_id')
                    .eq('user_id', senderId)
                    .in('conversation_id', convIds)
                    .limit(1)
                    .single();
                
                if (existing) conversationId = existing.conversation_id;
            }

            // Create new if still not found
            if (!conversationId) {
                console.log("[ChatUtils] Creating new conversation manually...");
                const { data: newConv, error: createError } = await supabaseAdmin
                    .from('conversations')
                    .insert({})
                    .select()
                    .single();
                
                if (createError) throw createError;
                conversationId = newConv.id;

                const { error: partError } = await supabaseAdmin.from('conversation_participants').insert([
                    { conversation_id: conversationId, user_id: senderId },
                    { conversation_id: conversationId, user_id: userId }
                ]);
                if (partError) throw partError;
            }
        }

        // 3. Insert Message
        const { error: msgError } = await supabaseAdmin.from('direct_messages').insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: content,
            type: 'text',
            is_read: false
        });

        if (msgError) throw msgError;

        // 4. Update Timestamp
        await supabaseAdmin.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        console.log(`[ChatUtils] Message sent successfully.`);
        return true;

    } catch (error: any) {
        console.error("[ChatUtils] CRITICAL FAILURE:", error.message);
        return false;
    }
};
