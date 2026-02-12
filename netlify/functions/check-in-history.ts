import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const { year, month } = event.queryStringParameters || {};
    if (!year || !month) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Year and month are required.' }) };
    }

    try {
        const numericYear = parseInt(year, 10);
        const numericMonth = parseInt(month, 10);

        // Construct date range for the query
        const startDate = `${numericYear}-${String(numericMonth).padStart(2, '0')}-01`;
        const endDate = new Date(numericYear, numericMonth, 0).toISOString().split('T')[0];

        const { data, error } = await supabaseAdmin
            .from('daily_check_ins')
            .select('check_in_date')
            .eq('user_id', user.id)
            .gte('check_in_date', startDate)
            .lte('check_in_date', endDate);

        if (error) throw error;
        
        // Return just an array of date strings
        const dates = data.map(record => record.check_in_date);

        return {
            statusCode: 200,
            body: JSON.stringify(dates),
        };
    } catch (error: any) {
        console.error("Failed to fetch check-in history:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };