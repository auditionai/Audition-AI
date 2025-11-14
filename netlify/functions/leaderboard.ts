import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Hàm tính cấp bậc từ XP, đảm bảo logic đồng bộ với client
const calculateLevelFromXp = (xp: number): number => {
  if (typeof xp !== 'number' || xp < 0) return 1;
  return Math.floor(xp / 100) + 1;
};

const handler: Handler = async () => {
    try {
        // --- TỐI ƯU HÓA TRIỆT ĐỂ ---
        // 1. Sử dụng một RPC function (hoặc query trực tiếp) để database tự đếm và sắp xếp.
        // Điều này hiệu quả hơn rất nhiều so với việc tải toàn bộ bảng về để xử lý.
        const { data: topUsers, error: rpcError } = await supabaseAdmin.rpc('get_top_creators', { limit_count: 10 });

        if (rpcError) {
            // Nếu RPC chưa được tạo, chạy query dự phòng (vẫn tối ưu hơn)
            if (rpcError.code === '42883') {
                console.warn("RPC function 'get_top_creators' not found. Falling back to direct query.");
                
                // FIX: Refactored the convoluted promise chain into a more readable async/await flow.
                // This resolves the error where the code was trying to destructure 'data' and 'error' from an array.
                const { data: imagesData, error: imagesError } = await supabaseAdmin
                    .from('generated_images')
                    .select('user_id')
                    .limit(10000); // A reasonable limit to avoid function timeouts.

                if (imagesError) throw imagesError;

                const counts = (imagesData || []).reduce((acc, { user_id }) => {
                    if (user_id) {
                        acc[user_id] = (acc[user_id] || 0) + 1;
                    }
                    return acc;
                }, {} as Record<string, number>);

                const sortedUserIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 10);
                
                const { data: directQueryUsers, error: directQueryError } = await supabaseAdmin
                    .from('users')
                    .select('id, display_name, photo_url, xp')
                    .in('id', sortedUserIds);
                
                if (directQueryError) throw directQueryError;

                const combinedUsers = (directQueryUsers || [])
                    .map(u => ({ ...u, creations_count: counts[u.id] }))
                    .sort((a, b) => b.creations_count - a.creations_count);

                const leaderboard = combinedUsers.map((user, index) => ({
                    ...user,
                    rank: index + 1,
                    level: calculateLevelFromXp(user.xp),
                }));
                 return { statusCode: 200, body: JSON.stringify(leaderboard) };
            }
            throw rpcError;
        }

        // 2. Nếu RPC thành công, xử lý dữ liệu trả về
        const leaderboardData = (topUsers || []).map((user, index) => ({
            id: user.user_id,
            rank: index + 1,
            display_name: user.display_name,
            photo_url: user.photo_url,
            level: calculateLevelFromXp(user.xp),
            xp: user.xp,
            creations_count: user.creations_count,
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