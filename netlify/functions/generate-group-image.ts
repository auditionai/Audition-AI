
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    const token = authHeader.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

    try {
        const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }
        
        const rawPayload = event.body;
        if (!rawPayload) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
        }
        
        const payload = JSON.parse(rawPayload);
        const { jobId, characters, referenceImage, model, imageSize = '1K', useSearch = false, removeWatermark = false } = payload;
        
        // FIX: Removed '!referenceImage' from validation. It is optional.
        if (!jobId || !characters || !Array.isArray(characters) || characters.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Job ID and character data are required.' }) };
        }

        // Cost Calculation (UPDATED):
        let baseCost = 1;
        if (model === 'pro') {
            if (imageSize === '4K') baseCost = 20;
            else if (imageSize === '2K') baseCost = 15;
            else baseCost = 10;
        }

        let totalCost = baseCost + characters.length;
        if (removeWatermark) totalCost += 1; // +1 for removing watermark

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < totalCost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        }

        const newDiamondCount = userData.diamonds - totalCost;

        // WORKAROUND: Store progress and payload in the 'prompt' column
        const initialJobData = {
            payload: { ...payload, imageSize, useSearch, removeWatermark }, // Include removeWatermark
            progress: 'Đang khởi tạo tác vụ...'
        };

        const { error: insertError } = await supabaseAdmin.from('generated_images').insert({
            id: jobId,
            user_id: user.id,
            model_used: model === 'pro' ? `Group Studio (Pro ${imageSize})` : 'Group Studio (Flash)',
            prompt: JSON.stringify(initialJobData), 
            is_public: false,
            image_url: 'PENDING',
        });
        
        if (insertError) {
            if (insertError.code !== '23505') { 
                throw new Error(`Failed to create job record: ${insertError.message}`);
            }
        }

        let description = `Tạo ảnh nhóm ${characters.length} người (${model === 'pro' ? `Pro ${imageSize}` : 'Flash'})`;
        if (removeWatermark) description += " + NoWatermark";

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'GROUP_IMAGE_GENERATION',
                description: description,
            }),
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Job record created successfully.', newDiamondCount })
        };

    } catch (error: any) {
        console.error("Generate group image spawner error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error during task initialization.' }) };
    }
};

export { handler };
