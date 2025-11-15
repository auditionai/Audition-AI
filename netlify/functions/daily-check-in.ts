import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const getVNDate = (date: Date) => new Date(date.getTime() + 7 * 60 * 60 * 1000);
const getVNDateString = (date: Date) => getVNDate(date).toISOString().split('T')[0];

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('diamonds, xp, last_check_in_at, consecutive_check_in_days')
            .eq('id', user.id)
            .single();

        if (profileError) throw profileError;
        
        const now = new Date();
        const todayVnString = getVNDateString(now);

        const lastCheckInDate = userProfile.last_check_in_at ? new Date(userProfile.last_check_in_at) : null;
        const lastCheckInVnString = lastCheckInDate ? getVNDateString(lastCheckInDate) : null;

        if (lastCheckInVnString === todayVnString) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Bạn đã điểm danh hôm nay rồi.', checkedIn: true })
            };
        }

        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        const yesterdayVnString = getVNDateString(yesterday);
        
        let newConsecutiveDays = 1;
        if (lastCheckInVnString === yesterdayVnString) {
            newConsecutiveDays = (userProfile.consecutive_check_in_days || 0) + 1;
        }

        // Fetch the highest applicable reward from the database
        // Fix: Changed const to let to allow reassignment for fallback reward.
        let { data: rewardData, error: rewardError } = await supabaseAdmin
            .from('check_in_rewards')
            .select('diamond_reward, xp_reward')
            .eq('is_active', true)
            .lte('consecutive_days', newConsecutiveDays)
            .order('consecutive_days', { ascending: false })
            .limit(1)
            .single();

        if (rewardError || !rewardData) {
            // Fallback to a default reward if none is configured
            console.error("Could not find a valid check-in reward, using fallback.", rewardError);
            rewardData = { diamond_reward: 1, xp_reward: 10 };
        }

        const { diamond_reward: diamondReward, xp_reward: xpReward } = rewardData;

        let message = `Điểm danh thành công! Bạn nhận được ${diamondReward} Kim cương và ${xpReward} XP.`;

        const newTotalDiamonds = userProfile.diamonds + diamondReward;
        const newTotalXp = userProfile.xp + xpReward;

        // Perform updates
        const { error: userUpdateError } = await supabaseAdmin
            .from('users')
            .update({
                diamonds: newTotalDiamonds,
                xp: newTotalXp,
                last_check_in_at: now.toISOString(),
                consecutive_check_in_days: newConsecutiveDays,
            })
            .eq('id', user.id);

        if (userUpdateError) throw userUpdateError;

        await Promise.all([
             supabaseAdmin.from('daily_check_ins').insert({ user_id: user.id, check_in_date: todayVnString }),
             supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: diamondReward,
                transaction_type: 'DAILY_CHECK_IN',
                description: `Điểm danh chuỗi ${newConsecutiveDays} ngày`
             })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message,
                newTotalDiamonds,
                newTotalXp,
                consecutiveDays: newConsecutiveDays,
                checkedIn: true
            }),
        };

    } catch (error: any) {
        console.error("Daily check-in failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error during check-in.' }) };
    }
};

export { handler };