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
        return { statusCode: 500, body: JSON.stringify({ error: 'Cổng thanh toán chưa được cấu hình.' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
    }

    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };
    }

    const { packageId } = JSON.parse(event.body || '{}');
    if (!packageId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Package ID is required.' }) };
    }

    try {
        // 1. Fetch user profile and package details simultaneously
        const [
            { data: userProfile, error: profileError },
            { data: pkg, error: pkgError }
        ] = await Promise.all([
            supabaseAdmin.from('users').select('display_name').eq('id', user.id).single(),
            supabaseAdmin.from('credit_packages').select('*').eq('id', packageId).eq('is_active', true).single()
        ]);

        if (profileError || !userProfile) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Không tìm thấy hồ sơ người dùng.' }) };
        }
        if (pkgError || !pkg) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Gói nạp không tồn tại hoặc đã bị vô hiệu hóa.' }) };
        }

        // 2. Create a new transaction record
        const orderCode = Date.now(); // Using timestamp is simpler and sufficient for uniqueness
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
            throw new Error(`Không thể tạo bản ghi giao dịch: ${transactionError.message}`);
        }

        // 3. Prepare data for PayOS, separating signed data from the full payload
        const description = `NAP AUAI ${pkg.credits_amount}KC`;
        const baseUrl = process.env.URL || 'http://localhost:8888';
        const returnUrl = `${baseUrl}/buy-credits`;
        const cancelUrl = `${baseUrl}/buy-credits`;

        // CORRECT APPROACH: This object contains ONLY the fields required for the signature.
        const dataToSign = {
            orderCode,
            amount: pkg.price_vnd,
            description,
            cancelUrl,
            returnUrl,
        };
        
        // Generate the signature from the specific data object.
        const signature = createSignature(dataToSign, PAYOS_CHECKSUM_KEY);

        // This is the final payload sent to PayOS, including the non-signed data and the signature.
        const finalPayload = {
            ...dataToSign,
            buyerName: userProfile.display_name,
            buyerEmail: user.email,
            signature,
        };

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
            // Forward the specific error from PayOS to the client
            throw new Error(payosResult.desc || 'Không thể tạo liên kết thanh toán từ PayOS.');
        }

        // 5. Return the checkout URL
        return {
            statusCode: 200,
            body: JSON.stringify({ checkoutUrl: payosResult.data.checkoutUrl }),
        };

    } catch (error: any) {
        console.error('Create payment link error:', error);
        // Return the specific error message to be displayed in the toast
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };