import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const CHECK_IN_REWARD = 5; // 5 diamonds per check-in

// Helper to get date in a specific timezone (e.g., Vietnam)
const getTodayDateString = () => {
    const today = new Date();
    // Use a timezone that aligns with your user base to prevent day rollover issues
    return new Date(today.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })).toISOString().split('T')[0];
};


const handler: Handler = async (event: HandlerEvent) => {
    // 1. Authenticate user
    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const todayString = getTodayDateString();

    try {
        // GET request is for checking status without performing a check-in
        if (event.httpMethod === 'GET') {
             const { data, error } = await supabaseAdmin
                .from('daily_check_ins')
                .select('id')
                .eq('user_id', user.id)
                .eq('check_in_date', todayString)
                .maybeSingle();

            if (error) throw error;
            return { statusCode: 200, body: JSON.stringify({ hasCheckedInToday: !!data }) };
        }

        // POST request performs the check-in
        if (event.httpMethod === 'POST') {
            const { data, error } = await supabaseAdmin.rpc('perform_daily_check_in', {
                p_user_id: user.id,
                p_check_in_date: todayString,
                p_reward_amount: CHECK_IN_REWARD
            });
            
            if (error) {
                // Check for the specific error message from the RPC function
                if (error.message.includes('User has already checked in today')) {
                     return { statusCode: 409, body: JSON.stringify({ error: 'Bạn đã điểm danh hôm nay rồi.' }) };
                }
                throw error; // Throw other errors
            }

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Check-in successful!',
                    reward: { diamonds: CHECK_IN_REWARD },
                    streak: data.streak,
                    newDiamondCount: data.new_diamond_count,
                    checkInDate: todayString,
                }),
            };
        }
        
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    } catch (error: any) {
        console.error("Daily check-in failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
