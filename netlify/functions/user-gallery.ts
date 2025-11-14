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

        // --- REVERT TO OFFSET-BASED PAGINATION ---
        // The cursor-based method caused severe timeouts, likely due to a missing index.
        // Reverting to offset pagination is safer and prevents system-wide hangs.
        const page = event.queryStringParameters?.page ? parseInt(event.queryStringParameters.page, 10) : 1;
        const from = (page - 1) * IMAGES_PER_PAGE;
        const to = from + IMAGES_PER_PAGE - 1;

        let query = supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

        const { data: images, error: imagesError } = await query;

        if (imagesError) {
            throw new Error(`Database query failed for images: ${imagesError.message}`);
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                images: images || [], // Return just the images, client will add creator info
            }),
        };

    } catch (error: any) {
        console.error("Error in user-gallery function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) };
    }
};

export { handler };