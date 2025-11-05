import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

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
        const { data: counts, error: countsError } = await supabaseAdmin
            .from('generated_images')
            .select('user_id', { count: 'exact' })
            .in('user_id', userIds)
            .groupBy('user_id');

        if (countsError) throw countsError;

        // Map số lượng ảnh vào cho từng người dùng
        const countMap = new Map(counts.map(c => [c.user_id, c.count]));

        const leaderboard = users.map((user, index) => ({
            ...user,
            rank: index + 1,
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
