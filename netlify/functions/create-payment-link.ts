
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import crypto from 'crypto';

const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

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
        return { statusCode: 500, body: JSON.stringify({ error: 'Cổng thanh toán chưa được cấu hình.' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };

    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    const { packageId } = JSON.parse(event.body || '{}');
    if (!packageId) return { statusCode: 400, body: JSON.stringify({ error: 'Package ID is required.' }) };

    try {
        // 1. Fetch User & Package
        const [
            { data: userProfile, error: profileError },
            { data: pkg, error: pkgError }
        ] = await Promise.all([
            supabaseAdmin.from('users').select('display_name').eq('id', user.id).single(),
            supabaseAdmin.from('credit_packages').select('*').eq('id', packageId).eq('is_active', true).single()
        ]);

        if (profileError || !userProfile) return { statusCode: 404, body: JSON.stringify({ error: 'Không tìm thấy hồ sơ người dùng.' }) };
        if (pkgError || !pkg) return { statusCode: 404, body: JSON.stringify({ error: 'Gói nạp không tồn tại.' }) };

        // 2. Check Promotion
        const now = new Date().toISOString();
        const { data: activePromo } = await supabaseAdmin
            .from('promotions')
            .select('bonus_percentage')
            .eq('is_active', true)
            .lte('start_time', now)
            .gte('end_time', now)
            .limit(1)
            .maybeSingle();

        // 3. Calculate FINAL Diamonds Received (Base + Static Bonus + Promo Bonus)
        let totalDiamonds = pkg.credits_amount + pkg.bonus_credits;
        
        if (activePromo) {
            // Promo bonus is usually based on base credits
            const promoBonus = Math.floor(pkg.credits_amount * (activePromo.bonus_percentage / 100));
            totalDiamonds += promoBonus;
        }

        // 4. Create Transaction Record (Pending)
        // IMPORTANT: Store the CALCULATED total here. When admin approves, this is the amount used.
        const orderCode = Date.now();
        const { error: transactionError } = await supabaseAdmin
            .from('transactions')
            .insert({
                order_code: orderCode,
                user_id: user.id,
                package_id: pkg.id,
                amount_vnd: pkg.price_vnd,
                diamonds_received: totalDiamonds, // Contains promo bonus!
                status: 'pending',
            });

        if (transactionError) throw new Error(`DB Error: ${transactionError.message}`);

        // 5. Create PayOS Link
        const description = `NAP AUAI ${pkg.credits_amount}KC`; // Keep description simple
        const baseUrl = process.env.URL || 'https://auditionai.io.vn';
        const returnUrl = `${baseUrl}/buy-credits`;
        const cancelUrl = `${baseUrl}/buy-credits`;

        const dataToSign = {
            orderCode,
            amount: pkg.price_vnd,
            description,
            cancelUrl,
            returnUrl,
        };
        
        const signature = createSignature(dataToSign, PAYOS_CHECKSUM_KEY);
        const finalPayload = {
            ...dataToSign,
            buyerName: userProfile.display_name,
            buyerEmail: user.email,
            signature,
        };

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
            throw new Error(payosResult.desc || 'Lỗi tạo link PayOS.');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ checkoutUrl: payosResult.data.checkoutUrl }),
        };

    } catch (error: any) {
        console.error('Create payment link error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
