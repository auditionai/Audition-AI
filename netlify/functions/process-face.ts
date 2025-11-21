
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
        const { image: imageDataUrl, model } = JSON.parse(event.body || '{}');
        if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image data.' }) };
        }

        // Determine Cost based on model (Pro = 10, Flash = 1)
        const cost = (model === 'gemini-3-pro-image-preview') ? 10 : 1;

        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();
        
        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < cost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${cost} 💎.` }) };
        }

        // 3. Simulate AI processing (or actual implementation if available)
        console.log(`[FACE PROCESS] Simulating AI (${model}) face crop/sharpen for user ${user.id}...`);
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        const [_header, base64] = imageDataUrl.split(',');
        const processedImageBase64 = base64; // Placeholder

        // 4. Deduct cost and log transaction
        const newDiamondCount = userData.diamonds - cost;
        
        let description = `Xử lý Gương Mặt`;
        description += (model === 'gemini-3-pro-image-preview') ? ` (Pro)` : ` (Flash)`;

        const [userUpdateResult, logResult] = await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -cost,
                transaction_type: 'FACE_ID_PROCESS',
                description: description
            })
        ]);

        if (userUpdateResult.error) throw userUpdateResult.error;
        if (logResult.error) throw logResult.error;
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true,
                message: "Xử lý gương mặt thành công!",
                processedImageBase64,
                newDiamondCount
            }),
        };

    } catch (error: any) {
        console.error("Process face function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi máy chủ khi xử lý gương mặt.' }) };
    }
};

export { handler };
