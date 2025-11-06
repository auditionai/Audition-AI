import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const calculateLevelFromXp = (xp: number): number => {
    if (typeof xp !== 'number' || xp < 0) return 1;
    return Math.floor(xp / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    try {
        if (event.httpMethod !== 'GET') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }

        const authHeader = event.headers['authorization'];
        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };
        }

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }

        // Step 1: Fetch images for the user without the join
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (imagesError) {
            throw imagesError;
        }

        if (!images || images.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // Step 2: Fetch the user's profile info once
        const { data: creatorProfile, error: creatorError } = await supabaseAdmin
            .from('users')
            .select('display_name, photo_url, xp')
            .eq('id', user.id)
            .single();

        if (creatorError) {
            console.error('Could not fetch creator profile for gallery:', creatorError);
            // Even if profile fails, we can return images with a default creator
            const fallbackData = images.map(image => ({
                ...image,
                creator: { display_name: 'Bạn', photo_url: '', level: 1 }
            }));
            return { statusCode: 200, body: JSON.stringify(fallbackData) };
        }
        
        // Step 3: Combine the data
        const creatorInfo = {
            display_name: creatorProfile.display_name,
            photo_url: creatorProfile.photo_url,
            level: calculateLevelFromXp(creatorProfile.xp || 0)
        };

        const processedData = images.map(image => ({
            ...image,
            creator: creatorInfo
        }));


        return {
            statusCode: 200,
            body: JSON.stringify(processedData),
        };
    } catch (error: any) {
        console.error("Error in user-gallery function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };