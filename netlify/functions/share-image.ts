import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const COST_PER_SHARE = 1;

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const { imageId } = JSON.parse(event.body || '{}');
    if (!imageId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Image ID is required.' }) };
    }

    try {
        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();

        if (userError || !userData) throw new Error('Không tìm thấy người dùng.');
        if (userData.diamonds < COST_PER_SHARE) {
            return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương để chia sẻ.' }) };
        }

        const { data: imageData, error: imageError } = await supabaseAdmin
            .from('generated_images')
            .select('user_id, is_public')
            .eq('id', imageId)
            .single();
            
        if (imageError || !imageData) throw new Error('Không tìm thấy ảnh.');
        if (imageData.user_id !== user.id) {
             return { statusCode: 403, body: JSON.stringify({ error: 'Bạn không có quyền chia sẻ ảnh này.' }) };
        }
        if (imageData.is_public) {
            return { statusCode: 409, body: JSON.stringify({ error: 'Ảnh này đã được chia sẻ rồi.' }) };
        }

        const newDiamondCount = userData.diamonds - COST_PER_SHARE;

        const [userUpdateResult, imageUpdateResult, logResult] = await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('generated_images').update({ is_public: true }).eq('id', imageId),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -COST_PER_SHARE,
                transaction_type: 'SHARE_IMAGE',
                description: 'Chia sẻ tác phẩm ra thư viện'
            })
        ]);

        if (userUpdateResult.error) throw userUpdateResult.error;
        if (imageUpdateResult.error) throw imageUpdateResult.error;
        if (logResult.error) throw logResult.error;
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: 'Chia sẻ ảnh thành công!',
                newDiamondCount: newDiamondCount 
            }),
        };

    } catch (error: any) {
        console.error("Share image failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi máy chủ khi chia sẻ ảnh.' }) };
    }
};

export { handler };