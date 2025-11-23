
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
        // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };
        }

        // 2. Fetch all images created by this user, excluding those with a null URL (expired/deleted).
        const { data: images, error: imagesError } = await supabaseAdmin
            .from('generated_images')
            .select('id, user_id, prompt, image_url, model_used, created_at, is_public')
            .eq('user_id', user.id)
            .not('image_url', 'is', null) // Only fetch images that have not been expired/deleted
            .order('created_at', { ascending: false });

        if (imagesError) {
            // This error might be triggered if the column wasn't added correctly.
            throw new Error(`Database query failed: ${imagesError.message}`);
        }
        
        // 3. Fetch latest user profile data to get consistent name/avatar/badges
        // FIX: Use wildcard select to be robust against schema changes
        const { data: userProfile } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        // Create creator object using DB data or auth fallback
        const creatorInfo = {
            display_name: userProfile?.display_name || user.user_metadata?.full_name || 'Bạn',
            photo_url: userProfile?.photo_url || user.user_metadata?.avatar_url || 'https://i.pravatar.cc/150',
            level: 1, 
            equipped_title_id: userProfile?.equipped_title_id,
            equipped_frame_id: userProfile?.equipped_frame_id,
            equipped_name_effect_id: userProfile?.equipped_name_effect_id
        };

        // 4. Combine images with the reliable creator info.
        const processedData = (images || []).map(image => ({
            ...image,
            creator: creatorInfo,
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(processedData),
        };

    } catch (error: any) {
        console.error("Error in user-gallery function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) };
    }
};

export { handler };