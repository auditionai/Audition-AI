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
        // Fix: The original query with `.groupBy()` is not supported as written, as the method cannot be chained after `.in()`.
        // This is replaced with a query to fetch all relevant images and then count them in code.
        // This approach is acceptable for a small number of users (top 10).
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
