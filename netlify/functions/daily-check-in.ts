import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

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
            .select('diamonds, last_check_in_at, consecutive_check_in_days')
            .eq('id', user.id)
            .single();

        if (profileError || !userProfile) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User profile not found.' }) };
        }
        
        // Helper to get YYYY-MM-DD string in Vietnam's timezone (UTC+7)
        const getVietnamDateString = (d: Date): string => {
            const vietnamTime = new Date(d.getTime() + 7 * 3600 * 1000);
            return vietnamTime.toISOString().split('T')[0];
        };
        
        const nowUTC = new Date();
        const todayVnString = getVietnamDateString(nowUTC);
        
        if (userProfile.last_check_in_at) {
            const lastCheckInUTC = new Date(userProfile.last_check_in_at);
            const lastCheckInVnString = getVietnamDateString(lastCheckInUTC);

            if (todayVnString === lastCheckInVnString) {
                return { statusCode: 200, body: JSON.stringify({ message: 'Bạn đã điểm danh hôm nay rồi.', checkedIn: true, newTotalDiamonds: undefined }) };
            }
        }

        // --- New Check-in Logic ---
        let consecutiveDays = 1;
        if (userProfile.last_check_in_at) {
            const yesterdayUTC = new Date(nowUTC.getTime() - 24 * 3600 * 1000);
            const yesterdayVnString = getVietnamDateString(yesterdayUTC);
            const lastCheckInVnString = getVietnamDateString(new Date(userProfile.last_check_in_at));
            
            if (lastCheckInVnString === yesterdayVnString) {
                consecutiveDays = (userProfile.consecutive_check_in_days || 0) + 1;
            }
        }

        let diamondsAwarded = 10; // Daily base reward
        let bonusMessage = `Điểm danh thành công! Bạn nhận được 10 kim cương.`;

        if (consecutiveDays === 30) {
            diamondsAwarded += 100;
            bonusMessage = `Chúc mừng chuỗi 30 ngày! Bạn nhận được 10 kim cương và +100 kim cương thưởng!`;
        } else if (consecutiveDays === 14) {
            diamondsAwarded += 50;
            bonusMessage = `Chúc mừng chuỗi 14 ngày! Bạn nhận được 10 kim cương và +50 kim cương thưởng!`;
        } else if (consecutiveDays === 7) {
            diamondsAwarded += 20;
            bonusMessage = `Chúc mừng chuỗi 7 ngày! Bạn nhận được 10 kim cương và +20 kim cương thưởng!`;
        }

        const newTotalDiamonds = userProfile.diamonds + diamondsAwarded;

        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                diamonds: newTotalDiamonds,
                last_check_in_at: nowUTC.toISOString(),
                consecutive_check_in_days: consecutiveDays
            })
            .eq('id', user.id);

        if (updateError) throw updateError;

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: bonusMessage,
                newTotalDiamonds,
                consecutiveDays,
                checkedIn: true
            }),
        };

    } catch (error: any) {
        console.error("Daily check-in failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
