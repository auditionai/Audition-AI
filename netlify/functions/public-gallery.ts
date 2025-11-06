import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const calculateLevelFromXp = (xp: number): number => {
    if (typeof xp !== 'number' || xp < 0) return 1;
    return Math.floor(xp / 100) + 1;
};

const handler: Handler = async () => {
    try {
        const { data, error } = await supabaseAdmin
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
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(20); // Limit to a reasonable number for the public gallery

        if (error) {
            throw error;
        }
        
        const processedData = data.map(image => {
            // Fix: Supabase might return an array for a joined table. Safely handle both object and array cases.
            const creatorData = Array.isArray(image.creator) ? image.creator[0] : image.creator;

            if (!creatorData) {
                return {
                    ...image,
                    creator: {
                        display_name: 'Vô danh',
                        photo_url: 'https://i.pravatar.cc/150',
                        level: 1,
                        xp: 0,
                    }
                }
            }
            return {
                ...image,
                creator: {
                    // Spread the actual creator object, not a potential array
                    ...creatorData,
                    level: calculateLevelFromXp(creatorData.xp || 0)
                }
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify(processedData),
        };

    } catch (error: any) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

export { handler };