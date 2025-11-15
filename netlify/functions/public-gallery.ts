import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const calculateLevelFromXp = (xp: number): number => {
    if (typeof xp !== 'number' || xp < 0) return 1;
    return Math.floor(xp / 100) + 1;
};

const handler: Handler = async () => {
    try {
        // 1. Fetch public images, filtering out deleted ones
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('is_public', true)
            .not('image_url', 'is', null) // Filter out deleted images
            .order('created_at', { ascending: false })
            .limit(50);

        if (imagesError) {
            throw new Error(`DB Error fetching images: ${imagesError.message}`);
        }

        if (!images || images.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // 2. Collect unique user IDs
        const userIds = [...new Set(images.map(img => img.user_id))];

        // 3. Fetch creator profiles for those IDs
        const { data: creators, error: creatorsError } = await supabaseAdmin
            .from('users')
            .select('id, display_name, photo_url, xp')
            .in('id', userIds);

        if (creatorsError) {
            throw new Error(`DB Error fetching creators: ${creatorsError.message}`);
        }

        // 4. Create a map for easy lookup, handling potential duplicates
        const creatorMap = new Map<string, any>();
        for (const creator of creators) {
            if (!creatorMap.has(creator.id)) { // Only add the first one found for a given ID
                creatorMap.set(creator.id, creator);
            }
        }
        
        const fallbackCreator = {
            display_name: 'Vô danh',
            photo_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=anonymous',
            level: 1,
            xp: 0,
        };

        // 5. Combine images with creator data
        const processedData = images.map(image => {
            const creatorData = creatorMap.get(image.user_id);
            return {
                ...image,
                creator: creatorData ? {
                    ...creatorData,
                    level: calculateLevelFromXp(creatorData.xp || 0)
                } : fallbackCreator
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(processedData),
        };

    } catch (error: any) {
        console.error("Error in public-gallery function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }),
        };
    }
};

export { handler };