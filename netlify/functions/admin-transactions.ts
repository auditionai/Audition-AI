import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Admin Authentication
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

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }
    
    // 2. Method Handling
    switch (event.httpMethod) {
        case 'GET': {
            // L?y cac giao d?ch co tr?ng thai 'pending' d? admin phe duy?t
            const { data, error } = await supabaseAdmin
                .from('transactions')
                .select(`
                    *,
                    users (
                        display_name,
                        email,
                        photo_url
                    )
                `)
                .eq('status', 'pending') // <-- THAY D?I
                .order('created_at', { ascending: true });

            if (error) {
                console.error("Error fetching transactions with join:", error);
                return { statusCode: 500, body: JSON.stringify({ error: `Failed to fetch transactions: ${error.message}` }) };
            }

            return { statusCode: 200, body: JSON.stringify(data || []) };
        }

        case 'PUT': {
            const { transactionId, action } = JSON.parse(event.body || '{}');
            if (!transactionId || !action || !['approve', 'reject'].includes(action)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body. Requires transactionId and action ("approve" or "reject").' }) };
            }

            if (action === 'approve') {
                // G?i RPC function (da du?c c?p nh?t d? x? ly 'pending' status)
                const { error: rpcError } = await supabaseAdmin
                    .rpc('approve_and_credit_transaction', { transaction_id_param: transactionId });

                if (rpcError) {
                    console.error("RPC Error approving transaction:", rpcError);
                    return { statusCode: 500, body: JSON.stringify({ error: `Approval failed: ${rpcError.message}` }) };
                }
                return { statusCode: 200, body: JSON.stringify({ message: 'Transaction approved successfully.' }) };

            } else { // action === 'reject'
                // **FIX:** Instead of updating to a non-existent status, delete the pending transaction record.
                const { error: deleteError } = await supabaseAdmin
                    .from('transactions')
                    .delete()
                    .eq('id', transactionId)
                    .eq('status', 'pending');
                
                if (deleteError) {
                    console.error("Error rejecting (deleting) transaction:", deleteError);
                    return { statusCode: 500, body: JSON.stringify({ error: `Rejection failed: ${deleteError.message}` }) };
                }
                return { statusCode: 200, body: JSON.stringify({ message: 'Transaction rejected successfully.' }) };
            }
        }

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };