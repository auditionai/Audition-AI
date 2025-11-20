
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

    const type = event.queryStringParameters?.type; // 'rank' or 'cosmetic'

    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
        const body = JSON.parse(event.body || '{}');
        const { id, ...payload } = body;
        const table = type === 'rank' ? 'game_ranks' : 'game_cosmetics';

        if (event.httpMethod === 'POST') {
            const { data, error } = await supabaseAdmin.from(table).insert(payload).select().single();
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 201, body: JSON.stringify(data) };
        } else {
             const { data, error } = await supabaseAdmin.from(table).update(payload).eq('id', id).select().single();
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 200, body: JSON.stringify(data) };
        }
    }

    if (event.httpMethod === 'DELETE') {
        const { id } = JSON.parse(event.body || '{}');
        const table = type === 'rank' ? 'game_ranks' : 'game_cosmetics';
        const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
        if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, body: JSON.stringify({ message: 'Deleted' }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};

export { handler };
