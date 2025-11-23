
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const { conversationId } = event.queryStringParameters || {};
    if (!conversationId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing conversationId' }) };

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        // 1. Fetch all participants for this conversation (Bypass RLS filtering issues by fetching list)
        const { data: participants, error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId);

        if (partError) {
            console.error("Participation check error:", partError);
            return { statusCode: 500, body: JSON.stringify({ error: 'Database error checking participation.' }) };
        }

        // 2. Verify in code
        const isParticipant = participants?.some(p => p.user_id === user.id);

        if (!isParticipant) {
            console.warn(`User ${user.id} attempted to access conversation ${conversationId} but is not in participants list:`, participants);
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden: You are not a participant of this conversation.' }) };
        }

        // 3. Fetch messages
        const { data: messages, error } = await supabaseAdmin
            .from('direct_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify(messages || []),
        };

    } catch (error: any) {
        console.error("Get messages error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
