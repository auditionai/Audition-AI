import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient.ts';
// Use require for CommonJS compatibility with the PayOS library
const PayOS = require("@payos/node");

const payos = new PayOS(
    process.env.PAYOS_CLIENT_ID!,
    process.env.PAYOS_API_KEY!,
    process.env.PAYOS_CHECKSUM_KEY!
);

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // 1. Authenticate user
    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { packageId } = JSON.parse(event.body || '{}');
        if (!packageId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Package ID is required.' }) };
        }

        // 2. Fetch package details
        const { data: pkg, error: pkgError } = await supabaseAdmin
            .from('credit_packages')
            .select('*')
            .eq('id', packageId)
            .single();

        if (pkgError || !pkg) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Package not found.' }) };
        }

        const orderCode = parseInt(String(Date.now()).slice(-6));
        
        const paymentData = {
            orderCode,
            amount: pkg.price,
            description: `Mua ${pkg.name} - Audition AI`,
            cancelUrl: `${process.env.URL}/creator`,
            returnUrl: `${process.env.URL}/creator`,
        };

        // 3. Create a pending transaction record
        const { error: transactionError } = await supabaseAdmin
            .from('transactions')
            .insert({
                user_id: user.id,
                package_id: pkg.id,
                amount: pkg.price,
                status: 'pending',
                order_code: orderCode,
            });
        
        if (transactionError) {
            console.error("Error creating transaction:", transactionError);
            throw new Error('Could not create transaction record.');
        }

        // 4. Create payment link with PayOS
        const paymentLink = await payos.createPaymentLink(paymentData);

        return {
            statusCode: 200,
            body: JSON.stringify({ checkoutUrl: paymentLink.checkoutUrl }),
        };

    } catch (error: any) {
        console.error('Payment link creation error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Internal Server Error' }) };
    }
};

export { handler };
