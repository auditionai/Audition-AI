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
                .from('gift_codes')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 200, body: JSON.stringify(data || []) };
        }

        case 'POST': {
            const { code, diamond_reward, usage_limit } = JSON.parse(event.body || '{}');
            if (!code || diamond_reward === undefined || usage_limit === undefined) {
                 return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields.' }) };
            }
            const { data, error } = await supabaseAdmin
                .from('gift_codes')
                .insert({ code, diamond_reward, usage_limit })
                .select()
                .single();
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 201, body: JSON.stringify(data) };
        }

        case 'PUT': {
            const { id, ...updates } = JSON.parse(event.body || '{}');
             if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'ID is required for update.' }) };
            const { data, error } = await supabaseAdmin
                .from('gift_codes')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };