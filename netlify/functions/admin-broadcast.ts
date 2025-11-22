
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { sendSystemMessage } from './utils/chatUtils';

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
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin, display_name').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    const { message, target } = JSON.parse(event.body || '{}');

    if (!message || !message.trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Message content is required.' }) };
    }

    try {
        // --- DETERMINE SENDER ID ---
        let senderId = SYSTEM_BOT_ID;
        
        // Check if System Bot exists in public.users
        const { data: botUser } = await supabaseAdmin.from('users').select('id').eq('id', SYSTEM_BOT_ID).single();
        
        if (!botUser) {
            // If System bot doesn't exist (likely due to auth constraints), fallback to the Admin's ID
            console.warn("System Bot user not found. Falling back to Admin ID for broadcast.");
            senderId = user.id;
        }

        // --- LOG TO SYSTEM BROADCASTS (For future users) ---
        if (target === 'inbox_all') {
            const { error: logError } = await supabaseAdmin
                .from('system_broadcasts')
                .insert({ content: message });
            
            if (logError) console.error("Failed to log broadcast:", logError.message);
        }

        // --- CASE 1: SEND TO GLOBAL CHAT ---
        if (target === 'global') {
            const { error } = await supabaseAdmin.from('global_chat_messages').insert({
                user_id: senderId, 
                content: message,
                type: 'system',
                metadata: {
                    sender_name: 'HỆ THỐNG',
                    sender_avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=System',
                    sender_level: 999,
                    sender_title_id: 'admin'
                }
            });
            
            if (error) throw error;
            return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Sent to Global Chat.' }) };
        }

        // --- CASE 2: SEND TO ALL USERS (INBOX) ---
        if (target === 'inbox_all') {
            // Fetch all users (limit to recent 500 to avoid timeouts)
            const { data: users, error: userFetchError } = await supabaseAdmin
                .from('users')
                .select('id')
                .order('last_check_in_at', { ascending: false, nullsFirst: false }) 
                .limit(500); 

            if (userFetchError) throw userFetchError;

            if (!users || users.length === 0) {
                return { statusCode: 200, body: JSON.stringify({ success: true, message: 'No users found.' }) };
            }

            console.log(`[Broadcast] Sending to ${users.length} users from ${senderId}...`);

            const batchSize = 20;
            let successCount = 0;

            for (let i = 0; i < users.length; i += batchSize) {
                const batch = users.slice(i, i + batchSize);
                // Skip sending to self if sender is admin
                const promises = batch
                    .filter(u => u.id !== senderId) 
                    .map(u => sendSystemMessage(u.id, message, senderId));
                
                const results = await Promise.all(promises);
                successCount += results.filter(r => r).length;
            }

            return { statusCode: 200, body: JSON.stringify({ success: true, message: `Sent to ${successCount} users. Saved to history.` }) };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid target.' }) };

    } catch (error: any) {
        console.error("Broadcast error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
