import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

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

        // 1. Authenticate the user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };
        }

        // 2. Fetch ONLY the user's generated images. This is the most critical data.
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (imagesError) {
            throw new Error(`Database error fetching images: ${imagesError.message}`);
        }
        
        // 3. Create a creator object using GUARANTEED available data from the auth token.
        // This avoids querying the 'users' table, which was the source of the 500 errors.
        const creatorInfo = {
            display_name: user.user_metadata?.full_name || 'Bạn',
            photo_url: user.user_metadata?.avatar_url || 'https://i.pravatar.cc/150',
            level: 1, // Using a default level is acceptable to ensure the gallery loads.
        };

        // 4. Combine images with the reliable creator info.
        const processedData = (images || []).map(image => ({
            ...image,
            creator: creatorInfo,
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(processedData),
        };

    } catch (error: any) {
        console.error("Fatal error in user-gallery function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) };
    }
};

export { handler };
