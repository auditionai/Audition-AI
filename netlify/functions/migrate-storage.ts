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
    // FIX: Use Supabase v1 `api.getUser(token)` instead of v2 `auth.getUser(token)` and correct the destructuring.
    const { user, error: authError } = await supabaseAdmin.auth.api.getUser(token);
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
        // In a real app, you would call a dedicated AI service here (e.g., Google Vision API, or another Gemini call).
        // For this demo, we'll just return the original image's base64 data to prove the workflow.
        console.log(`[FACE PROCESS] Simulating AI face crop/sharpen for user ${user.id}...`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate processing time
        const [_header, base64] = imageDataUrl.split(',');
        const processedImageBase64 = base64; // Placeholder

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