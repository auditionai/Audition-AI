
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    // Public GET (for users to read settings)
    if (event.httpMethod === 'GET') {
        try {
            const { data, error } = await supabaseAdmin.from('system_settings').select('key, value');
            if (error) throw error;
            
            const settingsMap: Record<string, string> = {};
            data?.forEach((row: any) => {
                settingsMap[row.key] = row.value;
            });
            
            return { statusCode: 200, body: JSON.stringify(settingsMap) };
        } catch (error: any) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // Admin POST (to save settings)
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    if (event.httpMethod === 'POST') {
        const { settings } = JSON.parse(event.body || '{}');
        if (!settings || typeof settings !== 'object') {
             return { statusCode: 400, body: JSON.stringify({ error: 'Invalid settings object.' }) };
        }

        try {
            // Upsert each setting
            const upsertData = Object.entries(settings).map(([key, value]) => ({
                key, 
                value: String(value)
            }));

            const { error } = await supabaseAdmin.from('system_settings').upsert(upsertData);
            if (error) throw error;

            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        } catch (error: any) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};

export { handler };
