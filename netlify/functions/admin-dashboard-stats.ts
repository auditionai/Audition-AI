import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const getVNDateString = (date: Date) => {
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Admin Authentication
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    
    const token = authHeader.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const today = new Date();
        const todayStart = new Date(today);
        todayStart.setUTCHours(0, 0, 0, 0);
        
        // Convert to Vietnam time for querying
        const todayVnString = getVNDateString(today);

        const [
            { count: totalUsers, error: totalUsersError },
            { count: newUsersToday, error: newUsersError },
            { count: totalImages, error: totalImagesError },
            { count: dailyActiveUsers, error: dauError },
        ] = await Promise.all([
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
            supabaseAdmin.from('generated_images').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('daily_active_users').select('*', { count: 'exact', head: true }).eq('activity_date', todayVnString),
        ]);

        if (totalUsersError || newUsersError || totalImagesError || dauError) {
             console.error({ totalUsersError, newUsersError, totalImagesError, dauError });
             throw new Error("One or more database queries failed.");
        }

        const stats = {
            totalUsers: totalUsers ?? 0,
            newUsersToday: newUsersToday ?? 0,
            totalImages: totalImages ?? 0,
            dailyActiveUsers: dailyActiveUsers ?? 0,
        };

        return {
            statusCode: 200,
            body: JSON.stringify(stats),
        };

    } catch (error: any) {
        console.error("Error fetching dashboard stats:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
