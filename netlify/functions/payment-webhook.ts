import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import crypto from 'crypto';

const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

// PayOS docs: The signature is created by sorting parameters alphabetically,
// joining them with '&', and then creating an HMAC-SHA256 hash.
const createSignature = (data: Record<string, any>, checksumKey: string): string => {
    const sortedKeys = Object.keys(data).sort();
    const dataString = sortedKeys.map(key => `${key}=${data[key]}`).join('&');
    return crypto.createHmac('sha256', checksumKey).update(dataString).digest('hex');
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    
    if (!PAYOS_CHECKSUM_KEY) {
        console.error('PayOS checksum key is not set.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Webhook configuration error.' }) };
    }
    
    const signatureFromHeader = event.headers['x-payos-signature'];
    const body = JSON.parse(event.body || '{}');
    const webhookData = body.data;

    if (!webhookData || !signatureFromHeader) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing webhook data or signature.' }) };
    }
    
    const calculatedSignature = createSignature(webhookData, PAYOS_CHECKSUM_KEY);

    if (calculatedSignature !== signatureFromHeader) {
        console.warn('Invalid webhook signature received.');
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature.' }) };
    }

    const { orderCode, status } = webhookData;

    try {
        if (body.code === '00' && status === 'PAID') {
            // Find the pending transaction
            const { data: transaction, error: findError } = await supabaseAdmin
                .from('transactions')
                .select('id, user_id, diamonds_received, status')
                .eq('order_code', orderCode)
                .single();

            if (findError) {
                // If no rows found, it might be an invalid order code
                if (findError.code === 'PGRST116') {
                    console.error(`Webhook received for non-existent order code: ${orderCode}`);
                    // Still return 200, as there's nothing to do.
                    return { statusCode: 200, body: JSON.stringify({ message: 'Order code not found.' }) };
                }
                throw findError; // Other DB errors
            }

            // --- Idempotency Check ---
            // If transaction is not pending, it means it's already processed or failed.
            if (transaction.status !== 'pending') {
                console.log(`Webhook for order ${orderCode} already has status '${transaction.status}'. Ignoring.`);
                return { statusCode: 200, body: JSON.stringify({ message: 'Webhook already processed.' }) };
            }
            
            // Fetch current user diamonds
            const { data: userProfile, error: userError } = await supabaseAdmin
                .from('users')
                .select('diamonds')
                .eq('id', transaction.user_id)
                .single();

            if (userError || !userProfile) {
                throw new Error(`User not found for transaction ${orderCode}`);
            }

            // Perform updates
            const newDiamondCount = userProfile.diamonds + transaction.diamonds_received;

            const [
                { error: userUpdateError },
                { error: transactionUpdateError }
            ] = await Promise.all([
                supabaseAdmin
                    .from('users')
                    .update({ diamonds: newDiamondCount })
                    .eq('id', transaction.user_id),
                supabaseAdmin
                    .from('transactions')
                    .update({ status: 'completed', updated_at: new Date().toISOString() })
                    .eq('id', transaction.id)
            ]);

            if (userUpdateError) throw new Error(`Failed to update user diamonds: ${userUpdateError.message}`);
            if (transactionUpdateError) throw new Error(`Failed to update transaction status: ${transactionUpdateError.message}`);
            
            console.log(`Successfully processed payment for order code: ${orderCode}`);

        } else if (status === 'CANCELLED' || status === 'FAILED') {
            const dbStatus = status === 'CANCELLED' ? 'canceled' : 'failed';
            await supabaseAdmin
               .from('transactions')
               .update({ status: dbStatus, updated_at: new Date().toISOString() })
               .eq('order_code', orderCode)
               .eq('status', 'pending');
            console.log(`Updated transaction ${orderCode} to status '${dbStatus}'.`);
        }
    } catch (error: any) {
        console.error(`Error processing webhook for order ${orderCode}:`, error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error.' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Webhook received.' }) };
};

export { handler };
