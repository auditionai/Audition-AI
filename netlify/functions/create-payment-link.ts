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

        // 2. Fetch package details from DB to prevent price tampering
        const { data: pkg, error: pkgError } = await supabaseAdmin
            .from('credit_packages')
            .select('*')
            .eq('id', packageId)
            .single();

        if (pkgError || !pkg) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Package not found.' }) };
        }

        // 3. Create a unique order code
        const orderCode = Date.now();
        const totalCredits = pkg.credits_amount + pkg.bonus_credits;

        // 4. Create a transaction record in your database
        const { error: transactionError } = await supabaseAdmin
            .from('transactions')
            .insert({
                order_code: orderCode,
                user_id: user.id,
                package_id: pkg.id,
                amount: pkg.price_vnd,
                status: 'pending'
            });

        if (transactionError) throw transactionError;

        // 5. Create payment link with PayOS
        const paymentData = {
            orderCode,
            amount: pkg.price_vnd,
            description: `Mua ${totalCredits.toLocaleString()} cPIX`,
            returnUrl: process.env.PAYOS_RETURN_URL!,
            cancelUrl: process.env.PAYOS_CANCEL_URL!,
        };
        
        try {
            const paymentLink = await payos.createPaymentLink(paymentData);
            return {
                statusCode: 200,
                body: JSON.stringify({ checkoutUrl: paymentLink.checkoutUrl }),
            };
        } catch (payosError: any) {
            console.error("PayOS API Error:", payosError);
            // This will catch errors like invalid credentials
            throw new Error(`Lỗi kết nối đến cổng thanh toán: ${payosError.message}. Vui lòng kiểm tra lại cấu hình PayOS.`);
        }


    } catch (error: any) {
        console.error("Payment link creation failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };