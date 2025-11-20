
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const [ranksRes, cosmeticsRes] = await Promise.all([
            supabaseAdmin.from('game_ranks').select('*'),
            supabaseAdmin.from('game_cosmetics').select('*').eq('is_active', true)
        ]);

        if (ranksRes.error) throw ranksRes.error;
        if (cosmeticsRes.error) throw cosmeticsRes.error;

        return {
            statusCode: 200,
            body: JSON.stringify({
                ranks: ranksRes.data,
                cosmetics: cosmeticsRes.data
            }),
        };
    } catch (error: any) {
        console.error("Failed to fetch game config:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
