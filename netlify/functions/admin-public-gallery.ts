
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const calculateLevelFromXp = (xp: number): number => {
    if (typeof xp !== 'number' || xp < 0) return 1;
    return Math.floor(xp / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Admin Authentication
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    
    const token = authHeader.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

    // FIX: Use Supabase v2 `auth.getUser`
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    
    // 2. Fetch all public images
    try {
        // Step 1: Fetch Images (No JOIN to avoid errors)
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, created_at, is_public')
            .eq('is_public', true)
            .not('image_url', 'is', null)
            .order('created_at', { ascending: false });

        if (imagesError) throw imagesError;

        if (!images || images.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // Step 2: Fetch Creators
        const userIds = [...new Set(images.map(img => img.user_id))];
        const { data: creators, error: creatorsError } = await supabaseAdmin
            .from('users')
            .select('id, display_name, photo_url, xp')
            .in('id', userIds);

        if (creatorsError) throw creatorsError;

        // Step 3: Combine Data
        // Explicitly type Map to return 'any' for values so properties can be accessed
        const creatorMap = new Map<string, any>((creators || []).map((c: any) => [c.id, c]));

        const processedData = images.map((image: any) => {
            const creatorData = creatorMap.get(image.user_id);
            return {
                id: image.id,
                user_id: image.user_id,
                prompt: image.prompt,
                image_url: image.image_url,
                created_at: image.created_at,
                is_public: image.is_public,
                creator: {
                    display_name: creatorData?.display_name || 'Vô danh',
                    photo_url: creatorData?.photo_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=Unknown',
                    level: calculateLevelFromXp(creatorData?.xp || 0)
                }
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(processedData),
        };
    } catch (error: any) {
        console.error("Admin Gallery Load Error:", error.message);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };