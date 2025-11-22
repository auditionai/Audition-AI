
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

    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    
    // 2. Fetch all public images with creator info
    try {
        // Modified query to be safer. Removed strict foreign key hint just in case.
        // Using left join implicitly via standard Supabase syntax.
        const { data, error } = await supabaseAdmin
            .from('generated_images')
            .select(`
                id, user_id, prompt, image_url, created_at, is_public,
                users (display_name, photo_url, xp)
            `)
            .eq('is_public', true)
            .not('image_url', 'is', null) // Filter out deleted images
            .order('created_at', { ascending: false });

        if (error) throw error;

        const processedData = data.map((image: any) => {
            // Handle joined data which might be returned as 'users' object or array
            const creatorData = Array.isArray(image.users) ? image.users[0] : image.users;
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
