
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const [ranksRes, cosmeticsRes] = await Promise.all([
            supabaseAdmin.from('game_ranks').select('*'),
            supabaseAdmin.from('game_cosmetics').select('*').eq('is_active', true)
        ]);

        if (ranksRes.error) throw ranksRes.error;
        if (cosmeticsRes.error) throw cosmeticsRes.error;

        // Map snake_case from DB to camelCase for Frontend
        const ranks = (ranksRes.data || []).map((r: any) => ({
            id: r.id,
            levelThreshold: r.level_threshold,
            title: r.title,
            icon: r.icon_url,
            color: r.color_hex
        }));

        const cosmetics = (cosmeticsRes.data || []).map((c: any) => ({
            id: c.id,
            type: c.type,
            name: c.name,
            nameKey: null, // Configured from admin panel usually lacks key, unless manually added
            rarity: c.rarity,
            cssClass: c.css_class,
            imageUrl: c.image_url,
            iconUrl: c.icon_url, // NEW: Map icon_url to iconUrl
            unlockCondition: { level: c.unlock_level }
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({
                ranks,
                cosmetics
            }),
        };
    } catch (error: any) {
        console.error("Failed to fetch game config:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
