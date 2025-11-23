
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        // 1. Fetch Notifications (Raw)
        const { data: notifications, error } = await supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('recipient_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!notifications || notifications.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // 2. Collect Actor IDs
        const actorIds = [...new Set(notifications.map((n: any) => n.actor_id).filter(Boolean))];

        // 3. Fetch Actors (Manual Join)
        // This avoids errors if Foreign Keys are missing in the DB schema
        const { data: actors } = await supabaseAdmin
            .from('users')
            .select('id, display_name, photo_url')
            .in('id', actorIds);

        const actorMap = new Map(actors?.map((a: any) => [a.id, a]));

        // 4. Merge Data
        const enrichedNotifications = notifications.map((n: any) => ({
            ...n,
            actor: n.actor_id ? actorMap.get(n.actor_id) || { display_name: 'Người dùng ẩn danh', photo_url: null } : null
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(enrichedNotifications),
        };
    } catch (error: any) {
        console.error("Get notifications error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
