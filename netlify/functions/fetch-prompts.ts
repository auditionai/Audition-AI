import type { Handler, HandlerEvent } from "@netlify/functions";
import { createClient } from '@supabase/supabase-js';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const { category, page = '1', limit = '20' } = event.queryStringParameters || {};
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

        // Map front-end category names to back-end category IDs from your schema
        const categoryMap: { [key: string]: number } = {
            'single-photo': 2, // Corresponds to 'Ảnh Nam Nữ'
            'couple-photo': 3, // Corresponds to 'Ảnh Couple'
            'group-photo': 4,  // Corresponds to 'Ảnh Nhóm'
        };
        
        const categoryId = category ? categoryMap[category] : null;
        
        // Build the query
        let query = supabase
            .from('images') // Correct table name
            .select(`
                image_url,
                prompt,
                image_categories!inner(category_id)
            `) // Use !inner to join and allow filtering
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNum - 1);

        // Apply category filter if a valid category is provided
        if (categoryId) {
            query = query.eq('image_categories.category_id', categoryId);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch from caulenhau DB: ${error.message}`);
        }
        
        // The data includes the joined table, but the frontend only needs image_url and prompt,
        // so no transformation is needed here.
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