import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

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
        const vietnamTimezone = 'Asia/Ho_Chi_Minh';
        const nowInVietnam = `(now() AT TIME ZONE '${vietnamTimezone}')`;
        const startOfTodayInVietnam = `date_trunc('day', ${nowInVietnam})`;

        const results = await Promise.all([
            // 1. Visits Today (in Vietnam Timezone)
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true })
                .gte('visited_at', startOfTodayInVietnam),

            // 2. Total Visits
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true }),

            // 3. New Users Today (in Vietnam Timezone)
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true })
               .gte('created_at', startOfTodayInVietnam),

            // 4. Total Users
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),

            // 5. Images Created Today (in Vietnam Timezone)
            supabaseAdmin.from('generated_images').select('*', { count: 'exact', head: true })
              .gte('created_at', startOfTodayInVietnam),
              
            // 6. Total Images
            supabaseAdmin.from('generated_images').select('*', { count: 'exact', head: true }),
        ]);

        const errors = results.map(res => res.error).filter(Boolean);
        if (errors.length > 0) {
             console.error("One or more dashboard queries failed:", errors);
             throw new Error("Database query failed while fetching dashboard stats.");
        }

        const [
            visitsTodayRes,
            totalVisitsRes,
            newUsersTodayRes,
            totalUsersRes,
            imagesTodayRes,
            totalImagesRes,
        ] = results;

        const stats = {
            visitsToday: visitsTodayRes.count ?? 0,
            totalVisits: totalVisitsRes.count ?? 0,
            newUsersToday: newUsersTodayRes.count ?? 0,
            totalUsers: totalUsersRes.count ?? 0,
            imagesToday: imagesTodayRes.count ?? 0,
            totalImages: totalImagesRes.count ?? 0,
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