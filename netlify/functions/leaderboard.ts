import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Hàm tính cấp bậc từ XP, đảm bảo logic đồng bộ với client
const calculateLevelFromXp = (xp: number): number => {
  if (typeof xp !== 'number' || xp < 0) return 1;
  return Math.floor(xp / 100) + 1;
};

const handler: Handler = async () => {
    try {
        // TỐI ƯU HÓA: Gọi một hàm RPC duy nhất để database tự thực hiện
        // tất cả các công việc nặng nhọc: đếm, nhóm, sắp xếp và kết nối bảng.
        const { data: topUsers, error: rpcError } = await supabaseAdmin.rpc('get_leaderboard');

        if (rpcError) {
            // If the RPC fails, it is a critical error (e.g., function not created).
            // Guide the developer on how to fix it in the error message.
            throw new Error(`Database RPC error: ${rpcError.message}. Please ensure the 'get_leaderboard' function exists in your Supabase SQL Editor.`);
        }

        // Dữ liệu trả về từ RPC đã được xử lý sẵn.
        // Chỉ cần định dạng lại một chút cho client.
        const leaderboardData = (topUsers || []).map((user, index) => ({
            id: user.user_id,
            rank: index + 1,
            display_name: user.display_name,
            photo_url: user.photo_url,
            level: calculateLevelFromXp(user.xp),
            xp: user.xp,
            creations_count: Number(user.creations_count), // Đảm bảo kiểu dữ liệu là number
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