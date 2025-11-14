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

        const page = parseInt(event.queryStringParameters?.page || '1', 10);
        const from = (page - 1) * IMAGES_PER_PAGE;
        const to = from + IMAGES_PER_PAGE - 1;

        // --- THE ULTIMATE OPTIMIZATION: ONLY FETCH IMAGES ---
        // The client already has the user's data. We avoid touching the 'users' table entirely
        // to prevent any possibility of a row lock from the XP update function causing a timeout.
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

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