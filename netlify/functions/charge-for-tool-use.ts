import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { tool, cost } = JSON.parse(event.body || '{}');
        if (!tool || typeof cost !== 'number' || cost <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid tool or cost.' }) };
        }
        
        const TOOL_DESCRIPTIONS: { [key: string]: string } = {
            'signature': 'Chèn chữ ký vào ảnh',
        };

        const description = TOOL_DESCRIPTIONS[tool];
        if (!description) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Unknown tool type.' }) };
        }

        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();

        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < cost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${cost}, bạn có ${userData.diamonds}.` }) };
        }

        const newDiamondCount = userData.diamonds - cost;

        const [userUpdateResult, logResult] = await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -cost,
                transaction_type: 'TOOL_USE',
                description: description,
            })
        ]);

        if (userUpdateResult.error) throw userUpdateResult.error;
        if (logResult.error) throw logResult.error;
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true,
                message: 'Thanh toán thành công!',
                newDiamondCount
            }),
        };

    } catch (error: any) {
        console.error("Charge for tool use function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error during tool use charge.' }) };
    }
};

export { handler };