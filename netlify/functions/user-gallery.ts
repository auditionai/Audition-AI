import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Helper to calculate level, ensuring consistency with client-side logic.
const calculateLevelFromXp = (xp: number): number => {
    if (typeof xp !== 'number' || xp < 0) return 1;
    return Math.floor(xp / 100) + 1;
};

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

        // --- OPTIMIZATION: AVOID JOIN TO PREVENT DATABASE LOCKS ---
        // 1. Fetch user data once. This is a very fast query.
        const { data: creatorData, error: creatorError } = await supabaseAdmin
            .from('users')
            .select('display_name, photo_url, xp')
            .eq('id', user.id)
            .single();

        if (creatorError || !creatorData) {
            throw new Error(`Could not fetch creator profile: ${creatorError?.message}`);
        }

        // 2. Fetch the paginated images without joining the (potentially locked) users table.
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (imagesError) {
            throw new Error(`Database query failed for images: ${imagesError.message}`);
        }
        
        // 3. Combine the data in memory. This is much faster and safer than a JOIN in this context.
        const creatorInfo = {
            display_name: creatorData.display_name,
            photo_url: creatorData.photo_url,
            level: calculateLevelFromXp(creatorData.xp || 0),
        };

        const processedData = (images || []).map(image => ({
            ...image,
            creator: creatorInfo, // Attach the same creator info to every image
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({
                images: processedData,
            }),
        };

    } catch (error: any) {
        console.error("Error in user-gallery function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) };
    }
};

export { handler };