import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import crypto from 'crypto';

const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

// PayOS signature verification for webhooks
const verifySignature = (data: string, signature: string, checksumKey: string): boolean => {
    try {
        const expectedSignature = crypto.createHmac('sha256', checksumKey).update(data).digest('hex');
        return expectedSignature === signature;
    } catch (error) {
        console.error("Error during signature verification:", error);
        return false;
    }
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
        
        // According to PayOS, only webhooks with code '00' are successful transactions.
        if (payload.code !== '00' || !payload.data) {
            console.log("Received non-success webhook from PayOS:", payload.desc);
            return { statusCode: 200, body: JSON.stringify({ message: 'Webhook received but not a success event.' }) };
        }
        
        const { orderCode, status } = payload.data;
        
        if (!orderCode) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing order code.' }) };
        }

        // We only care about PAID status.
        if (status !== 'PAID') {
            console.log(`Received status "${status}" for order ${orderCode}. Ignoring.`);
            return { statusCode: 200, body: JSON.stringify({ message: 'Status is not PAID.' }) };
        }

        // 2. Fetch the transaction from DB
        const { data: transaction, error: transactionError } = await supabaseAdmin
            .from('transactions')
            .select('*')
            .eq('order_code', orderCode)
            .single();

        if (transactionError || !transaction) {
            console.error(`Transaction with order code ${orderCode} not found.`);
            // Return 200 to prevent PayOS from retrying for a transaction we don't know about.
            return { statusCode: 200, body: JSON.stringify({ error: 'Transaction not found.' }) };
        }

        // 3. Idempotency check: If already completed, do nothing.
        if (transaction.status === 'completed') {
            return { statusCode: 200, body: JSON.stringify({ message: 'Transaction already processed.' }) };
        }
        
        // 4. Credit Diamonds and XP to the user
        const { data: user, error: userFetchError } = await supabaseAdmin
            .from('users')
            .select('diamonds, xp')
            .eq('id', transaction.user_id)
            .single();
        
        if (userFetchError || !user) {
            throw new Error(`User ${transaction.user_id} not found for transaction ${transaction.id}.`);
        }
        
        const newDiamonds = user.diamonds + transaction.diamonds_received;
        // XP calculation: 100 VND = 1 XP
        const xpGained = Math.floor(transaction.amount_vnd / 100);
        const newXp = user.xp + xpGained;

        const { error: userUpdateError } = await supabaseAdmin
            .from('users')
            .update({ diamonds: newDiamonds, xp: newXp })
            .eq('id', transaction.user_id);

        if (userUpdateError) {
            // This is a critical failure. Log it for manual intervention.
            console.error(`CRITICAL: Failed to credit diamonds/XP for user ${transaction.user_id} on order ${orderCode}. DB Error: ${userUpdateError.message}`);
            // Don't mark transaction as completed if user update fails. Let it be retried or handled manually.
            throw new Error('Failed to update user balance.');
        }

        // 5. Mark the transaction as completed
        const { error: updateTransactionError } = await supabaseAdmin
            .from('transactions')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', transaction.id);
        
        if (updateTransactionError) {
            throw new Error(`Failed to update transaction status for order ${orderCode}: ${updateTransactionError.message}`);
        }

        return { statusCode: 200, body: JSON.stringify({ success: true, message: `Order ${orderCode} processed successfully.` }) };

    } catch (error: any) {
        console.error('Webhook processing error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};

export { handler };