
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };

    try {
        const { itemId } = JSON.parse(event.body || '{}');
        if (!itemId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing Item ID' }) };

        // 1. Fetch Item Details
        const { data: item, error: itemError } = await supabaseAdmin
            .from('game_cosmetics')
            .select('*')
            .eq('id', itemId)
            .single();

        if (itemError || !item) return { statusCode: 404, body: JSON.stringify({ error: 'Vật phẩm không tồn tại.' }) };
        if (!item.is_active) return { statusCode: 400, body: JSON.stringify({ error: 'Vật phẩm này đã ngừng bán.' }) };

        // 2. Check User Balance
        const { data: userData } = await supabaseAdmin.from('users').select('diamonds, level').eq('id', user.id).single();
        if (!userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };

        const price = item.price || 0;
        const unlockLevel = item.unlock_level || 0;

        // Check level requirement
        if (userData.level < unlockLevel) {
            return { statusCode: 403, body: JSON.stringify({ error: `Bạn cần đạt cấp độ ${unlockLevel} để mua vật phẩm này.` }) };
        }

        // Check balance
        if (userData.diamonds < price) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Giá: ${price} 💎` }) };
        }

        // 3. Check if already owned
        const { data: existing } = await supabaseAdmin
            .from('user_inventory')
            .select('id')
            .eq('user_id', user.id)
            .eq('item_id', itemId)
            .single();

        if (existing) return { statusCode: 400, body: JSON.stringify({ error: 'Bạn đã sở hữu vật phẩm này rồi.' }) };

        // 4. Process Transaction (Deduct Gems & Add to Inventory)
        const newBalance = userData.diamonds - price;

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newBalance }).eq('id', user.id),
            supabaseAdmin.from('user_inventory').insert({ user_id: user.id, item_id: itemId }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -price,
                transaction_type: 'SHOP_PURCHASE',
                description: `Mua vật phẩm: ${item.name}`
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                newDiamonds: newBalance,
                message: `Mua "${item.name}" thành công!`
            }),
        };

    } catch (error: any) {
        console.error("Shop buy error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error' }) };
    }
};

export { handler };
