import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const IMAGES_PER_PAGE = 20;

const handler: Handler = async (event: HandlerEvent) => {
    try {
        if (event.httpMethod !== 'GET') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }

        const authHeader = event.headers['authorization'];
        const token = authHeader?.split(' ')[1];
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Token is missing.' }) };
        }

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };
        }

        // --- CURSOR-BASED PAGINATION ---
        // This is a "smarter" and more scalable approach than offset-based pagination.
        // It avoids slow database queries for users with many images.
        const cursor = event.queryStringParameters?.cursor;

        let query = supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(IMAGES_PER_PAGE);
        
        // If a cursor is provided, fetch images older than the cursor
        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data: images, error: imagesError } = await query;

        if (imagesError) {
            throw new Error(`Database query failed for images: ${imagesError.message}`);
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                images: images || [],
            }),
        };

    } catch (error: any) {
        console.error("Error in user-gallery function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) };
    }
};

export { handler };