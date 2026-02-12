
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // --- CORRECT TIMEZONE LOGIC ---
        const now = new Date();
        const year = now.toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
        const month = now.toLocaleDateString('en-CA', { month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        const day = now.toLocaleDateString('en-CA', { day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        const startOfTodayInVietnam = new Date(`${year}-${month}-${day}T00:00:00+07:00`).toISOString();

        // 1. Basic Counters
        const basicResults = await Promise.all([
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true }).gte('visited_at', startOfTodayInVietnam),
            supabaseAdmin.from('daily_visits').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', startOfTodayInVietnam),
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('generated_images').select('*', { count: 'exact', head: true }).gte('created_at', startOfTodayInVietnam),
            supabaseAdmin.from('generated_images').select('*', { count: 'exact', head: true }),
            // NEW: Get Total API Key Usage as the Source of Truth
            supabaseAdmin.from('api_keys').select('usage_count').eq('status', 'active')
        ]);

        const [
            visitsTodayRes, totalVisitsRes, newUsersTodayRes, totalUsersRes, imagesTodayRes, totalImagesRes, apiKeyRes
        ] = basicResults;

        // Calculate total real usage from API Keys
        const totalRealUsage = (apiKeyRes.data || []).reduce((sum, key) => sum + key.usage_count, 0);

        // 2. Detailed Usage Statistics
        // Fetch logs to categorize. Increased limit to capture more recent detailed history.
        const { data: usageLogs, error: usageError } = await supabaseAdmin
            .from('diamond_transactions_log')
            .select('amount, description')
            .lt('amount', 0)
            .order('created_at', { ascending: false })
            .limit(10000); // Increased limit

        if (usageError) throw usageError;

        // Initialize stats container
        const detailedStats: Record<string, { flashCount: number; proCount: number; totalDiamonds: number }> = {
            'Single Image': { flashCount: 0, proCount: 0, totalDiamonds: 0 },
            'Group Image': { flashCount: 0, proCount: 0, totalDiamonds: 0 },
            'Face Lock': { flashCount: 0, proCount: 0, totalDiamonds: 0 },
            'Bg Removal': { flashCount: 0, proCount: 0, totalDiamonds: 0 },
            'Signature': { flashCount: 0, proCount: 0, totalDiamonds: 0 },
            'Other': { flashCount: 0, proCount: 0, totalDiamonds: 0 },
        };

        let trackedLogTotal = 0;

        // Categorize fetched logs
        usageLogs?.forEach(log => {
            const desc = log.description || '';
            const cost = Math.abs(log.amount);
            const isPro = desc.includes('Pro') || cost >= 10; 
            
            let category = 'Other';
            if (desc.includes('Tạo ảnh nhóm')) category = 'Group Image';
            else if (desc.includes('Tạo ảnh')) category = 'Single Image';
            else if (desc.includes('Xử lý Gương Mặt')) category = 'Face Lock';
            else if (desc.includes('Tách nền')) category = 'Bg Removal';
            else if (desc.includes('Chèn chữ ký')) category = 'Signature';

            // Increment category stats
            detailedStats[category].totalDiamonds += cost;
            trackedLogTotal += cost;

            if (isPro) detailedStats[category].proCount += 1;
            else detailedStats[category].flashCount += 1;
        });

        // 3. Reconcile / Balance the Books
        // Calculate the discrepancy between Total API Usage and what we found in the logs
        // If TotalRealUsage > TrackedLogTotal, implies older logs were truncated or lost.
        // As requested: dump this difference into 'Single Image' (Flash).
        const discrepancy = totalRealUsage - trackedLogTotal;

        if (discrepancy > 0) {
            // Assuming Flash cost is 1 diamond per usage
            detailedStats['Single Image'].flashCount += discrepancy;
            detailedStats['Single Image'].totalDiamonds += discrepancy;
        }

        const stats = {
            visitsToday: visitsTodayRes.count ?? 0,
            totalVisits: totalVisitsRes.count ?? 0,
            newUsersToday: newUsersTodayRes.count ?? 0,
            totalUsers: totalUsersRes.count ?? 0,
            imagesToday: imagesTodayRes.count ?? 0,
            totalImages: totalImagesRes.count ?? 0,
            detailedUsage: detailedStats
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
