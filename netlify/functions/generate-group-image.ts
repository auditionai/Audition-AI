// FIX: Add HandlerContext to import for invoking background functions.
import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
// FIX: Removed incorrect 'invoke' import.

const XP_PER_CHARACTER = 5;

// This function now acts as a "spawner".
// 1. It receives the large payload from the client (acceptable for a sync function).
// 2. It performs auth and billing immediately.
// 3. It creates the job record in the database.
// 4. It invokes the background function with just the small job ID.
// 5. It returns 202 Accepted to the client.
// FIX: Add context parameter to handler signature to access the invoke method.
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    const token = authHeader.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }
        
        const payload = JSON.parse(event.body || '{}');
        const { jobId, characters, useUpscaler } = payload;
        
        if (!jobId || !characters || !Array.isArray(characters) || characters.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Job ID and character data are required.' }) };
        }

        const totalCost = characters.length + (useUpscaler ? 1 : 0);

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < totalCost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        }

        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = (userData.xp || 0) + (characters.length * XP_PER_CHARACTER);

        // Create the job record, storing the large payload in the 'prompt' column as a JSON string
        const { error: insertError } = await supabaseAdmin.from('generated_images').insert({
            job_id: jobId,
            user_id: user.id,
            status: 'pending',
            model_used: 'Group Studio',
            prompt: JSON.stringify(payload), // Store the whole payload
            // Store final user balances to update in one go when job is done
            final_diamond_count: newDiamondCount,
            final_xp: newXp
        });
        
        if (insertError) {
            throw new Error(`Failed to create job record: ${insertError.message}`);
        }

        // Now, deduct diamonds and log the transaction synchronously
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'GROUP_IMAGE_GENERATION',
                description: `Tạo ảnh nhóm ${characters.length} người`,
            }),
        ]);

        // FIX: Use context.invoke to call the background function correctly.
        // Invoke the background function with ONLY the job ID
        context.invoke('generate-group-image-background', {
            body: JSON.stringify({ jobId }),
        });

        // Return 202 Accepted to the client immediately
        return {
            statusCode: 202,
            body: JSON.stringify({ message: 'Accepted: Group image generation task has started.' }),
        };

    } catch (error: any) {
        console.error("Generate group image spawner error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error during task initialization.' }) };
    }
};

export { handler };