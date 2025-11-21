
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

// PREMIUM SHOP ITEMS (Used for seeding DB)
const DEFAULT_PREMIUM_ITEMS = [
    // FRAMES
    { type: 'frame', name: 'Neon Cyan Pulse', rarity: 'rare', css_class: 'shop-frame-01', price: 50, is_active: true },
    { type: 'frame', name: 'Neon Purple Pulse', rarity: 'rare', css_class: 'shop-frame-02', price: 50, is_active: true },
    { type: 'frame', name: 'Vòng Lửa Địa Ngục', rarity: 'epic', css_class: 'shop-frame-03', price: 150, is_active: true },
    { type: 'frame', name: 'Hào Quang Thần Thánh', rarity: 'legendary', css_class: 'shop-frame-04', price: 300, is_active: true },
    { type: 'frame', name: 'Vòng Tròn Độc Dược', rarity: 'rare', css_class: 'shop-frame-05', price: 80, is_active: true },
    { type: 'frame', name: 'Bong Bóng Nước', rarity: 'rare', css_class: 'shop-frame-06', price: 80, is_active: true },
    { type: 'frame', name: 'Vàng Ròng 24K', rarity: 'legendary', css_class: 'shop-frame-07', price: 500, is_active: true },
    { type: 'frame', name: 'Nhịp Tim Yêu Thương', rarity: 'epic', css_class: 'shop-frame-08', price: 200, is_active: true },
    { type: 'frame', name: 'Hư Không Tím', rarity: 'epic', css_class: 'shop-frame-09', price: 200, is_active: true },
    { type: 'frame', name: 'Vòng Xoay 7 Sắc', rarity: 'mythic', css_class: 'shop-frame-10', price: 1000, is_active: true },
    { type: 'frame', name: 'Vòng Tròn Công Nghệ', rarity: 'epic', css_class: 'shop-frame-11', price: 250, is_active: true },
    { type: 'frame', name: 'Dung Nham Nóng Chảy', rarity: 'legendary', css_class: 'shop-frame-12', price: 400, is_active: true },
    { type: 'frame', name: 'Băng Giá Vĩnh Cửu', rarity: 'epic', css_class: 'shop-frame-13', price: 250, is_active: true },
    { type: 'frame', name: 'Bí Ẩn Huyền Bí', rarity: 'epic', css_class: 'shop-frame-14', price: 200, is_active: true },
    { type: 'frame', name: 'Thiên Nhiên Hoang Dã', rarity: 'rare', css_class: 'shop-frame-15', price: 100, is_active: true },
    { type: 'frame', name: 'Idol Tỏa Sáng', rarity: 'legendary', css_class: 'shop-frame-16', price: 450, is_active: true },
    { type: 'frame', name: 'Bóng Ma', rarity: 'rare', css_class: 'shop-frame-17', price: 120, is_active: true },
    { type: 'frame', name: 'Sith Lord', rarity: 'mythic', css_class: 'shop-frame-18', price: 1200, is_active: true },
    { type: 'frame', name: 'Đại Dương Sâu Thẳm', rarity: 'epic', css_class: 'shop-frame-19', price: 220, is_active: true },
    { type: 'frame', name: 'Chúa Tể Vũ Trụ', rarity: 'mythic', css_class: 'shop-frame-20', price: 1500, is_active: true },

    // TITLES
    { type: 'title', name: 'Cyan Neon', rarity: 'rare', css_class: 'shop-title-01', price: 50, is_active: true },
    { type: 'title', name: 'Magenta Neon', rarity: 'rare', css_class: 'shop-title-02', price: 50, is_active: true },
    { type: 'title', name: 'Hỏa Long', rarity: 'epic', css_class: 'shop-title-03', price: 150, is_active: true },
    { type: 'title', name: 'Thủy Quái', rarity: 'epic', css_class: 'shop-title-04', price: 150, is_active: true },
    { type: 'title', name: 'Hacker', rarity: 'rare', css_class: 'shop-title-05', price: 100, is_active: true },
    { type: 'title', name: 'Đại Gia', rarity: 'legendary', css_class: 'shop-title-06', price: 500, is_active: true },
    { type: 'title', name: 'Bóng Tối', rarity: 'rare', css_class: 'shop-title-08', price: 80, is_active: true },
    { type: 'title', name: 'Hư Không', rarity: 'epic', css_class: 'shop-title-09', price: 200, is_active: true },
    { type: 'title', name: 'Minimalist', rarity: 'common', css_class: 'shop-title-10', price: 20, is_active: true },
    { type: 'title', name: 'Cyberpunk 2077', rarity: 'epic', css_class: 'shop-title-11', price: 250, is_active: true },
    { type: 'title', name: 'Huyết Tộc', rarity: 'legendary', css_class: 'shop-title-12', price: 400, is_active: true },
    { type: 'title', name: 'Glassmorphism', rarity: 'rare', css_class: 'shop-title-13', price: 100, is_active: true },
    { type: 'title', name: 'Cosmic Voyager', rarity: 'epic', css_class: 'shop-title-14', price: 220, is_active: true },
    { type: 'title', name: 'Super Idol', rarity: 'legendary', css_class: 'shop-title-16', price: 450, is_active: true },
    { type: 'title', name: 'Phù Thủy', rarity: 'epic', css_class: 'shop-title-17', price: 180, is_active: true },
    { type: 'title', name: 'Bóng Ma', rarity: 'rare', css_class: 'shop-title-18', price: 90, is_active: true },
    { type: 'title', name: 'Vua Trò Chơi', rarity: 'mythic', css_class: 'shop-title-19', price: 1000, is_active: true },
    { type: 'title', name: 'RGB God', rarity: 'mythic', css_class: 'shop-title-20', price: 2000, is_active: true },
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
    const action = event.queryStringParameters?.action; // 'seed'

    // --- SEED ACTION ---
    if (event.httpMethod === 'POST' && action === 'seed') {
        try {
            const { error } = await supabaseAdmin.from('game_cosmetics').insert(DEFAULT_PREMIUM_ITEMS);
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
                console.error(`DB Insert Error (${table}):`, error);
                return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            }
            return { statusCode: 201, body: JSON.stringify(data) };
        } else {
             // PUT
             if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'ID missing for update' }) };
             
             const { data, error } = await supabaseAdmin.from(table).update(payload).eq('id', id).select().single();
            if (error) {
                console.error(`DB Update Error (${table} ID: ${id}):`, error);
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
