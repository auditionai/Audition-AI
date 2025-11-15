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
        // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }
        
        const rawPayload = event.body;
        if (!rawPayload) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
        }
        
        const payload = JSON.parse(rawPayload);
        const { jobId, characters, referenceImage } = payload;
        
        if (!jobId || !characters || !Array.isArray(characters) || characters.length === 0 || !referenceImage) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Job ID, reference image, and character data are required.' }) };
        }

        const totalCost = characters.length + 1;

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < totalCost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        }

        const newDiamondCount = userData.diamonds - totalCost;

        // WORKAROUND: Store progress and payload in the 'prompt' column to avoid schema cache issues with 'progress_text'.
        const initialJobData = {
            payload: payload,
            progress: 'Đang khởi tạo tác vụ...'
        };

        const { error: insertError } = await supabaseAdmin.from('generated_images').insert({
            id: jobId,
            user_id: user.id,
            model_used: 'Group Studio',
            prompt: JSON.stringify(initialJobData), // Store structured data here
            is_public: false,
            image_url: 'PENDING',
        });
        
        if (insertError) {
            if (insertError.code !== '23505') { // Ignore unique_violation for retries
                throw new Error(`Failed to create job record: ${insertError.message}`);
            }
        }

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'GROUP_IMAGE_GENERATION',
                description: `Tạo ảnh nhóm ${characters.length} người`,
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