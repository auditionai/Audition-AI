
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const REFERRAL_BONUS = 5;
const REFERRER_SPIN_BONUS = 3; // +3 spins for referrer

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    const { referralCode } = JSON.parse(event.body || '{}');
    if (!referralCode || referralCode.length < 8) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid referral code.' }) };
    }

    try {
        // 1. Check if current user already claimed referral bonus
        const { data: existingTx } = await supabaseAdmin
            .from('diamond_transactions_log')
            .select('id')
            .eq('user_id', user.id)
            .eq('transaction_type', 'REFERRAL_BONUS_RECEIVED')
            .limit(1)
            .single();

        if (existingTx) {
            return { statusCode: 400, body: JSON.stringify({ error: 'You have already used a referral code.' }) };
        }

        // 2. Find the referrer
        const { data: referrers, error: referrerError } = await supabaseAdmin
            .from('users')
            .select('id, diamonds, spin_tickets')
            .ilike('id', `${referralCode}%`)
            .limit(1);

        if (referrerError || !referrers || referrers.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Referral code not found.' }) };
        }

        const referrer = referrers[0];

        if (referrer.id === user.id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Cannot refer yourself.' }) };
        }

        // 3. Award Diamonds to NEW USER (Invitee) - 5 Diamonds
        const { data: inviteeData } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: (inviteeData?.diamonds || 0) + REFERRAL_BONUS }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: REFERRAL_BONUS,
                transaction_type: 'REFERRAL_BONUS_RECEIVED',
                description: `Nhập mã giới thiệu: ${referralCode}`
            })
        ]);

        // 4. Award REFERRER: 5 Diamonds + 3 Spin Tickets
        await Promise.all([
            supabaseAdmin.from('users').update({ 
                diamonds: referrer.diamonds + REFERRAL_BONUS,
                spin_tickets: (referrer.spin_tickets || 0) + REFERRER_SPIN_BONUS 
            }).eq('id', referrer.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: referrer.id,
                amount: REFERRAL_BONUS,
                transaction_type: 'REFERRAL_BONUS_GIVEN',
                description: `Mời thành công người dùng mới (+${REFERRER_SPIN_BONUS} Vé quay)`
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Referral successful!', bonus: REFERRAL_BONUS }),
        };

    } catch (error: any) {
        console.error("Process referral error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
