
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';

const BASE_COST = 10; // Base cost (1K)

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    try {
        // 1. Parse Payload
        const payload = JSON.parse(event.body || '{}');
        const { panel, imageQuality = '1K' } = payload;
        
        if (!panel || !panel.visual_description) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing panel data.' }) };
        }

        // Calculate Cost
        let totalCost = BASE_COST;
        if (imageQuality === '2K') totalCost += 10;
        if (imageQuality === '4K') totalCost += 15;

        // 2. Check Balance
        const { data: userData } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        if (!userData || userData.diamonds < totalCost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost} Kim Cương cho chất lượng ${imageQuality}.` }) };
        }

        // 3. Create Job Record (PENDING state)
        const jobId = crypto.randomUUID();
        const newDiamondCount = userData.diamonds - totalCost;

        // We store the render configuration in the 'prompt' column as a JSON string
        // This acts as a temporary storage for the worker to read
        const jobConfig = {
            payload: payload, // Passes entire payload including globalContext, quality, AND previousPageUrl
            status: 'initializing'
        };

        // Transaction: Deduct money & Create Job
        const { error: insertError } = await supabaseAdmin.from('generated_images').insert({
            id: jobId,
            user_id: user.id,
            model_used: `Comic Studio (Pro ${imageQuality})`,
            prompt: JSON.stringify(jobConfig), // Store config here
            is_public: false,
            image_url: 'PENDING', // Mark as pending
        });

        if (insertError) throw insertError;

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'COMIC_RENDER',
                description: `Vẽ khung tranh #${panel.panel_number} (${imageQuality})`
            })
        ]);

        // 4. Return Success Immediately (The frontend will trigger the worker)
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                jobId: jobId, 
                newDiamondCount: newDiamondCount,
                message: "Đã gửi yêu cầu vẽ. Đang xử lý..." 
            }),
        };

    } catch (error: any) {
        console.error("Render trigger failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
