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
    // FIX: Use Supabase v2 method `getUser` instead of v1 `api.getUser`.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        // Use Promise.all to run both operations in parallel for efficiency
        const [xpResult, activityResult] = await Promise.all([
            // 1. Increment user XP
            supabaseAdmin.rpc('increment_user_xp', {
                user_id_param: user.id,
                xp_amount: XP_PER_MINUTE,
            }),
            // 2. Log user activity for the day
            supabaseAdmin.rpc('log_user_activity', {
                p_user_id: user.id,
            })
        ]);

        if (xpResult.error) throw xpResult.error;
        if (activityResult.error) throw activityResult.error;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Recorded activity and added ${XP_PER_MINUTE} XP.` }),
        };

    } catch (error: any) {
        console.error("Record user activity failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
