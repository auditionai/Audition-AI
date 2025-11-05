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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('diamonds, last_check_in_ct, consecutive_check_in_days')
            .eq('id', user.id)
            .single();

        if (profileError) throw profileError;
        
        const now = new Date();
        const todayVnString = getVNDateString(now);

        const lastCheckInDate = userProfile.last_check_in_ct ? new Date(userProfile.last_check_in_ct) : null;
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

        let reward = 10;
        let message = 'Điểm danh thành công! Bạn nhận được 10 Kim cương.';

        if (newConsecutiveDays === 30) {
            reward += 100;
            message = `Điểm danh thành công chuỗi 30 ngày! Bạn nhận được 10 Kim cương + 100 Kim cương thưởng!`;
        } else if (newConsecutiveDays === 14) {
            reward += 50;
            message = `Điểm danh thành công chuỗi 14 ngày! Bạn nhận được 10 Kim cương + 50 Kim cương thưởng!`;
        } else if (newConsecutiveDays === 7) {
            reward += 20;
            message = `Điểm danh thành công chuỗi 7 ngày! Bạn nhận được 10 Kim cương + 20 Kim cương thưởng!`;
        }

        const newTotalDiamonds = userProfile.diamonds + reward;

        // Perform updates
        const { error: userUpdateError } = await supabaseAdmin
            .from('users')
            .update({
                diamonds: newTotalDiamonds,
                last_check_in_ct: now.toISOString(),
                consecutive_check_in_days: newConsecutiveDays,
            })
            .eq('id', user.id);

        if (userUpdateError) throw userUpdateError;

        const { error: checkInInsertError } = await supabaseAdmin
            .from('daily_check_ins')
            .insert({
                user_id: user.id,
                check_in_date: todayVnString,
            });

        // This might fail if there's a unique constraint, but it's okay because the user table is already updated.
        // The check at the start prevents double rewards. We can ignore this error if it's a duplicate key violation.
        if (checkInInsertError && checkInInsertError.code !== '23505') { // 23505 is unique_violation
             throw checkInInsertError;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message,
                newTotalDiamonds,
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