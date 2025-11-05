import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
// Fix: Use `require` to import the CommonJS `@payos/node` module and access its `default` export,
// which contains the class constructor. This resolves the "not constructable" error.
const PayOS = require("@payos/node").default;

const payos = new PayOS(
    process.env.PAYOS_CLIENT_ID!,
    process.env.PAYOS_API_KEY!,
    process.env.PAYOS_CHECKSUM_KEY!
);

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const webhookBody = JSON.parse(event.body || '{}');

        // Chỉ xử lý webhook có mã '00' (thanh toán thành công)
        if (webhookBody.code === '00') {
            const verifiedData = payos.verifyPaymentWebhookData(webhookBody);
            
            if (verifiedData.desc !== 'Success') {
                console.warn('Webhook received non-success description despite code 00:', verifiedData);
                return { statusCode: 200, body: JSON.stringify({ message: 'Acknowledged non-success event.' }) };
            }

            const { orderCode, status } = verifiedData.data;

            // Tìm giao dịch trong database
            const { data: transaction, error: transactionError } = await supabaseAdmin
                .from('transactions')
                .select('*, credit_packages(credits_amount, bonus_credits)')
                .eq('order_code', orderCode)
                .single();

            if (transactionError || !transaction) {
                console.error(`Transaction with orderCode ${orderCode} not found.`);
                return { statusCode: 404, body: JSON.stringify({ error: 'Transaction not found.' }) };
            }

            // Chống xử lý trùng lặp
            if (transaction.status === 'completed') {
                console.log(`Transaction ${orderCode} already completed.`);
                return { statusCode: 200, body: JSON.stringify({ message: 'Already processed.' }) };
            }

            if (status === 'PAID') {
                // Lấy số kim cương hiện tại của người dùng
                const { data: user, error: userError } = await supabaseAdmin
                    .from('users')
                    .select('diamonds')
                    .eq('id', transaction.user_id)
                    .single();
                
                if (userError || !user) throw new Error(`User not found for transaction ${orderCode}`);

                // Tính toán số kim cương mới
                const creditsToAdd = transaction.diamonds_received;
                const newDiamondCount = user.diamonds + creditsToAdd;

                // Gọi hàm RPC để cập nhật database một cách an toàn
                const { error: updateError } = await supabaseAdmin.rpc('complete_transaction_and_add_credits', {
                    p_order_code: orderCode,
                    p_user_id: transaction.user_id,
                    p_new_diamond_count: newDiamondCount
                });

                if (updateError) throw updateError;
            }
        } else {
            console.log(`Received non-processing webhook event (code: ${webhookBody.code}). Acknowledging.`);
            return {
                statusCode: 200,
                body: JSON.stringify({ message: "Webhook acknowledged successfully." }),
            };
        }

        return { statusCode: 200, body: JSON.stringify({ success: true }) };

    } catch (error: any) {
        console.error('Webhook processing error:', error);
        if (error.message.includes('Webhook data is not valid')) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid webhook signature.' }) };
        }
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};

export { handler };