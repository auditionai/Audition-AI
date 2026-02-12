
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        // 1. Fetch all active cosmetics from DB (Single Source of Truth)
        const { data: dbCosmetics, error: cosmeticsError } = await supabaseAdmin
            .from('game_cosmetics')
            .select('*')
            .eq('is_active', true)
            .order('price', { ascending: true });

        if (cosmeticsError) throw cosmeticsError;

        // 2. Fetch user's owned items
        const { data: inventory, error: inventoryError } = await supabaseAdmin
            .from('user_inventory')
            .select('item_id')
            .eq('user_id', user.id);

        if (inventoryError) throw inventoryError;

        const ownedItemIds = new Set(inventory?.map(i => i.item_id) || []);

        // 3. Process items
        // NOTE: We no longer merge with hardcoded constants. 
        // The shop is now fully dynamic based on DB content.
        const allItems = dbCosmetics || [];

        const processedItems = allItems.map(item => ({
            id: item.id,
            name: item.name,
            type: item.type,
            rarity: item.rarity,
            price: item.price || 0,
            cssClass: item.css_class,
            imageUrl: item.image_url,
            iconUrl: item.icon_url,
            unlockCondition: { level: item.unlock_level || 0 },
            owned: ownedItemIds.has(item.id),
        }));

        // Sort by Price
        processedItems.sort((a, b) => a.price - b.price);

        return {
            statusCode: 200,
            body: JSON.stringify(processedItems),
        };

    } catch (error: any) {
        console.error("Fetch shop items error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
