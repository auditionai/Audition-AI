import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const COST_PER_FACE_PROCESS = 1;

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // 1. Authenticate user
    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    try {
        // 2. Validate input and user balance
        const { image: imageDataUrl } = JSON.parse(event.body || '{}');
        if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image data.' }) };
        }

        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();
        
        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < COST_PER_FACE_PROCESS) {
            return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương để xử lý gương mặt.' }) };
        }

        // 3. Simulate AI processing (crop, sharpen)
        console.log(`[FACE PROCESS] Simulating AI face crop/sharpen for user ${user.id}...`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate processing time
        
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        const processedImageBase64 = base64; // Placeholder for actual AI processing
        const processedImageDataUrl = `data:${mimeType};base64,${processedImageBase64}`;


        // 4. Deduct cost and log transaction
        const newDiamondCount = userData.diamonds - COST_PER_FACE_PROCESS;
        const [userUpdateResult, logResult] = await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -COST_PER_FACE_PROCESS,
                transaction_type: 'FACE_ID_PROCESS',
                description: 'Xử lý & Khóa Gương Mặt'
            })
        ]);

        if (userUpdateResult.error) throw userUpdateResult.error;
        if (logResult.error) throw logResult.error;
        
        // 5. Return success response with processed data
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true,
                message: "Xử lý gương mặt thành công!",
                processedImageDataUrl, // Return the full data URL
                newDiamondCount
            }),
        };

    } catch (error: any) {
        console.error("Process face function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi máy chủ khi xử lý gương mặt.' }) };
    }
};

export { handler };