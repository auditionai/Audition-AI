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

        // 2. Fetch the user's generated images
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (imagesError) {
            console.error("Error fetching user images:", imagesError.message);
            throw new Error(`Database query for images failed: ${imagesError.message}`);
        }

        if (!images || images.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }
        
        // 3. Create the most robust creator info possible.
        // Try to fetch the detailed profile first, but have a strong fallback.
        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('xp, display_name, photo_url')
            .eq('id', user.id)
            .single();

        let creatorInfo;
        // If the profile query fails for any reason (e.g., missing profile, network issue),
        // we create a fallback using the guaranteed auth data. This prevents a 500 error.
        if (profileError || !userProfile) {
            console.warn(`Could not fetch profile for user ${user.id}, using fallback. Error: ${profileError?.message}`);
            creatorInfo = {
                display_name: user.user_metadata?.full_name || 'Bạn',
                photo_url: user.user_metadata?.avatar_url || 'https://i.pravatar.cc/150',
                level: 1, // Default level as we can't get XP
            };
        } else {
            // If profile is found, use its data to calculate the correct level.
             const calculateLevelFromXp = (xp: number): number => {
                if (typeof xp !== 'number' || xp < 0) return 1;
                return Math.floor(xp / 100) + 1;
            };
            creatorInfo = {
                display_name: userProfile.display_name,
                photo_url: userProfile.photo_url,
                level: calculateLevelFromXp(userProfile.xp || 0),
            };
        }
        
        // 4. Combine images with the creator info.
        const processedData = images.map(image => ({
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
