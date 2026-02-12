
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { sendSystemMessage } from './utils/chatUtils';

// Secret key to protect this endpoint (configure in Netlify env vars)
const CRON_SECRET = process.env.MIGRATION_SECRET; 

const handler: Handler = async (event: HandlerEvent) => {
    // Security Check
    const { secret } = event.queryStringParameters || {};
    if (!CRON_SECRET || secret !== CRON_SECRET) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden: Invalid secret.' }) };
    }

    console.log("--- [START] Weekly Reset & Rewards Cron Job ---");

    try {
        // 1. Find Top 3 Users by Weekly Points
        const { data: topUsers, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('id, display_name, weekly_points')
            .gt('weekly_points', 0) // Only reward if they have points
            .order('weekly_points', { ascending: false })
            .limit(3);

        if (fetchError) throw fetchError;

        if (topUsers && topUsers.length > 0) {
            console.log(`Found ${topUsers.length} winners.`);
            
            // Rewards config
            const rewards = [
                { rank: 1, diamonds: 100, title: 'Top 1 Tuần' },
                { rank: 2, diamonds: 50, title: 'Top 2 Tuần' },
                { rank: 3, diamonds: 30, title: 'Top 3 Tuần' }
            ];

            // 2. Distribute Rewards
            for (let i = 0; i < topUsers.length; i++) {
                const user = topUsers[i];
                const reward = rewards[i];
                
                // Add diamonds
                await supabaseAdmin.rpc('increment_user_diamonds', { 
                    user_id_param: user.id, 
                    diamond_amount: reward.diamonds 
                });

                // Log Reward
                await supabaseAdmin.from('weekly_rewards_log').insert({
                    user_id: user.id,
                    rank: reward.rank,
                    reward_desc: `${reward.diamonds} Kim Cương`,
                    week_start_date: new Date().toISOString()
                });

                // Send Message
                const msg = `🏆 CHÚC MỪNG! Bạn đã đạt Top ${reward.rank} Bảng Xếp Hạng Tuần với ${user.weekly_points} điểm! Phần thưởng: ${reward.diamonds} Kim Cương. Hãy tiếp tục tỏa sáng nhé!`;
                await sendSystemMessage(user.id, msg);
                
                console.log(`Rewarded User ${user.id} (Rank ${reward.rank})`);
            }
        } else {
            console.log("No users with points this week.");
        }

        // 3. Reset Weekly Points for ALL users
        const { error: resetError } = await supabaseAdmin
            .from('users')
            .update({ weekly_points: 0 })
            .neq('weekly_points', 0); // Only update rows that need reset

        if (resetError) throw resetError;

        console.log("--- [END] Weekly Points Reset Successfully ---");
        return { statusCode: 200, body: JSON.stringify({ message: "Weekly reset completed." }) };

    } catch (error: any) {
        console.error("Weekly reset failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
