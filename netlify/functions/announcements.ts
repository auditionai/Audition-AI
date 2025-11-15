import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    // PUBLIC: Get the single active announcement
    if (event.httpMethod === 'GET' && !event.headers['authorization']) {
        try {
            const { data, error } = await supabaseAdmin
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // Ignore "no rows" error
            return { statusCode: 200, body: JSON.stringify(data || null) };

        } catch (error: any) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // ADMIN: All other requests require admin auth
    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    switch (event.httpMethod) {
        // ADMIN: Get the latest announcement, regardless of active status
        case 'GET': {
            try {
                const { data, error } = await supabaseAdmin
                    .from('announcements')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                if (error && error.code !== 'PGRST116') throw error;
                return { statusCode: 200, body: JSON.stringify(data || null) };
            } catch (error: any) {
                return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            }
        }
        
        // ADMIN: Update an announcement
        case 'PUT': {
            try {
                const { id, title, content, is_active } = JSON.parse(event.body || '{}');
                if (!id || typeof title !== 'string' || typeof content !== 'string' || typeof is_active !== 'boolean') {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid announcement data.' }) };
                }
                const { data, error } = await supabaseAdmin
                    .from('announcements')
                    .update({ title, content, is_active, updated_at: new Date().toISOString() })
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                return { statusCode: 200, body: JSON.stringify(data) };
            } catch (error: any) {
                return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            }
        }

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };