import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // --- CORRECT TIMEZONE LOGIC ---
        // Calculate the start of the current day in Vietnam's timezone (UTC+7)
        // and convert it to a standard ISO string (in UTC) that Supabase can understand.
        const now = new Date();
        const year = now.toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
        const month = now.toLocaleDateString('en-CA', { month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        const day = now.toLocaleDateString('en-CA', { day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        
        // This creates a date object representing midnight in Vietnam on the current day,
        // then converts it to the equivalent UTC timestamp string.
        const startOfTodayInVietnam = new Date(`${year}-${month}-${day}T00:00:00+07:00`).toISOString();
        // --- END OF CORRECT TIMEZONE LOGIC ---

        const results = await Promise.all([
            // 1. Visits Today
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true })
                .gte('visited_at', startOfTodayInVietnam),

            // 2. Total Visits
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true }),

            // 3. New Users Today
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true })
               .gte('created_at', startOfTodayInVietnam),

            // 4. Total Users
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),

            // 5. Images Created Today
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