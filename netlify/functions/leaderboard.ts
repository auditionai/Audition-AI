
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Hàm tính cấp bậc từ XP, đảm bảo logic đồng bộ với client
const calculateLevelFromXp = (xp: number): number => {
  if (typeof xp !== 'number' || xp < 0) return 1;
  return Math.floor(xp / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    try {
        const { type } = event.queryStringParameters || {};

        // --- WEEKLY HOT LEADERBOARD (Based on weekly_points) ---
        if (type === 'weekly') {
            const { data: topUsers, error } = await supabaseAdmin
                .from('users')
                .select('id, display_name, photo_url, xp, weekly_points, equipped_frame_id, equipped_title_id')
                .order('weekly_points', { ascending: false })
                .limit(50);

            if (error) throw error;

            // Đếm số lượng tác phẩm (creations_count) cho mỗi user để hiển thị
            // Lưu ý: Trong thực tế nên cache hoặc denormalize field này nếu data lớn.
            const usersWithStats = await Promise.all(topUsers.map(async (user, index) => {
                const { count } = await supabaseAdmin
                    .from('generated_images')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id);

                return {
                    id: user.id,
                    rank: index + 1,
                    display_name: user.display_name,
                    photo_url: user.photo_url,
                    level: calculateLevelFromXp(user.xp),
                    xp: user.xp,
                    weekly_points: user.weekly_points || 0, // Field quan trọng cho tab này
                    creations_count: count || 0,
                    equipped_title_id: user.equipped_title_id,
                    equipped_frame_id: user.equipped_frame_id
                };
            }));

            return {
                statusCode: 200,
                body: JSON.stringify(usersWithStats),
            };
        }

        // --- DEFAULT LEVEL LEADERBOARD (Existing Logic) ---
        const { data: topUsers, error: rpcError } = await supabaseAdmin.rpc('get_leaderboard');

        if (rpcError) {
            throw new Error(`Database RPC error: ${rpcError.message}`);
        }

        const leaderboardData = (topUsers || []).map((user, index) => ({
            id: user.user_id,
            rank: index + 1,
            display_name: user.display_name,
            photo_url: user.photo_url,
            level: calculateLevelFromXp(user.xp),
            xp: user.xp,
            creations_count: Number(user.creations_count),
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
