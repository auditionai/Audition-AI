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
        
        // --- LOGIC FORK: DEPENDS ON WHETHER A REFERENCE IMAGE IS PROVIDED ---
        let finalBackgroundData;

        if (referenceImage) {
             // --- PATH A: Using a Reference Image ---
            finalBackgroundData = processDataUrl(referenceImage);
            if (!finalBackgroundData) throw new Error('Ảnh mẫu tham chiếu không hợp lệ.');

            // Step 1.1: Generate each character individually, copying pose from reference
            for (let i = 0; i < numCharacters; i++) {
                await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
                // (Same prompt as before)
                const char = characters[i];
                const charPrompt = [
                    `**MỆNH LỆNH TUYỆT ĐỐI: BẠN PHẢI TẠO RA MỘT NHÂN VẬT ${char.gender === 'male' ? 'NAM' : 'NỮ'}.**`,
                    `Đây là yêu cầu quan trọng nhất. Hãy **bỏ qua hoàn toàn** giới tính của bất kỳ ai trong các ảnh tham chiếu.`, `---`,
                    `**QUY TRÌNH (TRÊN NỀN ĐEN TUYỀN):**`,
                    `1. **LẤY DÁNG:** Nhìn vào **Ảnh Mẫu Tham Chiếu**, tìm người ở vị trí thứ ${i + 1} từ trái sang và **CHỈ SAO CHÉP TƯ THẾ** của họ.`,
                    `2. **MẶC ĐỒ:** Nhìn vào **Ảnh Nhân Vật Audition** và **BÊ NGUYÊN** trang phục. **CẤM** thay đổi.`,
                    `3. **LẤY MẶT:** Nếu có **Ảnh Gương Mặt**, hãy dùng chính xác mặt đó.`,
                    `4. **KIỂM TRA LẠI:** Đảm bảo nhân vật cuối cùng là **${char.gender === 'male' ? 'NAM' : 'NỮ'}**.`,
                ].join('\n');

                const poseData = processDataUrl(char.poseImage);
                const faceData = processDataUrl(char.faceImage);
                if (!poseData) throw new Error(`Ảnh nhân vật ${i+1} không hợp lệ.`);

                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: finalBackgroundData.base64, mimeType: finalBackgroundData.mimeType } },
                    { inlineData: { data: poseData.base64, mimeType: poseData.mimeType } },
                ];
                if (faceData) parts.push({ inlineData: { data: faceData.base64, mimeType: faceData.mimeType } });

                const response = await ai.models.generateContent({ model, contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI không thể tạo được nhân vật ${i + 1}.`);
                
                generatedCharacters.push(imagePart.inlineData);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

        } else {
            // --- PATH B: No Reference Image, Prompt-only ---
            // Step 1.1: Generate a background first
            await updateJobProgress(jobId, jobPromptData, 'Đang tạo bối cảnh từ prompt...');
            const bgPrompt = `Create a high-quality, cinematic background scene described as: "${prompt}". The scene should have a style of "${style}". Do NOT include any people or characters.`;
            const bgResponse = await ai.models.generateContent({ model, contents: { parts: [{ text: bgPrompt }] }, config: { responseModalities: [Modality.IMAGE] } });
            const bgImagePart = bgResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!bgImagePart?.inlineData) throw new Error("AI không thể tạo bối cảnh từ prompt của bạn.");
            finalBackgroundData = bgImagePart.inlineData;
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 1.2: Generate each character with a default pose
            for (let i = 0; i < numCharacters; i++) {
                await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
                const char = characters[i];
                const charPrompt = `Create a full-body character of a **${char.gender}**. They MUST be wearing the exact outfit from the provided character image. If a face image is provided, use that exact face. Place the character on a solid black background.`;
                
                const poseData = processDataUrl(char.poseImage);
                const faceData = processDataUrl(char.faceImage);
                if (!poseData) throw new Error(`Ảnh nhân vật ${i+1} không hợp lệ.`);
                
                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: poseData.base64, mimeType: poseData.mimeType } },
                ];
                if (faceData) parts.push({ inlineData: { data: faceData.base64, mimeType: faceData.mimeType } });

                const response = await ai.models.generateContent({ model, contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI không thể tạo được nhân vật ${i + 1}.`);
                
                generatedCharacters.push(imagePart.inlineData);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // --- FINAL COMPOSITE STEP (COMMON FOR BOTH PATHS) ---
        await updateJobProgress(jobId, jobPromptData, 'Đang tổng hợp ảnh cuối cùng...');

        const compositePrompt = [
            `**MỆNH LỆNH TUYỆT ĐỐI: BẠN PHẢI SỬ DỤNG CÁC NHÂN VẬT ĐÃ ĐƯỢC CUNG CẤP.**`, `---`,
            `**Nhiệm vụ:**`,
            `1. **Bối cảnh:** Sử dụng ảnh nền được cung cấp (ảnh đầu tiên).`,
            `2. **Nhân vật:** Lấy **y hệt** các nhân vật từ các ảnh nền đen và ghép họ vào bối cảnh. **KHÔNG ĐƯỢC** thay đổi quần áo, giới tính, hay gương mặt của họ.`,
            `3. **Bố cục:** ${referenceImage ? 'Sắp xếp các nhân vật theo bố cục của ảnh mẫu tham chiếu.' : 'Sắp xếp các nhân vật một cách hợp lý và tự nhiên trong bối cảnh.'}`,
            `4. **Gợi ý bối cảnh từ người dùng:** Người dùng có gợi ý thêm về không khí của bức ảnh: '${prompt}'. Hãy sử dụng gợi ý này để điều chỉnh ánh sáng, bóng đổ, và các chi tiết nhỏ trong bối cảnh để tạo sự hòa hợp, **nhưng không được thay đổi các nhân vật.**`
        ].join('\n');
        
        const finalParts = [
            { text: compositePrompt },
            { inlineData: { data: finalBackgroundData.base64, mimeType: finalBackgroundData.mimeType } },
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