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
    console.log("--- [START] PayOS Webhook Received (v2) ---");

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    
    if (!PAYOS_CHECKSUM_KEY) {
        console.error('[FATAL] PAYOS_CHECKSUM_KEY is not set.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Webhook configuration error.' }) };
    }
    
    try {
        const signatureFromHeader = event.headers['x-payos-signature'];
        const body = JSON.parse(event.body || '{}');
        const webhookData = body.data;

        if (!webhookData || !signatureFromHeader) {
            console.error("[VALIDATION_ERROR] Missing 'data' or 'signature' header.");
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
            console.log(`[SUCCESS] Order ${numericOrderCode} is PAID. Calling database function to process...`);
            
            // Gọi hàm cơ sở dữ liệu để xử lý giao dịch một cách toàn vẹn
            const { data: rpcData, error: rpcError } = await supabaseAdmin
                .rpc('process_paid_transaction', { p_order_code: numericOrderCode });

            if (rpcError) {
                // Lỗi này có nghĩa là đã có sự cố bên trong hàm RPC
                console.error(`[DB_RPC_ERROR] Error processing transaction for order ${numericOrderCode}:`, rpcError.message);
                return { statusCode: 500, body: JSON.stringify({ error: `Database processing failed: ${rpcError.message}` }) };
            }
            
            // Hàm trả về một hàng với { success, message }
            const result = rpcData[0];
            console.log(`[DB_RPC_SUCCESS] Result for order ${numericOrderCode}: ${result.message}`);

        } else if (isFailure) {
            const dbStatus = status.toUpperCase() === 'CANCELLED' ? 'canceled' : 'failed';
            // Chỉ cập nhật trạng thái, không cần logic phức tạp
            await supabaseAdmin
               .from('transactions')
               .update({ status: dbStatus, updated_at: new Date().toISOString() })
               .eq('order_code', numericOrderCode)
               .eq('status', 'pending');
            console.log(`[INFO] Order ${numericOrderCode} marked as '${dbStatus}'.`);
        }

    } catch (error: any) {
        console.error(`[FATAL] Unhandled error in webhook:`, error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error.' }) };
    }

    console.log("--- [END] Webhook Processed Successfully (v2) ---");
    // Luôn trả về 200 OK cho PayOS để tránh họ gửi lại yêu cầu
    return { statusCode: 200, body: JSON.stringify({ message: 'Webhook received.' }) };
};

export { handler };