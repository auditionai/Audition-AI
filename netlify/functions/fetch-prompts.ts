import type { Handler, HandlerEvent } from "@netlify/functions";
import { createClient } from '@supabase/supabase-js';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const { category = 'all', page = '1', limit = '20' } = event.queryStringParameters || {};
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    try {
        const supabaseUrl = process.env.CAULENHAU_SUPABASE_URL;
        const supabaseAnonKey = process.env.CAULENHAU_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error("caulenhau.io.vn integration is not configured.");
        }
        
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        let query = supabase
            .from('prompts') // Assuming the table is named 'prompts'
            .select('image_url, prompt') // Assuming columns are 'image_url' and 'prompt'
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNum - 1);

        if (category && category !== 'all') {
            query = query.eq('category_slug', category); // Assuming a 'category_slug' column
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch from caulenhau DB: ${error.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(data || []),
        };

    } catch (error: any) {
        console.error("fetch-prompts function error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An internal server error occurred.' }),
        };
    }
};

export { handler };