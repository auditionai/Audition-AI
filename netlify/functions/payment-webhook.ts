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
    console.log("--- PayOS Webhook Received ---");

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    
    if (!PAYOS_CHECKSUM_KEY) {
        console.error('CRITICAL: PAYOS_CHECKSUM_KEY is not set.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Webhook configuration error.' }) };
    }
    
    try {
        const signatureFromHeader = event.headers['x-payos-signature'];
        const body = JSON.parse(event.body || '{}');
        console.log("Received body:", JSON.stringify(body, null, 2));

        const webhookData = body.data;

        if (!webhookData || !signatureFromHeader) {
            console.error("Missing webhook data or signature header.");
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing webhook data or signature.' }) };
        }
        
        const calculatedSignature = createSignature(webhookData, PAYOS_CHECKSUM_KEY);

        if (calculatedSignature !== signatureFromHeader) {
            console.warn('INVALID SIGNATURE. Calculated:', calculatedSignature, 'Received:', signatureFromHeader);
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature.' }) };
        }
        console.log("Signature validated successfully.");

        const { orderCode, status } = webhookData;
        console.log(`Processing Order Code: ${orderCode}, Status: ${status}`);

        // **ROBUST STATUS CHECK (case-insensitive)**
        if (body.code === '00' && status?.toUpperCase() === 'PAID') {
            console.log(`Order ${orderCode} is PAID. Calling database function to complete transaction.`);
            
            // **ATOMIC DATABASE UPDATE via RPC call**
            const { data: rpcData, error: rpcError } = await supabaseAdmin
                .rpc('complete_paid_transaction', { order_code_param: orderCode });

            if (rpcError) {
                console.error(`RPC Error for order ${orderCode}:`, JSON.stringify(rpcError, null, 2));
                throw new Error(`Database function failed for order ${orderCode}: ${rpcError.message}`);
            }

            console.log(`RPC Response for order ${orderCode}:`, JSON.stringify(rpcData, null, 2));
            if (rpcData.status === 'error') {
                // Log the error but still return 200 if it's a "not found" or "already processed" error
                if (rpcData.message.includes('not found') || rpcData.message.includes('already processed')) {
                    console.warn(`RPC handled case: ${rpcData.message}`);
                } else {
                    throw new Error(rpcData.message);
                }
            }

        } else if (status?.toUpperCase() === 'CANCELLED' || status?.toUpperCase() === 'FAILED') {
            const dbStatus = status.toUpperCase() === 'CANCELLED' ? 'canceled' : 'failed';
            console.log(`Order ${orderCode} has status ${status}. Updating transaction to '${dbStatus}'.`);
            await supabaseAdmin
               .from('transactions')
               .update({ status: dbStatus, updated_at: new Date().toISOString() })
               .eq('order_code', orderCode)
               .eq('status', 'pending');
        } else {
            console.log(`Order ${orderCode} has an unhandled status: '${status}'. Ignoring.`);
        }
    } catch (error: any) {
        console.error(`FATAL: Error processing webhook:`, error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error while processing webhook.' }) };
    }

    console.log("--- Webhook Processed Successfully ---");
    return { statusCode: 200, body: JSON.stringify({ message: 'Webhook received and processed.' }) };
};

export { handler };