import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const calculateLevelFromXp = (xp: number): number => {
    if (typeof xp !== 'number' || xp < 0) return 1;
    return Math.floor(xp / 100) + 1;
};

const handler: Handler = async (event: HandlerEvent) => {
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

    const { data, error } = await supabaseAdmin
        .from('generated_images')
        .select(`
            id,
            user_id,
            prompt,
            image_url,
            model_used,
            created_at,
            creator:users (
                display_name,
                photo_url,
                xp
            )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    
    // Post-process to add the level, which is calculated from XP
    const processedData = data.map(image => {
        // The creator object might be null if the user was deleted, handle this gracefully
        if (!image.creator) {
            return {
                ...image,
                creator: {
                    display_name: 'Người dùng vô danh',
                    photo_url: 'https://i.pravatar.cc/150', // placeholder
                    level: 1,
                    xp: 0,
                }
            }
        }
        return {
            ...image,
            creator: {
                ...image.creator,
                level: calculateLevelFromXp(image.creator.xp || 0)
            }
        }
    });

    return {
        statusCode: 200,
        body: JSON.stringify(processedData),
    };
};

export { handler };