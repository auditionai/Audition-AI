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
        // We will perform all timezone conversions directly in the database
        // using PostgreSQL's `AT TIME ZONE` capabilities for accuracy.
        const vietnamTimezone = 'Asia/Ho_Chi_Minh';

        const [
            { count: visitsToday, error: visitsTodayError },
            { count: totalVisits, error: totalVisitsError },
            { count: newUsersToday, error: newUsersError },
            { count: totalUsers, error: totalUsersError },
            { count: imagesToday, error: imagesTodayError },
            { count: totalImages, error: totalImagesError },
        ] = await Promise.all([
            // 1. Visits Today (in Vietnam Timezone)
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true })
                .filter('visited_at', 'gte', `(now() AT TIME ZONE '${vietnamTimezone}') - interval '1 day' * (EXTRACT(hour FROM now() AT TIME ZONE '${vietnamTimezone}') / 24)`)
                .filter('visited_at', 'lt', `(now() AT TIME ZONE '${vietnamTimezone}') + interval '1 day' * (1 - EXTRACT(hour FROM now() AT TIME ZONE '${vietnamTimezone}') / 24)`),

            // 2. Total Visits
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true }),

            // 3. New Users Today (in Vietnam Timezone)
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true })
               .filter('created_at', 'gte', `(now() AT TIME ZONE '${vietnamTimezone}') - interval '1 day' * (EXTRACT(hour FROM now() AT TIME ZONE '${vietnamTimezone}') / 24)`)
               .filter('created_at', 'lt', `(now() AT TIME ZONE '${vietnamTimezone}') + interval '1 day' * (1 - EXTRACT(hour FROM now() AT TIME ZONE '${vietnamTimezone}') / 24)`),

            // 4. Total Users
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),

            // 5. Images Created Today (in Vietnam Timezone)
            supabaseAdmin.from('generated_images').select('*', { count: 'exact', head: true })
              .filter('created_at', 'gte', `(now() AT TIME ZONE '${vietnamTimezone}') - interval '1 day' * (EXTRACT(hour FROM now() AT TIME ZONE '${vietnamTimezone}') / 24)`)
              .filter('created_at', 'lt', `(now() AT TIME ZONE '${vietnamTimezone}') + interval '1 day' * (1 - EXTRACT(hour FROM now() AT TIME ZONE '${vietnamTimezone}') / 24)`),
              
            // 6. Total Images
            supabaseAdmin.from('generated_images').select('*', { count: 'exact', head: true }),
        ]);

        const errors = [visitsTodayError, totalVisitsError, newUsersError, totalUsersError, imagesTodayError, totalImagesError].filter(Boolean);
        if (errors.length > 0) {
             console.error("One or more dashboard queries failed:", errors);
             throw new Error("Database query failed while fetching dashboard stats.");
        }

        const stats = {
            visitsToday: visitsToday ?? 0,
            totalVisits: totalVisits ?? 0,
            newUsersToday: newUsersToday ?? 0,
            totalUsers: totalUsers ?? 0,
            imagesToday: imagesToday ?? 0,
            totalImages: totalImages ?? 0,
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
