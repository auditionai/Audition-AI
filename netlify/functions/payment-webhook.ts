import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import crypto from 'crypto';

const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

// PayOS signature verification for webhooks
const verifySignature = (data: string, signature: string, checksumKey: string): boolean => {
    const expectedSignature = crypto.createHmac('sha256', checksumKey).update(data).digest('hex');
    return expectedSignature === signature;
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    if (!PAYOS_CHECKSUM_KEY) {
        console.error('PayOS checksum key is not set.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Webhook configuration error.' }) };
    }

    const webhookSignature = event.headers['x-payos-signature'];
    const webhookBody = event.body;

    if (!webhookSignature || !webhookBody) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing signature or body.' }) };
    }

    // 1. Verify the webhook signature
    if (!verifySignature(webhookBody, webhookSignature, PAYOS_CHECKSUM_KEY)) {
        console.error("Invalid webhook signature.");
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature.' }) };
    }

    try {
        const payload = JSON.parse(webhookBody);
        
        if (payload.code !== '00' || !payload.data) {
            console.log("Received non-payment-success webhook from PayOS:", payload.desc);
            return { statusCode: 200, body: JSON.stringify({ message: 'Webhook received but not a payment success event.' }) };
        }
        
        const { orderCode, status } = payload.data;
        
        if (!orderCode) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing order code in webhook data.' }) };
        }

        // 2. Fetch the transaction from DB
        const { data: transaction, error: transactionError } = await supabaseAdmin
            .from('transactions')
            .select('*')
            .eq('order_code', orderCode)
            .single();

        if (transactionError || !transaction) {
            console.error(`Transaction with order code ${orderCode} not found.`);
            return { statusCode: 200, body: JSON.stringify({ error: 'Transaction not found.' }) };
        }

        if (transaction.status === 'completed') {
            return { statusCode: 200, body: JSON.stringify({ message: 'Transaction already processed.' }) };
        }
        
        let newStatus: 'completed' | 'failed' | 'canceled' | 'pending' = transaction.status as any;
        let shouldUpdateUser = false;

        if (status === 'PAID') {
            newStatus = 'completed';
            shouldUpdateUser = true;
        } else if (status === 'CANCELLED') {
            newStatus = 'canceled';
        } else if (status === 'EXPIRED' || status === 'FAILED') {
            newStatus = 'failed';
        } else {
             console.log(`Received unhandled payment status "${status}" for order ${orderCode}.`);
             return { statusCode: 200, body: JSON.stringify({ message: 'Unhandled status.' }) };
        }
        
        // 4. Update transaction status
        const { error: updateTransactionError } = await supabaseAdmin
            .from('transactions')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', transaction.id);
        
        if (updateTransactionError) {
            throw new Error(`Failed to update transaction status for order ${orderCode}: ${updateTransactionError.message}`);
        }

        // 5. If successful, update user's diamonds.
        // Assumes a Supabase RPC function 'add_diamonds_to_user' exists for atomic updates.
        // SQL: CREATE FUNCTION add_diamonds_to_user(user_id_input uuid, diamonds_to_add integer)
        //      RETURNS void AS $$
        //      UPDATE public.users
        //      SET diamonds = diamonds + diamonds_to_add
        //      WHERE id = user_id_input;
        //      $$ LANGUAGE sql;
        if (shouldUpdateUser) {
            const { error: rpcError } = await supabaseAdmin.rpc('add_diamonds_to_user', {
                user_id_input: transaction.user_id,
                diamonds_to_add: transaction.diamonds_received
            });

            if (rpcError) {
                // This is a critical error. The transaction is marked as complete, but user didn't get diamonds.
                console.error(`CRITICAL: Failed to add diamonds for user ${transaction.user_id} on order ${orderCode}. Error: ${rpcError.message}`);
            }
        }

        return { statusCode: 200, body: JSON.stringify({ success: true, message: `Order ${orderCode} status updated to ${newStatus}.` }) };

    } catch (error: any) {
        console.error('Webhook processing error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};

export { handler };
