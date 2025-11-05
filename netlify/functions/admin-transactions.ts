import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// This is a placeholder for a Supabase RPC function you must create.
// The SQL for this function should be:
/*
  create or replace function approve_and_credit_transaction(transaction_id_param uuid)
  returns void as $$
  declare
    target_user_id uuid;
    diamonds_to_add int;
    xp_to_add int := 50; -- XP gained from purchasing
    current_status text;
  begin
    -- 1. Select transaction details and lock the row
    select user_id, diamonds_received, status
    into target_user_id, diamonds_to_add, current_status
    from public.transactions
    where id = transaction_id_param
    for update;

    -- 2. Check if the transaction is in the correct state
    if not found then
      raise exception 'Transaction not found';
    end if;

    if current_status != 'awaiting_approval' then
      raise exception 'Transaction is not awaiting approval. Current status: %', current_status;
    end if;

    -- 3. Update the user's balance
    update public.users
    set
      diamonds = diamonds + diamonds_to_add,
      xp = xp + xp_to_add
    where id = target_user_id;

    -- 4. Update the transaction status to completed
    update public.transactions
    set status = 'completed', updated_at = now()
    where id = transaction_id_param;
  end;
  $$ language plpgsql security definer;
*/

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
            const { data, error } = await supabaseAdmin
                .from('transactions')
                .select('*, users(display_name, email, photo_url)')
                .eq('status', 'awaiting_approval')
                .order('created_at', { ascending: true });

            if (error) {
                return { statusCode: 500, body: JSON.stringify({ error: `Failed to fetch transactions: ${error.message}` }) };
            }
            return { statusCode: 200, body: JSON.stringify(data) };
        }

        case 'PUT': {
            const { transactionId, action } = JSON.parse(event.body || '{}');
            if (!transactionId || !action || !['approve', 'reject'].includes(action)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body. Requires transactionId and action ("approve" or "reject").' }) };
            }

            if (action === 'approve') {
                const { error: rpcError } = await supabaseAdmin
                    .rpc('approve_and_credit_transaction', { transaction_id_param: transactionId });

                if (rpcError) {
                    return { statusCode: 500, body: JSON.stringify({ error: `Approval failed: ${rpcError.message}` }) };
                }
                return { statusCode: 200, body: JSON.stringify({ message: 'Transaction approved successfully.' }) };

            } else { // action === 'reject'
                const { error: updateError } = await supabaseAdmin
                    .from('transactions')
                    .update({ status: 'rejected', updated_at: new Date().toISOString() })
                    .eq('id', transactionId);
                
                if (updateError) {
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