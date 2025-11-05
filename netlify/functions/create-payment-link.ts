import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import crypto from 'crypto';

const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

// PayOS docs: The signature is created by sorting parameters alphabetically,
// joining them with '&', and then creating an HMAC-SHA256 hash.
const createSignature = (data: Record<string, any>, checksumKey: string): string => {
    const sortedKeys = Object.keys(data).sort();
    const dataString = sortedKeys.map(key => `${key}=${data[key]}`).join('&');
    return crypto.createHmac('sha256', checksumKey).update(dataString).digest('hex');
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    
    if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
        console.error('PayOS environment variables are not set.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Payment gateway is not configured.' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };
    }

    const { packageId } = JSON.parse(event.body || '{}');
    if (!packageId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Package ID is required.' }) };
    }

    try {
        // 1. Fetch package details
        const { data: pkg, error: pkgError } = await supabaseAdmin
            .from('credit_packages')
            .select('*')
            .eq('id', packageId)
            .eq('is_active', true)
            .single();

        if (pkgError || !pkg) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Package not found or inactive.' }) };
        }

        // 2. Create a new transaction record
        const orderCode = Math.floor(Date.now() / 1000 + Math.random() * 1000000);
        const totalDiamonds = pkg.credits_amount + pkg.bonus_credits;

        const { error: transactionError } = await supabaseAdmin
            .from('transactions')
            .insert({
                order_code: orderCode,
                user_id: user.id,
                package_id: pkg.id,
                amount_vnd: pkg.price_vnd,
                diamonds_received: totalDiamonds,
                status: 'pending',
            });

        if (transactionError) {
            throw new Error(`Failed to create transaction record: ${transactionError.message}`);
        }

        // 3. Prepare data for PayOS
        const description = `Thanh toan goi ${totalDiamonds} kim cuong cho Audition AI`;
        // Using Netlify's URL variable if available
        const baseUrl = process.env.URL || 'http://localhost:8888';
        const returnUrl = `${baseUrl}/buy-credits?status=PAID&orderCode=${orderCode}`;
        const cancelUrl = `${baseUrl}/buy-credits?status=CANCELLED&orderCode=${orderCode}`;

        const payOSData = {
            orderCode,
            amount: pkg.price_vnd,
            description,
            cancelUrl,
            returnUrl,
            buyerEmail: user.email,
        };

        const signature = createSignature(payOSData, PAYOS_CHECKSUM_KEY);
        const finalPayload = { ...payOSData, signature };

        // 4. Call PayOS API to create payment link
        const payosResponse = await fetch('https://api-merchant.payos.vn/v2/payment-requests', {
            method: 'POST',
            headers: {
                'x-client-id': PAYOS_CLIENT_ID,
                'x-api-key': PAYOS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalPayload)
        });

        const payosResult = await payosResponse.json();
        
        if (payosResult.code !== '00' || !payosResult.data) {
            throw new Error(payosResult.desc || 'Failed to create payment link from PayOS.');
        }

        // 5. Return the checkout URL
        return {
            statusCode: 200,
            body: JSON.stringify({ checkoutUrl: payosResult.data.checkoutUrl }),
        };

    } catch (error: any) {
        console.error('Create payment link error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error.' }) };
    }
};

export { handler };
