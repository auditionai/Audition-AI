// Fix: Use `import ... = require(...)` for CommonJS compatibility with the PayOS library, as the ES module import causes a type error.
import PayOS = require("@payos/node");
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

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

        // *** NEW LOGIC ***
        // Only process webhooks that represent a successful payment.
        // For all other webhooks (verification, failed, etc.), acknowledge them with 200 OK.
        if (webhookBody.code === '00') {
            // This is a successful transaction, proceed with verification and processing.
            const verifiedData = payos.verifyPaymentWebhookData(webhookBody);
            
            // This check is now an extra layer of security.
            if (verifiedData.desc !== 'Success') {
                console.warn('Webhook received non-success description despite code 00:', verifiedData);
                // Still return 200 to avoid PayOS retries for a failed payment.
                return { statusCode: 200, body: JSON.stringify({ message: 'Acknowledged non-success event.' }) };
            }

            const { orderCode, status } = verifiedData.data;

            // Find the transaction in your database
            const { data: transaction, error: transactionError } = await supabaseAdmin
                .from('transactions')
                .select('*, credit_packages(credits_amount, bonus_credits)')
                .eq('order_code', orderCode)
                .single();

            if (transactionError || !transaction) {
                console.error(`Transaction with orderCode ${orderCode} not found.`);
                return { statusCode: 404, body: JSON.stringify({ error: 'Transaction not found.' }) };
            }

            // Check if already completed to prevent double processing
            if (transaction.status === 'completed') {
                console.log(`Transaction ${orderCode} already completed.`);
                return { statusCode: 200, body: JSON.stringify({ message: 'Already processed.' }) };
            }

            // Update based on status
            if (status === 'PAID') {
                // Get user's current diamonds
                const { data: user, error: userError } = await supabaseAdmin
                    .from('users')
                    .select('diamonds')
                    .eq('id', transaction.user_id)
                    .single();
                
                if (userError || !user) throw new Error(`User not found for transaction ${orderCode}`);

                const creditsToAdd = transaction.credit_packages.credits_amount + transaction.credit_packages.bonus_credits;
                const newDiamondCount = user.diamonds + creditsToAdd;

                // Use a database function to update user diamonds and transaction status atomically
                const { error: updateError } = await supabaseAdmin.rpc('complete_transaction_and_add_credits', {
                    p_order_code: orderCode,
                    p_user_id: transaction.user_id,
                    p_new_diamond_count: newDiamondCount
                });

                if (updateError) throw updateError;
            }
        } else {
            // This is a verification ping, a failed transaction, or another event type.
            // Acknowledge it so PayOS knows the webhook is working.
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