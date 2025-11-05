import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient.ts';

const BASE_REWARD = 2;
const STREAK_BONUS = 1; // 1 extra diamond per day of streak
const MAX_STREAK_BONUS = 5;

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
        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds, last_check_in, streak')
            .eq('id', user.id)
            .single();
        
        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day in UTC

        if (userData.last_check_in) {
            const lastCheckInDate = new Date(userData.last_check_in);
            lastCheckInDate.setHours(0, 0, 0, 0);
            if (lastCheckInDate.getTime() === today.getTime()) {
                return { statusCode: 429, body: JSON.stringify({ error: 'Bạn đã điểm danh hôm nay rồi.' }) };
            }
        }

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        
        let newStreak = 1;
        if (userData.last_check_in) {
             const lastCheckInDate = new Date(userData.last_check_in);
             lastCheckInDate.setHours(0, 0, 0, 0);
             if (lastCheckInDate.getTime() === yesterday.getTime()) {
                 newStreak = (userData.streak || 0) + 1;
             }
        }
        
        const bonus = Math.min(newStreak - 1, MAX_STREAK_BONUS) * STREAK_BONUS;
        const totalReward = BASE_REWARD + bonus;
        const newDiamondCount = userData.diamonds + totalReward;

        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                diamonds: newDiamondCount,
                last_check_in: new Date().toISOString(),
                streak: newStreak,
            })
            .eq('id', user.id);
            
        if (updateError) throw updateError;

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Điểm danh thành công! Bạn nhận được ${totalReward} kim cương.`,
                reward: totalReward,
                streak: newStreak,
                newDiamondCount: newDiamondCount,
            }),
        };

    } catch (error: any) {
        console.error("Check-in error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Lỗi máy chủ.' }) };
    }
};

export { handler };
