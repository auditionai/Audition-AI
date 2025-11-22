
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { type, itemId } = JSON.parse(event.body || '{}');
        if (!type || itemId === undefined) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing type or itemId.' }) };
        }

        // Convert 'default' string to null for DB compatibility (UUID expected)
        const dbValue = (itemId === 'default' || itemId === '') ? null : itemId;

        const updates: any = {};
        if (type === 'frame') updates.equipped_frame_id = dbValue;
        if (type === 'title') updates.equipped_title_id = dbValue;
        if (type === 'name_effect') updates.equipped_name_effect_id = dbValue;

        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update(updates)
            .eq('id', user.id);

        if (updateError) throw updateError;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, updates }),
        };

    } catch (error: any) {
        console.error("Update appearance failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };