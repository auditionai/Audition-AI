// Fix: Use standard ES module import for PayOS.
import PayOS from "@payos/node";
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const payos = new PayOS(
    process.env.PAYOS_CLIENT_ID!,
    process.env.PAYOS_API_KEY!,
    process.env.PAYOS_CHECKSUM_KEY!
);

const handler: Handler = async (event: HandlerEvent) => {
    // Handle PayOS Webhook verification GET request
    if (event.httpMethod === 'GET') {
        console.log("Received GET request for webhook verification from PayOS.");
        return {
            statusCode: 200,
            body: 'OK', // A simple OK response is sufficient for verification
        };
    }
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const webhookBody = JSON.parse(event.body || '{}');
        
        // 1. Verify webhook data
        const verifiedData = payos.verifyPaymentWebhookData(webhookBody);

        if (verifiedData.code !== '00' || verifiedData.desc !== 'Success' || !verifiedData.data) {
             console.warn('Webhook received non-success data or failed verification:', verifiedData);
            return { statusCode: 400, body: JSON.stringify({ error: 'Webhook data invalid or payment not successful.' }) };
        }

        const { orderCode, status } = verifiedData.data;

        // 2. Find the transaction in your database
        const { data: transaction, error: transactionError } = await supabaseAdmin
            .from('transactions')
            .select('*, credit_packages(credits_amount, bonus_credits)')
            .eq('order_code', orderCode)
            .single();

        if (transactionError || !transaction) {
            console.error(`Transaction with orderCode ${orderCode} not found.`);
            return { statusCode: 404, body: JSON.stringify({ error: 'Transaction not found.' }) };
        }

        // 3. Check if already completed to prevent double processing
        if (transaction.status === 'completed') {
            console.log(`Transaction ${orderCode} already completed.`);
            return { statusCode: 200, body: JSON.stringify({ message: 'Already processed.' }) };
        }

        // 4. Update based on status
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

            // Use a transaction to update user diamonds and transaction status
            const { error: updateError } = await supabaseAdmin.rpc('complete_transaction_and_add_credits', {
                p_order_code: orderCode,
                p_user_id: transaction.user_id,
                p_new_diamond_count: newDiamondCount
            });

            if (updateError) throw updateError;
            
        } else {
             // Handle other statuses like CANCELLED if needed
            await supabaseAdmin
                .from('transactions')
                .update({ status: 'failed' })
                .eq('order_code', orderCode);
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