import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Helper to get start and end of day in UTC, corresponding to Vietnam's timezone (UTC+7)
const getVnDayUtcRange = () => {
    const now = new Date();
    // Create a date object representing current time in Vietnam
    const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    
    // Start of day in Vietnam
    const startOfDayVn = new Date(vnTime);
    startOfDayVn.setHours(0, 0, 0, 0);

    // End of day in Vietnam
    const endOfDayVn = new Date(vnTime);
    endOfDayVn.setHours(23, 59, 59, 999);

    // Convert back to UTC ISO strings for Supabase query
    return {
        start: startOfDayVn.toISOString(),
        end: endOfDayVn.toISOString()
    };
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
        const { start, end } = getVnDayUtcRange();

        const [
            // Visits
            { count: visitsToday, error: visitsTodayError },
            { count: totalVisits, error: totalVisitsError },
            // Users
            { count: newUsersToday, error: newUsersError },
            { count: totalUsers, error: totalUsersError },
            // Images
            { count: imagesToday, error: imagesTodayError },
            { count: totalImages, error: totalImagesError },
        ] = await Promise.all([
            // 1. Visits Today
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true }).gte('visited_at', start).lte('visited_at', end),
            // 2. Total Visits
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true }),
            // 3. New Users Today
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
            // 4. Total Users
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
            // 5. Images Created Today
            supabaseAdmin.from('generated_images').select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
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