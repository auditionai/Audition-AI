
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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    // 2. Admin Check
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    const { message, target } = JSON.parse(event.body || '{}');

    if (!message || !message.trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Message content is required.' }) };
    }

    try {
        // --- CASE 1: SEND TO GLOBAL CHAT ---
        if (target === 'global') {
            const { error } = await supabaseAdmin.from('global_chat_messages').insert({
                user_id: SYSTEM_BOT_ID, // Sent as System
                content: message,
                type: 'system',
                metadata: {
                    sender_name: 'SYSTEM',
                    sender_avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=System',
                    sender_level: 999
                }
            });
            
            if (error) throw error;
            return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Sent to Global Chat.' }) };
        }

        // --- CASE 2: SEND TO ALL USERS (INBOX) ---
        if (target === 'inbox_all') {
            // Fetch all users (limit to recent 1000 to avoid timeouts in this demo environment)
            // In production, this should be a background job or queue.
            const { data: users, error: userFetchError } = await supabaseAdmin
                .from('users')
                .select('id')
                .order('last_check_in_at', { ascending: false, nullsFirst: false }) // Prioritize active users
                .limit(500); 

            if (userFetchError) throw userFetchError;

            if (!users || users.length === 0) {
                return { statusCode: 200, body: JSON.stringify({ success: true, message: 'No users found.' }) };
            }

            console.log(`[Broadcast] Sending to ${users.length} users...`);

            // Process in batches of 20 to avoid overwhelming the DB connection
            const batchSize = 20;
            let successCount = 0;

            for (let i = 0; i < users.length; i += batchSize) {
                const batch = users.slice(i, i + batchSize);
                const promises = batch.map(u => sendSystemMessage(u.id, message));
                const results = await Promise.all(promises);
                successCount += results.filter(r => r).length;
            }

            return { statusCode: 200, body: JSON.stringify({ success: true, message: `Sent to ${successCount} users.` }) };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid target.' }) };

    } catch (error: any) {
        console.error("Broadcast error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
