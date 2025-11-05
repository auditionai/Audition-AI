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
            // Step 1: Fetch all transactions awaiting approval.
            const { data: transactions, error: transactionsError } = await supabaseAdmin
                .from('transactions')
                .select('*')
                .eq('status', 'awaiting_approval')
                .order('created_at', { ascending: true });

            if (transactionsError) {
                console.error("Error fetching transactions:", transactionsError);
                return { statusCode: 500, body: JSON.stringify({ error: `Failed to fetch transactions: ${transactionsError.message}` }) };
            }

            // Step 2: If there are no transactions, return an empty array immediately.
            if (!transactions || transactions.length === 0) {
                return { statusCode: 200, body: JSON.stringify([]) };
            }

            // Step 3: Collect all unique user IDs from the transactions.
            const userIds = [...new Set(transactions.map(t => t.user_id))];

            // Step 4: Fetch all the user profiles corresponding to those IDs.
            const { data: users, error: usersError } = await supabaseAdmin
                .from('users')
                .select('id, display_name, email, photo_url')
                .in('id', userIds);

            if (usersError) {
                console.error("Error fetching users for transactions:", usersError);
                return { statusCode: 500, body: JSON.stringify({ error: `Failed to fetch user data: ${usersError.message}` }) };
            }

            // Step 5: Create a map for quick look-up of user data by ID.
            const userMap = new Map(users.map(u => [u.id, u]));

            // Step 6: Combine the transaction data with the corresponding user data.
            const combinedData = transactions.map(t => ({
                ...t,
                users: userMap.get(t.user_id) || null // Attach the 'users' object as expected by the frontend.
            }));

            return { statusCode: 200, body: JSON.stringify(combinedData) };
        }

        case 'PUT': {
            const { transactionId, action } = JSON.parse(event.body || '{}');
            if (!transactionId || !action || !['approve', 'reject'].includes(action)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body. Requires transactionId and action ("approve" or "reject").' }) };
            }

            if (action === 'approve') {
                // Call the secure database function to handle crediting and status update
                const { error: rpcError } = await supabaseAdmin
                    .rpc('approve_and_credit_transaction', { transaction_id_param: transactionId });

                if (rpcError) {
                    console.error("RPC Error approving transaction:", rpcError);
                    return { statusCode: 500, body: JSON.stringify({ error: `Approval failed: ${rpcError.message}` }) };
                }
                return { statusCode: 200, body: JSON.stringify({ message: 'Transaction approved successfully.' }) };

            } else { // action === 'reject'
                const { error: updateError } = await supabaseAdmin
                    .from('transactions')
                    .update({ status: 'rejected', updated_at: new Date().toISOString() })
                    .eq('id', transactionId)
                    .eq('status', 'awaiting_approval'); // Ensure we only reject pending ones
                
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