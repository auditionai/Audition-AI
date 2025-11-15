import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const XP_PER_CHARACTER = 5;

// Helper to fail the job and notify the user by deleting the record.
const failJob = async (jobId: string, reason: string, userId: string, cost: number) => {
    console.error(`[WORKER] Failing job ${jobId}: ${reason}`);
    try {
        await Promise.all([
            // Delete the record, which triggers the frontend to stop waiting
            supabaseAdmin.from('generated_images').delete().eq('id', jobId),
            // Refund the user
            supabaseAdmin.rpc('increment_user_diamonds', { user_id_param: userId, diamond_amount: cost }),
            // Log the refund
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: userId,
                amount: cost,
                transaction_type: 'REFUND',
                description: `Hoàn tiền tạo ảnh nhóm thất bại (Lỗi: ${reason.substring(0, 50)})`,
            })
        ]);
    } catch (e) {
        console.error(`[WORKER] CRITICAL: Failed to clean up or refund for job ${jobId}`, e);
    }
};

const processDataUrl = (dataUrl: string | null) => {
    if (!dataUrl) return null;
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return { base64, mimeType };
};

// WORKAROUND HELPER: Update progress by rewriting the 'prompt' column.
const updateJobProgress = async (jobId: string, currentPromptData: any, progressMessage: string) => {
    const newProgressData = { ...currentPromptData, progress: progressMessage };
    await supabaseAdmin.from('generated_images').update({ prompt: JSON.stringify(newProgressData) }).eq('id', jobId);
};


const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) {
        console.error("[WORKER] Job ID is missing.");
        return { statusCode: 200 };
    }

    let jobPromptData, payload, userId, totalCost = 0;

    try {
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData || !jobData.prompt) {
            throw new Error(fetchError?.message || 'Job not found or payload is missing.');
        }

        // WORKAROUND: Parse the structured data from the 'prompt' column.
        jobPromptData = JSON.parse(jobData.prompt);
        payload = jobPromptData.payload; // Extract original payload
        userId = jobData.user_id;
        totalCost = (payload.characters?.length || 0) + 1;

        const { characters, referenceImage, prompt, style, aspectRatio } = payload;
        const numCharacters = characters.length;

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const model = 'gemini-2.5-flash-image';
        
        const generatedCharacters = [];

        // Step 1: Generate each character individually
        for (let i = 0; i < numCharacters; i++) {
            await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
            
            const char = characters[i];
            const charPrompt = [
                `**Nhiệm vụ:** Tạo một hình ảnh chất lượng cao của một nhân vật duy nhất trên nền **đen tuyền (#000000)**.`,
                `1. **Gương mặt:** Phải giống hệt với gương mặt trong ảnh tham chiếu gương mặt được cung cấp.`,
                `2. **Trang phục & Cơ thể:** Phải sao chép chính xác 100% trang phục, phụ kiện và dáng người từ ảnh tham chiếu nhân vật được cung cấp.`,
                `3. **Giới tính:** Nhân vật là ${char.gender === 'male' ? 'Nam' : 'Nữ'}.`,
                `4. **Nền:** Nền phải là một màu đen đồng nhất, không có bóng, không có chi tiết.`
            ].join('\n');

            const poseData = processDataUrl(char.poseImage);
            const faceData = processDataUrl(char.faceImage);

            if (!poseData) throw new Error(`Ảnh nhân vật ${i+1} không hợp lệ.`);

            const parts = [
                { text: charPrompt },
                { inlineData: { data: poseData.base64, mimeType: poseData.mimeType } }
            ];
            if (faceData) {
                parts.push({ inlineData: { data: faceData.base64, mimeType: faceData.mimeType } });
            }

            const response = await ai.models.generateContent({
                model,
                contents: { parts },
                config: { responseModalities: [Modality.IMAGE] },
            });
            const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePart?.inlineData) throw new Error(`AI không thể tạo được nhân vật ${i + 1}.`);
            
            generatedCharacters.push(imagePart.inlineData);

            // Add a delay between API calls
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Step 2: Composite all characters onto the reference background
        await updateJobProgress(jobId, jobPromptData, 'Đang tổng hợp ảnh cuối cùng...');

        const compositePrompt = [
            `**Nhiệm vụ:** Ghép các nhân vật đã được tạo sẵn vào ảnh bối cảnh.`,
            `1. **Bối cảnh & Bố cục:** Sử dụng ảnh tham chiếu đầu tiên làm bối cảnh và hướng dẫn vị trí.`,
            `2. **Nhân vật:** Lấy các nhân vật từ các ảnh có nền đen và đặt họ vào bối cảnh.`,
            `3. **Hòa trộn:** Điều chỉnh ánh sáng và bóng đổ trên các nhân vật để họ hòa hợp một cách tự nhiên với bối cảnh.`,
            `4. **Yêu cầu bổ sung:** ${prompt || `Giữ nguyên phong cách của ảnh bối cảnh.`}`
        ].join('\n');

        const refData = processDataUrl(referenceImage);
        if (!refData) throw new Error('Ảnh mẫu tham chiếu không hợp lệ.');
        
        const finalParts = [
            { text: compositePrompt },
            { inlineData: { data: refData.base64, mimeType: refData.mimeType } },
            ...generatedCharacters.map(charData => ({ inlineData: charData }))
        ];
        
        const finalResponse = await ai.models.generateContent({
            model,
            contents: { parts: finalParts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const finalImagePart = finalResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!finalImagePart?.inlineData) throw new Error("AI không thể tổng hợp ảnh cuối cùng.");

        // Step 3: Upload final image and update database
        const finalImageBase64 = finalImagePart.inlineData.data;
        const finalImageMimeType = finalImagePart.inlineData.mimeType;

        const s3Client = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT!, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }});
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${userId}/group/${Date.now()}.${finalImageMimeType.split('/')[1] || 'png'}`;
        
        await (s3Client as any).send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: fileName, Body: imageBuffer, ContentType: finalImageMimeType }));
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
        
        const xpToAward = numCharacters * XP_PER_CHARACTER;

        await Promise.all([
             // WORKAROUND: Clean up the 'prompt' column by setting it to the user's text prompt.
             supabaseAdmin.from('generated_images').update({ image_url: publicUrl, prompt: payload.prompt }).eq('id', jobId),
             supabaseAdmin.rpc('increment_user_xp', { user_id_param: userId, xp_amount: xpToAward }),
             supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);
        
        console.log(`[WORKER ${jobId}] Job finalized successfully.`);

    } catch (error: any) {
        if (userId && totalCost > 0) {
            await failJob(jobId, error.message, userId, totalCost);
        } else {
             console.error(`[WORKER ${jobId}] Failed without user/cost info`, error);
        }
    }

    return { statusCode: 200 };
};

export { handler };