import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Hàm tính cấp bậc từ XP, đảm bảo logic đồng bộ với client
const calculateLevelFromXp = (xp: number): number => {
  if (typeof xp !== 'number' || xp < 0) return 1;
  return Math.floor(xp / 100) + 1;
};

const handler: Handler = async () => {
    try {
        // Lấy top 10 người dùng có XP cao nhất
        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, display_name, photo_url, xp')
            .order('xp', { ascending: false })
            .limit(10);

        if (usersError) throw usersError;

        // Lấy số lượng ảnh đã tạo cho những người dùng này
        const userIds = users.map(u => u.id);
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('user_id')
            .in('user_id', userIds);

        if (imagesError) throw imagesError;

        // Map số lượng ảnh vào cho từng người dùng
        const countMap = (images || []).reduce((acc, image) => {
            acc.set(image.user_id, (acc.get(image.user_id) || 0) + 1);
            return acc;
        }, new Map<string, number>());

        const leaderboard = users.map((user, index) => ({
            ...user,
            rank: index + 1,
            // Sửa lỗi: Tính toán và thêm cấp bậc (level) vào dữ liệu trả về
            level: calculateLevelFromXp(user.xp),
            creations_count: countMap.get(user.id) || 0,
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(leaderboard),
        };
    } catch (error: any) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

export { handler };