import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// Helper to calculate level, ensuring consistency with client-side logic.
const calculateLevelFromXp = (xp: number): number => {
    if (typeof xp !== 'number' || xp < 0) return 1;
    return Math.floor(xp / 100) + 1;
};

const IMAGES_PER_PAGE = 20; // Define a limit for pagination

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

        // --- PAGINATION LOGIC ---
        const page = parseInt(event.queryStringParameters?.page || '1', 10);
        const from = (page - 1) * IMAGES_PER_PAGE;
        const to = from + IMAGES_PER_PAGE - 1;
        // --- END PAGINATION LOGIC ---

        // 2. Fetch user's images and their profile in parallel for efficiency.
        // We remove the `count` operation to prevent timeouts on large user galleries.
        const [imagesResponse, userProfileResponse] = await Promise.all([
            supabaseAdmin
                .from('generated_images')
                .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .range(from, to),
            supabaseAdmin
                .from('users')
                .select('display_name, photo_url, xp')
                .eq('id', user.id)
                .single()
        ]);

        const { data: images, error: imagesError } = imagesResponse;
        const { data: userProfile, error: userProfileError } = userProfileResponse;
        
        if (imagesError) {
            throw new Error(`Database query failed for images: ${imagesError.message}`);
        }
        if (userProfileError) {
            console.error(`Could not fetch user profile for ${user.id}:`, userProfileError);
            throw new Error(`Database query failed for user profile: ${userProfileError.message}`);
        }
        
        // 3. Create a reliable creator object from the fetched profile.
        const creatorInfo = {
            display_name: userProfile.display_name,
            photo_url: userProfile.photo_url,
            level: calculateLevelFromXp(userProfile.xp || 0),
        };

        // 4. Combine each image with the same creator info.
        const processedData = (images || []).map(image => ({
            ...image,
            creator: creatorInfo,
        }));

        // The response body now only contains the images array. The client will infer if there are more pages.
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