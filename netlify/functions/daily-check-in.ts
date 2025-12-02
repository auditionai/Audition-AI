
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
    // FIX: Use Supabase v2 `auth.getUser` by casting to any
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
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

        // FETCH DYNAMIC REWARD FROM DB
        // We look for the config for '1 day' to represent the standard daily reward
        const { data: dailyConfig } = await supabaseAdmin
            .from('check_in_rewards')
            .select('diamond_reward, xp_reward')
            .eq('consecutive_days', 1)
            .limit(1)
            .maybeSingle();

        // Use DB config if exists, otherwise default to 5 Diamonds (as requested) and 10 XP
        const diamondReward = dailyConfig?.diamond_reward ?? 5;
        const xpReward = dailyConfig?.xp_reward ?? 10;

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
                description: `Điểm danh ngày thứ ${newConsecutiveDays}`
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
