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
        
        const refData = processDataUrl(referenceImage);
        if (!refData) throw new Error('Ảnh mẫu tham chiếu không hợp lệ.');

        // Step 1: Generate each character individually
        for (let i = 0; i < numCharacters; i++) {
            await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
            
            const char = characters[i];
            const charPrompt = [
                `**MỆNH LỆNH TUYỆT ĐỐI: BẠN PHẢI TẠO RA MỘT NHÂN VẬT ${char.gender === 'male' ? 'NAM' : 'NỮ'}.**`,
                `Đây là yêu cầu quan trọng nhất và không thể thay đổi. Hãy **bỏ qua hoàn toàn** giới tính của bất kỳ ai trong các ảnh tham chiếu.`,
                `---`,
                `**QUY TRÌNH TẠO NHÂN VẬT (TRÊN NỀN ĐEN TUYỀN):**`,
                `1. **XÁC ĐỊNH TƯ THẾ:**`,
                `   - Nhìn vào **Ảnh Mẫu Tham Chiếu** (ảnh nhóm).`,
                `   - Tìm người ở vị trí thứ ${i + 1} từ trái sang.`,
                `   - **SAO CHÉP Y HỆT 100% TƯ THẾ** của người đó. Chỉ lấy tư thế, không lấy bất cứ thứ gì khác.`,
                
                `2. **LẤY TRANG PHỤC:**`,
                `   - Nhìn vào **Ảnh Nhân Vật Audition**.`,
                `   - **BÊ NGUYÊN** toàn bộ trang phục, phụ kiện, giày dép từ ảnh này và mặc cho nhân vật bạn đang tạo. **CẤM** thay đổi trang phục.`,
                
                `3. **LẤY GƯƠNG MẶT (nếu có):**`,
                `   - Nếu có **Ảnh Gương Mặt** riêng, hãy sử dụng chính xác gương mặt đó.`,
                
                `4. **KIỂM TRA LẠI GIỚI TÍNH:**`,
                `   - Trước khi hoàn thành, hãy đảm bảo nhân vật cuối cùng chắc chắn là **${char.gender === 'male' ? 'NAM' : 'NỮ'}** như mệnh lệnh đầu tiên.`,
                
                `**KẾT QUẢ:** Một nhân vật **${char.gender === 'male' ? 'NAM' : 'NỮ'}** duy nhất, đứng trên nền đen, có tư thế từ ảnh mẫu và trang phục từ ảnh nhân vật Audition.`,
            ].join('\n');

            const poseData = processDataUrl(char.poseImage);
            const faceData = processDataUrl(char.faceImage);

            if (!poseData) throw new Error(`Ảnh nhân vật ${i+1} không hợp lệ.`);

            const parts = [
                { text: charPrompt },
                // Image order is important for the AI's understanding.
                // 1. Reference image (for context and pose)
                { inlineData: { data: refData.base64, mimeType: refData.mimeType } },
                // 2. Character image (for outfit)
                { inlineData: { data: poseData.base64, mimeType: poseData.mimeType } },
            ];
            if (faceData) {
                // 3. Face image
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