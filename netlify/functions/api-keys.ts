import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };
    }

    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
    }

    // Check if user is admin
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }
    
    switch (event.httpMethod) {
        case 'GET':
            const { data: keys, error: getError } = await supabaseAdmin.from('api_keys').select('*').order('created_at', { ascending: false });
            if (getError) return { statusCode: 500, body: JSON.stringify({ error: getError.message }) };
            return { statusCode: 200, body: JSON.stringify(keys) };

        case 'POST':
            const { name, key_value } = JSON.parse(event.body || '{}');
            const { data: newKey, error: postError } = await supabaseAdmin.from('api_keys').insert({ name, key_value }).select().single();
            if (postError) return { statusCode: 500, body: JSON.stringify({ error: postError.message }) };
            return { statusCode: 201, body: JSON.stringify(newKey) };

        case 'PUT':
            const { id: updateId, status } = JSON.parse(event.body || '{}');
            const { data: updatedKey, error: putError } = await supabaseAdmin.from('api_keys').update({ status }).eq('id', updateId).select().single();
            if (putError) return { statusCode: 500, body: JSON.stringify({ error: putError.message }) };
            return { statusCode: 200, body: JSON.stringify(updatedKey) };

        case 'DELETE':
            const { id: deleteId } = JSON.parse(event.body || '{}');
            const { error: deleteError } = await supabaseAdmin.from('api_keys').delete().eq('id', deleteId);
            if (deleteError) return { statusCode: 500, body: JSON.stringify({ error: deleteError.message }) };
            return { statusCode: 204 }; // No content

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };