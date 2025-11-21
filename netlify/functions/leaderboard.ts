
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Hàm tính cấp bậc từ XP
const calculateLevelFromXp = (xp: number): number => {
  if (typeof xp !== 'number' || xp < 0) return 1;
  return Math.floor(xp / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    try {
        const { type } = event.queryStringParameters || {};

        let users: any[] = [];

        // --- 1. HOT (Top Profile Points / Weekly Points) ---
        if (type === 'hot') {
            const { data, error } = await supabaseAdmin
                .from('users')
                .select('id, display_name, photo_url, xp, weekly_points, equipped_frame_id, equipped_title_id')
                .order('weekly_points', { ascending: false })
                .limit(50);
            
            if (error) throw error;
            users = data.map(u => ({ ...u, metric_value: u.weekly_points }));
        } 
        
        // --- 2. LEVEL (Top XP) ---
        else if (type === 'level') {
            const { data, error } = await supabaseAdmin
                .from('users')
                .select('id, display_name, photo_url, xp, equipped_frame_id, equipped_title_id')
                .order('xp', { ascending: false })
                .limit(50);

            if (error) throw error;
            users = data.map(u => ({ ...u, metric_value: u.xp }));
        }

        // --- 3. CREATION (Top Generated Images) ---
        // This requires aggregating counts. For performance in this demo, we'll fetch top users 
        // by a rough estimate or handle it via JS aggregation if table is small, 
        // OR use a dedicated RPC if possible. 
        // Workaround: Since we don't have a 'total_images' column on users, we might have to cheat slightly
        // or fetch all generated_images (slow).
        // Best robust approach for now without migration: Add a simple counter to users table or 
        // assume we can count via RPC. Let's try a known RPC approach or fallback to querying.
        else if (type === 'creation') {
             // Fallback: Since we don't have a 'creations_count' column on users, 
             // we will fetch users and their image count using a subquery or RPC.
             // Assuming get_leaderboard RPC (from previous code) does exactly this.
             const { data, error } = await supabaseAdmin.rpc('get_leaderboard');
             if (error) throw error;
             users = data.map((u: any) => ({
                 id: u.user_id,
                 display_name: u.display_name,
                 photo_url: u.photo_url,
                 xp: u.xp,
                 equipped_frame_id: u.equipped_frame_id,
                 equipped_title_id: u.equipped_title_id,
                 metric_value: Number(u.creations_count)
             }));
        }

        // --- 4. TYCOON (Top Spenders) ---
        // Based on diamond_transactions_log where amount < 0
        else if (type === 'tycoon') {
            // We need to sum negative amounts grouped by user.
            // Since we can't do complex aggregation easily with standard Supabase client on RLS,
            // we will try an RPC if exists, or use a Javascript aggregation on recent logs.
            // Strategy: Fetch heavy spenders from logs.
            
            const { data: logs, error } = await supabaseAdmin
                .from('diamond_transactions_log')
                .select('user_id, amount')
                .lt('amount', 0)
                .order('created_at', { ascending: false }) // Limit to recent activity to keep it fast
                .limit(2000);

            if (error) throw error;

            const spendingMap: Record<string, number> = {};
            logs.forEach((log: any) => {
                const spent = Math.abs(log.amount);
                spendingMap[log.user_id] = (spendingMap[log.user_id] || 0) + spent;
            });

            // Convert map to array and sort
            const sortedSpenders = Object.entries(spendingMap)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 50);

            const userIds = sortedSpenders.map(([id]) => id);
            
            if (userIds.length > 0) {
                const { data: userInfos } = await supabaseAdmin
                    .from('users')
                    .select('id, display_name, photo_url, xp, equipped_frame_id, equipped_title_id')
                    .in('id', userIds);
                
                const userInfoMap = new Map(userInfos?.map(u => [u.id, u]));

                users = sortedSpenders.map(([id, spent]) => {
                    const info = userInfoMap.get(id);
                    if (!info) return null;
                    return {
                        ...(info as any),
                        metric_value: spent
                    };
                }).filter(Boolean);
            }
        } 
        
        // Default to Level if type unknown
        else {
             const { data, error } = await supabaseAdmin
                .from('users')
                .select('id, display_name, photo_url, xp, equipped_frame_id, equipped_title_id')
                .order('xp', { ascending: false })
                .limit(50);
            if (error) throw error;
            users = data.map(u => ({ ...u, metric_value: u.xp }));
        }

        // --- FORMATTING RESPONSE ---
        const leaderboardData = users.map((user, index) => ({
            id: user.id,
            rank: index + 1,
            display_name: user.display_name,
            photo_url: user.photo_url,
            level: calculateLevelFromXp(user.xp),
            xp: user.xp,
            metric_value: user.metric_value, // Use this generic field for the specific leaderboard value
            equipped_title_id: user.equipped_title_id,
            equipped_frame_id: user.equipped_frame_id
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(leaderboardData),
        };
    } catch (error: any) {
        console.error("Leaderboard function error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

export { handler };
