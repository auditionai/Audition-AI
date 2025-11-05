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
    console.log("--- [START] PayOS Webhook Received ---");
    console.log("Raw Body:", event.body);

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    
    if (!PAYOS_CHECKSUM_KEY) {
        console.error('[FATAL] PAYOS_CHECKSUM_KEY is not set in environment variables.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Webhook configuration error.' }) };
    }
    
    try {
        const signatureFromHeader = event.headers['x-payos-signature'];
        const body = JSON.parse(event.body || '{}');
        console.log("Parsed Body:", JSON.stringify(body, null, 2));

        const webhookData = body.data;

        if (!webhookData || !signatureFromHeader) {
            console.error("[VALIDATION_ERROR] Missing 'data' object in webhook body or 'x-payos-signature' header.");
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing webhook data or signature.' }) };
        }
        
        // 1. Signature Validation
        const calculatedSignature = createSignature(webhookData, PAYOS_CHECKSUM_KEY);
        if (calculatedSignature !== signatureFromHeader) {
            console.warn(`[SECURITY_WARNING] Invalid signature. Calculated: ${calculatedSignature}, Received: ${signatureFromHeader}`);
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature.' }) };
        }
        console.log("[INFO] Signature validated successfully.");

        // 2. Data Extraction and Validation
        const { orderCode, status } = webhookData;
        
        console.log(`[INFO] Extracted Data - Order Code: ${orderCode}, Status: ${status}`);

        const numericOrderCode = Number(orderCode);
        if (isNaN(numericOrderCode)) {
            console.error(`[VALIDATION_ERROR] orderCode '${orderCode}' is not a valid number.`);
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid orderCode format.' }) };
        }

        // 3. THE DEFINITIVE SUCCESS CHECK:
        // This is the "intelligent" and "robust" solution. We ONLY care about a valid signature
        // and a 'PAID' status. The top-level 'code' is irrelevant and fragile for webhooks.
        const isSuccess = status?.toUpperCase() === 'PAID';
        const isFailure = status?.toUpperCase() === 'CANCELLED' || status?.toUpperCase() === 'FAILED';

        if (isSuccess) {
            console.log(`[SUCCESS] Order ${numericOrderCode} is PAID. Calling atomic database function 'complete_paid_transaction'.`);
            
            // 4. Atomic Database Update via RPC
            const { data: rpcData, error: rpcError } = await supabaseAdmin
                .rpc('complete_paid_transaction', { order_code_param: numericOrderCode });

            if (rpcError) {
                console.error(`[DB_ERROR] RPC failed for order ${numericOrderCode}:`, JSON.stringify(rpcError, null, 2));
                // Still return 200 to PayOS so it doesn't retry, but log the critical error.
                return { statusCode: 500, body: JSON.stringify({ error: `Database function failed: ${rpcError.message}` }) };
            }

            console.log(`[DB_SUCCESS] RPC Response for order ${numericOrderCode}:`, JSON.stringify(rpcData, null, 2));

        } else if (isFailure) {
            const dbStatus = status.toUpperCase() === 'CANCELLED' ? 'canceled' : 'failed';
            console.log(`[INFO] Order ${numericOrderCode} has status ${status}. Updating transaction to '${dbStatus}'.`);
            
            const { error: updateError } = await supabaseAdmin
               .from('transactions')
               .update({ status: dbStatus, updated_at: new Date().toISOString() })
               .eq('order_code', numericOrderCode)
               .eq('status', 'pending');
            
            if (updateError) {
                 console.error(`[DB_ERROR] Failed to update status to '${dbStatus}' for order ${numericOrderCode}:`, updateError.message);
            }

        } else {
            console.log(`[INFO] Order ${numericOrderCode} has an unhandled status: '${status}'. Ignoring.`);
        }

    } catch (error: any) {
        console.error(`[FATAL] Unhandled error processing webhook:`, error.message, error.stack);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error while processing webhook.' }) };
    }

    console.log("--- [END] Webhook Processed Successfully ---");
    return { statusCode: 200, body: JSON.stringify({ message: 'Webhook received and processed.' }) };
};
