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

        // OPTIMIZATION: Use a single query with a JOIN to fetch images and creator data together.
        // This is much more efficient than the previous Promise.all approach and prevents timeouts.
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select(`
                id,
                user_id,
                prompt,
                image_url,
                model_used,
                created_at,
                is_public,
                creator:users (
                    display_name,
                    photo_url,
                    xp
                )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (imagesError) {
            throw new Error(`Database query failed for images: ${imagesError.message}`);
        }
        
        // Process the data to calculate the level for the creator.
        const processedData = (images || []).map(image => {
            // FIX: Supabase might return an array for a joined table. Safely handle both object and array cases.
            const creatorData = Array.isArray(image.creator) ? image.creator[0] : image.creator;

            if (!creatorData) {
                // This case is unlikely but handled for safety.
                return {
                    ...image,
                    creator: {
                        display_name: 'Vô danh',
                        photo_url: '',
                        level: 1,
                    }
                }
            }
            
            return {
                ...image,
                creator: {
                    display_name: creatorData.display_name,
                    photo_url: creatorData.photo_url,
                    level: calculateLevelFromXp(creatorData.xp || 0),
                }
            };
        });

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