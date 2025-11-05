import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Define the expected type for the RPC response
type CheckInResult = {
    message: string;
    new_total_diamonds: number;
    consecutive_days: number;
};

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
        // The entire logic is now handled by a single, atomic database function
        // for better performance and data consistency.
        // Fix: The generic type for the RPC response should be on the `.single()` call, not `rpc()`. This correctly types the `data` variable.
        const { data, error: rpcError } = await supabaseAdmin.rpc('handle_daily_check_in', {
            p_user_id: user.id
        }).single<CheckInResult>();

        if (rpcError) throw rpcError;

        // The RPC function returns null if the user has already checked in.
        if (!data) {
             return { statusCode: 200, body: JSON.stringify({ message: 'Bạn đã điểm danh hôm nay rồi.', checkedIn: true }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: data.message,
                newTotalDiamonds: data.new_total_diamonds,
                consecutiveDays: data.consecutive_days,
                checkedIn: true
            }),
        };

    } catch (error: any) {
        console.error("Daily check-in failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error during check-in.' }) };
    }
};

export { handler };