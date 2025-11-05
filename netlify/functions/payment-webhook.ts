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
        const webhookData = body.data;

        if (!webhookData || !signatureFromHeader) {
            console.error("[VALIDATION_ERROR] Missing 'data' object or 'x-payos-signature' header.");
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing webhook data or signature.' }) };
        }
        
        const calculatedSignature = createSignature(webhookData, PAYOS_CHECKSUM_KEY);
        if (calculatedSignature !== signatureFromHeader) {
            console.warn(`[SECURITY_WARNING] Invalid signature.`);
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature.' }) };
        }
        console.log("[INFO] Signature validated successfully.");

        const { orderCode, status } = webhookData;
        const numericOrderCode = Number(orderCode);
        if (isNaN(numericOrderCode)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid orderCode format.' }) };
        }
        
        const isSuccess = status?.toUpperCase() === 'PAID';
        const isFailure = status?.toUpperCase() === 'CANCELLED' || status?.toUpperCase() === 'FAILED';

        if (isSuccess) {
            console.log(`[SUCCESS] Order ${numericOrderCode} is PAID. Processing transaction...`);
            
            // Tìm giao dịch đang chờ xử lý
            const { data: transaction, error: findError } = await supabaseAdmin
                .from('transactions')
                .select('*')
                .eq('order_code', numericOrderCode)
                .eq('status', 'pending')
                .single();

            if (findError) {
                console.warn(`[DB_WARN] Transaction for order ${numericOrderCode} not found or already processed. Error:`, findError.message);
                // Vẫn trả về 200 vì có thể webhook bị gửi trùng lặp
                return { statusCode: 200, body: JSON.stringify({ message: 'Transaction already processed or not found.' }) };
            }

            // Tìm thông tin người dùng
            const { data: userProfile, error: userError } = await supabaseAdmin
                .from('users')
                .select('diamonds, xp')
                .eq('id', transaction.user_id)
                .single();
            
            if (userError) {
                console.error(`[DB_ERROR] User not found for transaction ${transaction.id}. Aborting.`);
                return { statusCode: 500, body: JSON.stringify({ error: 'User associated with transaction not found.' }) };
            }
            
            // Tính toán giá trị mới
            const xpToAdd = Math.floor(transaction.amount_vnd / 1000);
            const newTotalDiamonds = userProfile.diamonds + transaction.diamonds_received;
            const newTotalXp = userProfile.xp + xpToAdd;

            // Cập nhật song song user và transaction
            const [userUpdateResult, transactionUpdateResult] = await Promise.all([
                supabaseAdmin
                    .from('users')
                    .update({ diamonds: newTotalDiamonds, xp: newTotalXp })
                    .eq('id', transaction.user_id),
                supabaseAdmin
                    .from('transactions')
                    .update({ status: 'completed', updated_at: new Date().toISOString() })
                    .eq('id', transaction.id)
            ]);
            
            if (userUpdateResult.error || transactionUpdateResult.error) {
                 console.error(`[DB_ERROR] Failed to finalize transaction ${transaction.id}. User Error: ${userUpdateResult.error?.message}, Transaction Error: ${transactionUpdateResult.error?.message}`);
                 // Vẫn trả về 200, nhưng log lỗi để kiểm tra thủ công
            } else {
                 console.log(`[DB_SUCCESS] Successfully credited user ${transaction.user_id} and completed transaction ${transaction.id}.`);
            }

        } else if (isFailure) {
            const dbStatus = status.toUpperCase() === 'CANCELLED' ? 'canceled' : 'failed';
            await supabaseAdmin
               .from('transactions')
               .update({ status: dbStatus, updated_at: new Date().toISOString() })
               .eq('order_code', numericOrderCode)
               .eq('status', 'pending');
        }

    } catch (error: any) {
        console.error(`[FATAL] Unhandled error processing webhook:`, error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error.' }) };
    }

    console.log("--- [END] Webhook Processed Successfully ---");
    return { statusCode: 200, body: JSON.stringify({ message: 'Webhook received and processed.' }) };
};

export { handler };