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
            // SỬA LỖI: Lấy các giao dịch có trạng thái 'awaiting_approval' để admin phê duyệt
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
                .eq('status', 'awaiting_approval') // <-- THAY ĐỔI QUAN TRỌNG
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
                // Hàm RPC đã được thiết kế để tìm 'awaiting_approval', nên không cần thay đổi ở đây
                const { error: rpcError } = await supabaseAdmin
                    .rpc('approve_and_credit_transaction', { transaction_id_param: transactionId });

                if (rpcError) {
                    console.error("RPC Error approving transaction:", rpcError);
                    return { statusCode: 500, body: JSON.stringify({ error: `Approval failed: ${rpcError.message}` }) };
                }
                return { statusCode: 200, body: JSON.stringify({ message: 'Transaction approved successfully.' }) };

            } else { // action === 'reject'
                // Sửa lỗi: Cập nhật trạng thái từ 'awaiting_approval' sang 'rejected'
                const { error: updateError } = await supabaseAdmin
                    .from('transactions')
                    .update({ status: 'rejected', updated_at: new Date().toISOString() })
                    .eq('id', transactionId)
                    .eq('status', 'awaiting_approval'); // <-- THAY ĐỔI QUAN TRỌNG
                
                if (updateError) {
                    console.error("Error rejecting transaction:", updateError);
                    return { statusCode: 500, body: JSON.stringify({ error: `Rejection failed: ${updateError.message}` }) };
                }
                return { statusCode: 200, body: JSON.stringify({ message: 'Transaction rejected successfully.' }) };
            }
        }

        default:
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
};

export { handler };