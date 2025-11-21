
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// PREMIUM SHOP ITEMS - CURATED LIST (No basic titles like 'Tân Binh')
const DEFAULT_PREMIUM_ITEMS = [
    // --- FRAMES (High Quality CSS Effects) ---
    { type: 'frame', name: 'Neon Cyan', rarity: 'rare', css_class: 'shop-frame-01', price: 50, is_active: true, unlock_level: 0 },
    { type: 'frame', name: 'Neon Magenta', rarity: 'rare', css_class: 'shop-frame-02', price: 50, is_active: true, unlock_level: 0 },
    { type: 'frame', name: 'Hỏa Ngục', rarity: 'epic', css_class: 'shop-frame-03', price: 150, is_active: true, unlock_level: 5 },
    { type: 'frame', name: 'Thần Thánh', rarity: 'legendary', css_class: 'shop-frame-04', price: 300, is_active: true, unlock_level: 10 },
    { type: 'frame', name: 'Độc Dược', rarity: 'rare', css_class: 'shop-frame-05', price: 80, is_active: true, unlock_level: 0 },
    { type: 'frame', name: 'Thủy Tinh', rarity: 'rare', css_class: 'shop-frame-06', price: 80, is_active: true, unlock_level: 0 },
    { type: 'frame', name: 'Hoàng Kim 24K', rarity: 'legendary', css_class: 'shop-frame-07', price: 500, is_active: true, unlock_level: 20 },
    { type: 'frame', name: 'Nhịp Tim', rarity: 'epic', css_class: 'shop-frame-08', price: 200, is_active: true, unlock_level: 5 },
    { type: 'frame', name: 'Hư Không', rarity: 'epic', css_class: 'shop-frame-09', price: 200, is_active: true, unlock_level: 5 },
    { type: 'frame', name: 'RGB Master', rarity: 'mythic', css_class: 'shop-frame-10', price: 1000, is_active: true, unlock_level: 30 },
    { type: 'frame', name: 'Công Nghệ Cao', rarity: 'epic', css_class: 'shop-frame-11', price: 250, is_active: true, unlock_level: 10 },
    { type: 'frame', name: 'Dung Nham', rarity: 'legendary', css_class: 'shop-frame-12', price: 400, is_active: true, unlock_level: 15 },
    { type: 'frame', name: 'Băng Vĩnh Cửu', rarity: 'epic', css_class: 'shop-frame-13', price: 250, is_active: true, unlock_level: 10 },
    { type: 'frame', name: 'Cổ Ngữ', rarity: 'epic', css_class: 'shop-frame-14', price: 200, is_active: true, unlock_level: 5 },
    { type: 'frame', name: 'Rừng Rậm', rarity: 'rare', css_class: 'shop-frame-15', price: 100, is_active: true, unlock_level: 0 },
    { type: 'frame', name: 'Siêu Sao', rarity: 'legendary', css_class: 'shop-frame-16', price: 450, is_active: true, unlock_level: 20 },
    { type: 'frame', name: 'Linh Hồn', rarity: 'rare', css_class: 'shop-frame-17', price: 120, is_active: true, unlock_level: 0 },
    { type: 'frame', name: 'Hắc Ám', rarity: 'mythic', css_class: 'shop-frame-18', price: 1200, is_active: true, unlock_level: 40 },
    { type: 'frame', name: 'Đại Dương', rarity: 'epic', css_class: 'shop-frame-19', price: 220, is_active: true, unlock_level: 10 },
    { type: 'frame', name: 'Vũ Trụ', rarity: 'mythic', css_class: 'shop-frame-20', price: 1500, is_active: true, unlock_level: 50 },

    // --- TITLES (Distinct, Cool Names Only) ---
    { type: 'title', name: 'Cyan Neon', rarity: 'rare', css_class: 'shop-title-01', price: 50, is_active: true, unlock_level: 0 },
    { type: 'title', name: 'Magenta Neon', rarity: 'rare', css_class: 'shop-title-02', price: 50, is_active: true, unlock_level: 0 },
    { type: 'title', name: 'Hỏa Long', rarity: 'epic', css_class: 'shop-title-03', price: 150, is_active: true, unlock_level: 10 },
    { type: 'title', name: 'Thủy Quái', rarity: 'epic', css_class: 'shop-title-04', price: 150, is_active: true, unlock_level: 10 },
    { type: 'title', name: 'Hacker', rarity: 'rare', css_class: 'shop-title-05', price: 100, is_active: true, unlock_level: 5 },
    { type: 'title', name: 'Đại Gia', rarity: 'legendary', css_class: 'shop-title-06', price: 500, is_active: true, unlock_level: 20 },
    { type: 'title', name: 'Bóng Tối', rarity: 'rare', css_class: 'shop-title-08', price: 80, is_active: true, unlock_level: 0 },
    { type: 'title', name: 'Hư Không', rarity: 'epic', css_class: 'shop-title-09', price: 200, is_active: true, unlock_level: 15 },
    { type: 'title', name: 'Minimalist', rarity: 'common', css_class: 'shop-title-10', price: 20, is_active: true, unlock_level: 0 },
    { type: 'title', name: 'Cyberpunk 2077', rarity: 'epic', css_class: 'shop-title-11', price: 250, is_active: true, unlock_level: 15 },
    { type: 'title', name: 'Huyết Tộc', rarity: 'legendary', css_class: 'shop-title-12', price: 400, is_active: true, unlock_level: 25 },
    { type: 'title', name: 'Glassmorphism', rarity: 'rare', css_class: 'shop-title-13', price: 100, is_active: true, unlock_level: 5 },
    { type: 'title', name: 'Cosmic Voyager', rarity: 'epic', css_class: 'shop-title-14', price: 220, is_active: true, unlock_level: 15 },
    { type: 'title', name: 'Super Idol', rarity: 'legendary', css_class: 'shop-title-16', price: 450, is_active: true, unlock_level: 30 },
    { type: 'title', name: 'Phù Thủy', rarity: 'epic', css_class: 'shop-title-17', price: 180, is_active: true, unlock_level: 10 },
    { type: 'title', name: 'Bóng Ma', rarity: 'rare', css_class: 'shop-title-18', price: 90, is_active: true, unlock_level: 5 },
    { type: 'title', name: 'Vua Trò Chơi', rarity: 'mythic', css_class: 'shop-title-19', price: 1000, is_active: true, unlock_level: 50 },
    { type: 'title', name: 'RGB God', rarity: 'mythic', css_class: 'shop-title-20', price: 2000, is_active: true, unlock_level: 60 },
];

const handler: Handler = async (event: HandlerEvent) => {
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    const type = event.queryStringParameters?.type; // 'rank' or 'cosmetic'
    const action = event.queryStringParameters?.action; // 'seed' or 'reset'

    // --- RESET ACTION (Delete All & Seed) ---
    if (event.httpMethod === 'POST' && action === 'reset') {
        try {
            // 1. Delete all existing cosmetics
            const { error: deleteError } = await supabaseAdmin
                .from('game_cosmetics')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

            if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

            // 2. Insert new curated items
            const { error: insertError } = await supabaseAdmin
                .from('game_cosmetics')
                .insert(DEFAULT_PREMIUM_ITEMS);

            if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

            return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Shop has been reset and re-seeded.', count: DEFAULT_PREMIUM_ITEMS.length }) };
        } catch (e: any) {
            return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
        }
    }

    // --- SEED ACTION (Add missing items only) ---
    if (event.httpMethod === 'POST' && action === 'seed') {
        try {
            const { error } = await supabaseAdmin.from('game_cosmetics').upsert(DEFAULT_PREMIUM_ITEMS, { onConflict: 'name' });
            if (error) throw error;
            return { statusCode: 200, body: JSON.stringify({ success: true, count: DEFAULT_PREMIUM_ITEMS.length }) };
        } catch (e: any) {
            return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
        }
    }

    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
        const body = JSON.parse(event.body || '{}');
        const { id, ...payload } = body;
        const table = type === 'rank' ? 'game_ranks' : 'game_cosmetics';

        if (event.httpMethod === 'POST') {
            const { data, error } = await supabaseAdmin.from(table).insert(payload).select().single();
            if (error) {
                return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            }
            return { statusCode: 201, body: JSON.stringify(data) };
        } else {
             // PUT
             if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'ID missing for update' }) };
             
             const { data, error } = await supabaseAdmin.from(table).update(payload).eq('id', id).select().single();
            if (error) {
                return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            }
            return { statusCode: 200, body: JSON.stringify(data) };
        }
    }

    if (event.httpMethod === 'DELETE') {
        const { id } = JSON.parse(event.body || '{}');
        const table = type === 'rank' ? 'game_ranks' : 'game_cosmetics';
        const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
        if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, body: JSON.stringify({ message: 'Deleted' }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};

export { handler };
