import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const XP_PER_MINUTE = 1;

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        // Use an RPC function for atomic update to prevent race conditions
        const { error: rpcError } = await supabaseAdmin.rpc('increment_user_xp', {
            user_id_param: user.id,
            xp_amount: XP_PER_MINUTE,
        });

        if (rpcError) throw rpcError;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Added ${XP_PER_MINUTE} XP.` }),
        };

    } catch (error: any) {
        console.error("Increment XP failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };