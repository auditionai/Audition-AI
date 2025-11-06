import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Helper function to calculate level from XP, consistent with client-side logic
const calculateLevelFromXp = (xp: number): number => {
    if (typeof xp !== 'number' || xp < 0) return 1;
    return Math.floor(xp / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    try {
        // 1. Authenticate the user
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

        // 2. Fetch the user's generated images
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (imagesError) {
            console.error("Error fetching user images:", imagesError);
            throw new Error(`Database query for images failed: ${imagesError.message}`);
        }

        if (!images || images.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // 3. Fetch the user's profile from the public `users` table
        const { data: creatorProfile, error: creatorError } = await supabaseAdmin
            .from('users')
            .select('display_name, photo_url, xp')
            .eq('id', user.id)
            .single();

        if (creatorError) {
            // Log the database error for debugging but don't stop execution.
            console.error('Could not fetch creator profile for gallery. DB Error:', creatorError.message);
        }
        
        // 4. Robustly handle cases where the profile is missing (either due to error or data inconsistency)
        if (!creatorProfile) {
            console.warn(`User profile not found for ID ${user.id}. Creating fallback data to prevent a 500 error.`);
            // Create a fallback creator object to ensure the frontend still receives valid data.
            const fallbackCreator = {
                display_name: 'Bạn',
                photo_url: user.user_metadata?.avatar_url || 'https://i.pravatar.cc/150', // Use auth avatar if available
                level: 1, // Default level
            };
            const fallbackData = images.map(image => ({
                ...image,
                creator: fallbackCreator,
            }));
            return { statusCode: 200, body: JSON.stringify(fallbackData) };
        }
        
        // 5. If profile exists, combine the data
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
        // Catch-all for any other unexpected errors
        console.error("Fatal error in user-gallery function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) };
    }
};

export { handler };
