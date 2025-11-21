
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
        // 1. Fetch all active cosmetics
        const { data: cosmetics, error: cosmeticsError } = await supabaseAdmin
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

        // 3. Map ownership status
        const processedItems = cosmetics.map(item => ({
            ...item,
            owned: ownedItemIds.has(item.id),
            // Map DB fields to Frontend fields
            id: item.id,
            name: item.name,
            type: item.type,
            rarity: item.rarity,
            price: item.price || 0,
            cssClass: item.css_class,
            imageUrl: item.image_url,
            iconUrl: item.icon_url,
            unlockCondition: { level: item.unlock_level }
        }));

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
