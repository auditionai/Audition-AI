
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// PREMIUM SHOP ITEMS (Simulated DB default data)
const SHOP_EXCLUSIVE_COSMETICS = [
    // FRAMES
    { id: 'shop-frame-01', type: 'frame', name: 'Neon Cyan Pulse', rarity: 'rare', css_class: 'shop-frame-01', price: 50 },
    { id: 'shop-frame-02', type: 'frame', name: 'Neon Purple Pulse', rarity: 'rare', css_class: 'shop-frame-02', price: 50 },
    { id: 'shop-frame-03', type: 'frame', name: 'Vòng Lửa Địa Ngục', rarity: 'epic', css_class: 'shop-frame-03', price: 150 },
    { id: 'shop-frame-04', type: 'frame', name: 'Hào Quang Thần Thánh', rarity: 'legendary', css_class: 'shop-frame-04', price: 300 },
    { id: 'shop-frame-05', type: 'frame', name: 'Vòng Tròn Độc Dược', rarity: 'rare', css_class: 'shop-frame-05', price: 80 },
    { id: 'shop-frame-06', type: 'frame', name: 'Bong Bóng Nước', rarity: 'rare', css_class: 'shop-frame-06', price: 80 },
    { id: 'shop-frame-07', type: 'frame', name: 'Vàng Ròng 24K', rarity: 'legendary', css_class: 'shop-frame-07', price: 500 },
    { id: 'shop-frame-08', type: 'frame', name: 'Nhịp Tim Yêu Thương', rarity: 'epic', css_class: 'shop-frame-08', price: 200 },
    { id: 'shop-frame-09', type: 'frame', name: 'Hư Không Tím', rarity: 'epic', css_class: 'shop-frame-09', price: 200 },
    { id: 'shop-frame-10', type: 'frame', name: 'Vòng Xoay 7 Sắc', rarity: 'mythic', css_class: 'shop-frame-10', price: 1000 },
    { id: 'shop-frame-11', type: 'frame', name: 'Vòng Tròn Công Nghệ', rarity: 'epic', css_class: 'shop-frame-11', price: 250 },
    { id: 'shop-frame-12', type: 'frame', name: 'Dung Nham Nóng Chảy', rarity: 'legendary', css_class: 'shop-frame-12', price: 400 },
    { id: 'shop-frame-13', type: 'frame', name: 'Băng Giá Vĩnh Cửu', rarity: 'epic', css_class: 'shop-frame-13', price: 250 },
    { id: 'shop-frame-14', type: 'frame', name: 'Bí Ẩn Huyền Bí', rarity: 'epic', css_class: 'shop-frame-14', price: 200 },
    { id: 'shop-frame-15', type: 'frame', name: 'Thiên Nhiên Hoang Dã', rarity: 'rare', css_class: 'shop-frame-15', price: 100 },
    { id: 'shop-frame-16', type: 'frame', name: 'Idol Tỏa Sáng', rarity: 'legendary', css_class: 'shop-frame-16', price: 450 },
    { id: 'shop-frame-17', type: 'frame', name: 'Bóng Ma', rarity: 'rare', css_class: 'shop-frame-17', price: 120 },
    { id: 'shop-frame-18', type: 'frame', name: 'Sith Lord', rarity: 'mythic', css_class: 'shop-frame-18', price: 1200 },
    { id: 'shop-frame-19', type: 'frame', name: 'Đại Dương Sâu Thẳm', rarity: 'epic', css_class: 'shop-frame-19', price: 220 },
    { id: 'shop-frame-20', type: 'frame', name: 'Chúa Tể Vũ Trụ', rarity: 'mythic', css_class: 'shop-frame-20', price: 1500 },

    // TITLES - Removed low-tier duplicates
    { id: 'shop-title-01', type: 'title', name: 'Cyan Neon', rarity: 'rare', css_class: 'shop-title-01', price: 50 },
    { id: 'shop-title-02', type: 'title', name: 'Magenta Neon', rarity: 'rare', css_class: 'shop-title-02', price: 50 },
    { id: 'shop-title-03', type: 'title', name: 'Hỏa Long', rarity: 'epic', css_class: 'shop-title-03', price: 150 },
    { id: 'shop-title-04', type: 'title', name: 'Thủy Quái', rarity: 'epic', css_class: 'shop-title-04', price: 150 },
    { id: 'shop-title-05', type: 'title', name: 'Hacker', rarity: 'rare', css_class: 'shop-title-05', price: 100 },
    { id: 'shop-title-06', type: 'title', name: 'Đại Gia', rarity: 'legendary', css_class: 'shop-title-06', price: 500 },
    { id: 'shop-title-08', type: 'title', name: 'Bóng Tối', rarity: 'rare', css_class: 'shop-title-08', price: 80 },
    { id: 'shop-title-09', type: 'title', name: 'Hư Không', rarity: 'epic', css_class: 'shop-title-09', price: 200 },
    { id: 'shop-title-10', type: 'title', name: 'Minimalist', rarity: 'common', css_class: 'shop-title-10', price: 20 },
    { id: 'shop-title-11', type: 'title', name: 'Cyberpunk 2077', rarity: 'epic', css_class: 'shop-title-11', price: 250 },
    { id: 'shop-title-12', type: 'title', name: 'Huyết Tộc', rarity: 'legendary', css_class: 'shop-title-12', price: 400 },
    { id: 'shop-title-13', type: 'title', name: 'Glassmorphism', rarity: 'rare', css_class: 'shop-title-13', price: 100 },
    { id: 'shop-title-14', type: 'title', name: 'Cosmic Voyager', rarity: 'epic', css_class: 'shop-title-14', price: 220 },
    { id: 'shop-title-16', type: 'title', name: 'Super Idol', rarity: 'legendary', css_class: 'shop-title-16', price: 450 },
    { id: 'shop-title-17', type: 'title', name: 'Phù Thủy', rarity: 'epic', css_class: 'shop-title-17', price: 180 },
    { id: 'shop-title-18', type: 'title', name: 'Bóng Ma', rarity: 'rare', css_class: 'shop-title-18', price: 90 },
    { id: 'shop-title-19', type: 'title', name: 'Vua Trò Chơi', rarity: 'mythic', css_class: 'shop-title-19', price: 1000 },
    { id: 'shop-title-20', type: 'title', name: 'RGB God', rarity: 'mythic', css_class: 'shop-title-20', price: 2000 },
];

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
        // 1. Fetch all active cosmetics from DB
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

        // 3. Merge DB Items with Constant Shop Items (Simulating DB)
        // Note: If DB contains item with same ID as constant, DB wins in normal merging logic, 
        // but here we simply concatenate since we assume they are distinct or managed via DB mostly.
        // We filter out SHOP_EXCLUSIVE items from hardcoded list if they already exist in DB to avoid duplicates
        const dbIds = new Set(dbCosmetics?.map(i => i.id) || []);
        const filteredConstants = SHOP_EXCLUSIVE_COSMETICS.filter(i => !dbIds.has(i.id));

        const allItems = [...(dbCosmetics || []), ...filteredConstants];

        // 4. Map ownership status
        const processedItems = allItems.map(item => ({
            ...item,
            owned: ownedItemIds.has(item.id),
            // Map DB/Constant fields to Frontend fields
            id: item.id,
            name: item.name,
            type: item.type,
            rarity: item.rarity,
            price: item.price || 0,
            cssClass: item.css_class || item.cssClass, // Handle both snake_case and camelCase source
            imageUrl: item.image_url || item.imageUrl,
            iconUrl: item.icon_url || item.iconUrl,
            unlockCondition: { level: item.unlock_level || 0 }
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
