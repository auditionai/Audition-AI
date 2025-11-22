
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const POINTS_PER_POST = 20;

const calculateLevelFromXp = (xp: number): number => {
    return Math.floor((xp || 0) / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        const { imageUrl, caption } = JSON.parse(event.body || '{}');

        if (!imageUrl) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Image URL is required' }) };
        }

        // 1. Get current user stats
        const { data: currentUserData, error: userFetchError } = await supabaseAdmin
            .from('users')
            .select('weekly_points')
            .eq('id', user.id)
            .single();

        if (userFetchError) throw userFetchError;

        const newPoints = (currentUserData?.weekly_points || 0) + POINTS_PER_POST;

        // 2. Create Post
        // FIX: Removed 'level' from select query, fetch 'xp' instead and calculate level manually
        const { data: postData, error: postError } = await supabaseAdmin
            .from('posts')
            .insert({
                user_id: user.id,
                image_url: imageUrl,
                caption: caption
            })
            .select(`
                *,
                user:users (display_name, photo_url, xp, equipped_frame_id, equipped_title_id, equipped_name_effect_id)
            `)
            .single();

        if (postError) throw postError;

        // 3. Update Points
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({ weekly_points: newPoints })
            .eq('id', user.id);

        if (updateError) throw updateError;

        // 4. Transform user data to include 'level' for frontend compatibility
        const userData = Array.isArray(postData.user) ? postData.user[0] : postData.user;
        const processedPost = {
            ...postData,
            user: {
                ...userData,
                level: calculateLevelFromXp(userData?.xp || 0)
            }
        };

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                post: processedPost,
                newWeeklyPoints: newPoints,
                message: `Đăng bài thành công! +${POINTS_PER_POST} Điểm HOT`
            }),
        };

    } catch (error: any) {
        console.error("Create post failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
