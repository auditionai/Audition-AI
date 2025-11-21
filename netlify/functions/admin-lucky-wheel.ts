
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    if (event.httpMethod === 'GET') {
        const { data, error } = await supabaseAdmin.from('lucky_wheel_rewards').select('*').order('display_order', { ascending: true });
        if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'POST') {
        const reward = JSON.parse(event.body || '{}');
        const { data, error } = await supabaseAdmin.from('lucky_wheel_rewards').insert(reward).select().single();
        if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 201, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'PUT') {
        const { id, ...updates } = JSON.parse(event.body || '{}');
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'ID is required for update.' }) };
        
        const { data, error } = await supabaseAdmin.from('lucky_wheel_rewards').update(updates).eq('id', id).select().single();
        if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'DELETE') {
        const { id } = JSON.parse(event.body || '{}');
        const { error } = await supabaseAdmin.from('lucky_wheel_rewards').delete().eq('id', id);
        if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, body: JSON.stringify({ message: 'Deleted' }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};

export { handler };
