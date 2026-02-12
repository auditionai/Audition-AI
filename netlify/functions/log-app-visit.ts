import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // This endpoint can be called by anyone loading the app.
    // We try to associate the visit with a user if they are logged in.
    const authHeader = event.headers['authorization'];
    let userId = null;

    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token) {
            // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
            const { data: { user } } = await supabaseAdmin.auth.getUser(token);
            if (user) {
                userId = user.id;
            }
        }
    }

    try {
        const { error } = await supabaseAdmin
            .from('daily_visits')
            .insert({ user_id: userId });

        if (error) {
            throw error;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };

    } catch (error: any) {
        console.error("Log app visit failed:", error);
        // Fail silently so it doesn't block the app loading
        return { statusCode: 200, body: JSON.stringify({ success: false }) };
    }
};

export { handler };