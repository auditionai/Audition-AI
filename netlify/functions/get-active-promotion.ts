
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Function to check Active Promotion (Public)
const handler: Handler = async () => {
    const headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    };

    try {
        const now = new Date().toISOString();
        
        // Query logic: is_active = true AND start_time <= now AND end_time >= now
        const { data, error } = await supabaseAdmin
            .from('promotions')
            .select('*')
            .eq('is_active', true)
            .lte('start_time', now)
            .gte('end_time', now)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data || {}), // Return empty object if no active promo
        };
    } catch (error: any) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
