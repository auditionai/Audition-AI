import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import crypto from 'crypto';

const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

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
        
        const calculatedSignature = createSignature(webhookData, PAYOS_CHECKSUM_KEY);
        if (calculatedSignature !== signatureFromHeader) {
            console.warn(`[SECURITY_WARNING] Invalid signature. Calculated: ${calculatedSignature}, Received: ${signatureFromHeader}`);
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature.' }) };
        }
        console.log("[INFO] Signature validated successfully.");

        const { orderCode, status } = webhookData;
        
        console.log(`[INFO] Extracted Data - Order Code: ${orderCode}, Status: ${status}`);

        const numericOrderCode = Number(orderCode);
        if (isNaN(numericOrderCode)) {
            console.error(`[VALIDATION_ERROR] orderCode '${orderCode}' is not a valid number.`);
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid orderCode format.' }) };
        }
        
        const isSuccess = status?.toUpperCase() === 'PAID';
        const isFailure = status?.toUpperCase() === 'CANCELLED' || status?.toUpperCase() === 'FAILED';

        if (isSuccess) {
            console.log(`[SUCCESS] Order ${numericOrderCode} is PAID. Processing transaction...`);
            
            // Lấy giao dịch đang chờ xử lý
            const { data: transaction, error: fetchError } = await supabaseAdmin
               .from('transactions')
               .select('id, user_id, diamonds_received, amount_vnd')
               .eq('order_code', numericOrderCode)
               .eq('status', 'pending')
               .single();

            if (fetchError || !transaction) {
                console.error(`[DB_ERROR] Transaction for order ${numericOrderCode} not found or already processed. Error:`, fetchError?.message);
                return { statusCode: 404, body: JSON.stringify({ error: 'Transaction not found or already processed.' }) };
            }

            // Lấy thông tin XP hiện tại của người dùng
            const { data: userProfile, error: userFetchError } = await supabaseAdmin
                .from('users')
                .select('xp, diamonds')
                .eq('id', transaction.user_id)
                .single();
            
            if (userFetchError || !userProfile) {
                 console.error(`[DB_ERROR] User profile not found for user ${transaction.user_id}.`);
                 return { statusCode: 404, body: JSON.stringify({ error: 'User profile not found.' }) };
            }

            // Tính toán giá trị mới
            const xpToAdd = Math.floor(transaction.amount_vnd / 1000);
            const newXp = (userProfile.xp || 0) + xpToAdd;
            const newDiamonds = (userProfile.diamonds || 0) + transaction.diamonds_received;

            // Cập nhật tài khoản người dùng và trạng thái giao dịch
            const { error: userUpdateError } = await supabaseAdmin
                .from('users')
                .update({ diamonds: newDiamonds, xp: newXp })
                .eq('id', transaction.user_id);

            if (userUpdateError) throw new Error(`Failed to credit user: ${userUpdateError.message}`);

            const { error: transactionUpdateError } = await supabaseAdmin
                .from('transactions')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', transaction.id);
            
            if (transactionUpdateError) throw new Error(`Failed to update transaction status: ${transactionUpdateError.message}`);
            
            console.log(`[DB_SUCCESS] Successfully processed order ${numericOrderCode}. User ${transaction.user_id} credited.`);

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
