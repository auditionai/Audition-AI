import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Admin Authentication
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    
    // 2. Method Handling
    switch (event.httpMethod) {
        case 'GET': {
            const { data, error } = await supabaseAdmin
                .from('check_in_rewards')
                .select('*')
                .order('consecutive_days', { ascending: true });
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 200, body: JSON.stringify(data || []) };
        }

        case 'POST': {
            const { consecutive_days, diamond_reward, xp_reward } = JSON.parse(event.body || '{}');
            if (consecutive_days === undefined || diamond_reward === undefined || xp_reward === undefined) {
                 return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields.' }) };
            }
            const { data, error } = await supabaseAdmin
                .from('check_in_rewards')
                .insert({ consecutive_days, diamond_reward, xp_reward, is_active: true })
                .select()
                .single();
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 201, body: JSON.stringify(data) };
        }

        case 'PUT': {
            const { id, ...updates } = JSON.parse(event.body || '{}');
             if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'ID is required for update.' }) };
            const { data, error } = await supabaseAdmin
                .from('check_in_rewards')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        case 'DELETE': {
            const { id } = JSON.parse(event.body || '{}');
            if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'ID is required for deletion.' }) };
            const { error } = await supabaseAdmin.from('check_in_rewards').delete().eq('id', id);
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 204 }; // No content
        }

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };