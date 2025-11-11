import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Hàm tính cấp bậc từ XP, đảm bảo logic đồng bộ với client
const calculateLevelFromXp = (xp: number): number => {
  if (typeof xp !== 'number' || xp < 0) return 1;
  return Math.floor(xp / 100) + 1;
};

const handler: Handler = async () => {
    try {
        // 1. Get all image records to count creations per user.
        // For performance on very large tables, an RPC function would be better,
        // but this approach works well without database modifications.
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('user_id');

        if (imagesError) throw imagesError;

        // 2. Count creations for each user in memory.
        const countMap = (images || []).reduce((acc, image) => {
            acc.set(image.user_id, (acc.get(image.user_id) || 0) + 1);
            return acc;
        }, new Map<string, number>());
        
        // 3. Sort users by creation count and get the top 10 user IDs.
        const sortedUserIds = Array.from(countMap.entries())
            .sort((a, b) => b[1] - a[1]) // Sort descending by count
            .slice(0, 10) // Limit to top 10
            .map(entry => entry[0]); // Get just the user IDs

        // Handle case where there are no images created yet.
        if (sortedUserIds.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify([]),
            };
        }

        // 4. Fetch the profiles for the top 10 users.
        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, display_name, photo_url, xp')
            .in('id', sortedUserIds);

        if (usersError) throw usersError;

        // 5. Combine user data with creation counts and re-sort to ensure correct order.
        const leaderboardData = users
            .map(user => ({
                ...user,
                creations_count: countMap.get(user.id) || 0,
            }))
            .sort((a, b) => b.creations_count - a.creations_count);

        // 6. Assign final rank and calculate level.
        const leaderboard = leaderboardData.map((user, index) => ({
            ...user,
            rank: index + 1,
            level: calculateLevelFromXp(user.xp),
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