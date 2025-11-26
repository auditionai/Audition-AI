
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        const { milestoneDays } = JSON.parse(event.body || '{}');
        
        if (![7, 14, 30].includes(milestoneDays)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Mốc thưởng không hợp lệ.' }) };
        }

        // 1. Fetch User Profile & Configured Reward
        const [userRes, rewardRes] = await Promise.all([
            supabaseAdmin.from('users').select('consecutive_check_in_days, diamonds').eq('id', user.id).single(),
            supabaseAdmin.from('check_in_rewards').select('*').eq('consecutive_days', milestoneDays).single()
        ]);

        const userData = userRes.data;
        const rewardData = rewardRes.data;

        if (!userData || !rewardData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Dữ liệu không tồn tại.' }) };
        }

        // 2. Check Eligibility
        if (userData.consecutive_check_in_days < milestoneDays) {
            return { statusCode: 403, body: JSON.stringify({ error: `Bạn chưa đạt chuỗi ${milestoneDays} ngày.` }) };
        }

        // 3. Check Duplicate Claim (Heuristic: Check logs for this milestone transaction type created recently)
        // We check if there is a log for this milestone within the last `milestoneDays` days.
        // This assumes streak resets. If streak keeps going (31, 32...), user shouldn't claim 30 again immediately.
        // A simpler robust way: Check if a log exists created after `now - milestoneDays`
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - milestoneDays); 
        
        const transactionType = `MILESTONE_REWARD_${milestoneDays}`;

        const { data: existingClaim } = await supabaseAdmin
            .from('diamond_transactions_log')
            .select('id')
            .eq('user_id', user.id)
            .eq('transaction_type', transactionType)
            .gte('created_at', cutoffDate.toISOString())
            .limit(1)
            .single();

        if (existingClaim) {
            return { statusCode: 409, body: JSON.stringify({ error: 'Bạn đã nhận thưởng mốc này rồi.' }) };
        }

        // 4. Award Prize
        const diamondReward = rewardData.diamond_reward || 0;
        const xpReward = rewardData.xp_reward || 0;
        const newDiamonds = userData.diamonds + diamondReward;

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamonds }).eq('id', user.id),
            supabaseAdmin.rpc('increment_user_xp', { user_id_param: user.id, xp_amount: xpReward }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: diamondReward,
                transaction_type: transactionType,
                description: `Thưởng chuỗi ${milestoneDays} ngày`
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                message: `Nhận thành công ${diamondReward} Kim Cương & ${xpReward} XP!`,
                newDiamonds
            })
        };

    } catch (error: any) {
        console.error("Claim milestone failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
