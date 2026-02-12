
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    // Verify user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    const { messageId } = JSON.parse(event.body || '{}');
    if (!messageId) return { statusCode: 400, body: JSON.stringify({ error: 'Message ID required' }) };

    try {
        // 1. Get User Profile (for admin check and display name)
        const { data: userProfile } = await supabaseAdmin.from('users').select('is_admin, display_name').eq('id', user.id).single();

        // 2. Get Message
        const { data: msg, error: msgError } = await supabaseAdmin
            .from('global_chat_messages')
            .select('*')
            .eq('id', messageId)
            .single();

        if (msgError || !msg) return { statusCode: 404, body: JSON.stringify({ error: 'Message not found' }) };

        // 3. Check Permissions (Owner or Admin)
        const isOwner = msg.user_id === user.id;
        const isAdmin = userProfile?.is_admin;

        if (!isOwner && !isAdmin) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden: You cannot delete this message.' }) };
        }

        // 4. Prepare Update Data
        const deleterName = (isAdmin && !isOwner) ? 'ADMIN' : (userProfile?.display_name || 'Unknown');
        
        // Ensure metadata is an object
        const currentMetadata = typeof msg.metadata === 'object' ? msg.metadata : {};
        
        const updatedMetadata = {
            ...currentMetadata,
            deleted_by: deleterName,
            deleted_at: new Date().toISOString()
        };

        // 5. Perform Update (Soft Delete)
        const { error: updateError } = await supabaseAdmin
            .from('global_chat_messages')
            .update({ 
                is_deleted: true, 
                metadata: updatedMetadata 
            })
            .eq('id', messageId);

        if (updateError) throw updateError;

        return { statusCode: 200, body: JSON.stringify({ success: true }) };

    } catch (error: any) {
        console.error("Delete chat message error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
