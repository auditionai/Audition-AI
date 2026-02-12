import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { announcementId } = JSON.parse(event.body || '{}');
        if (!announcementId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Announcement ID is required.' }) };
        }

        const { error } = await supabaseAdmin
            .from('users')
            .update({ last_announcement_seen_id: announcementId })
            .eq('id', user.id);

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Announcement marked as read.' }),
        };

    } catch (error: any) {
        console.error("Mark announcement read failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };