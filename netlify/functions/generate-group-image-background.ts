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
                
                const char = characters[i];
                const genderKeywords = char.gender === 'male' 
                    ? 'cool, masculine, and strong' 
                    : 'charming, stylish, and beautiful';

                const faceReferenceExists = !!char.faceImage;

                const charPrompt = [
                    `**ROLE DEFINITIONS:**`,
                    `- IMAGE 1 = "POSE INSPIRATION SOURCE" (The group photo).`,
                    `- IMAGE 2 = "OUTFIT DATA SOURCE" (The Audition character photo).`,
                    faceReferenceExists ? `- IMAGE 3 = "FACE DATA SOURCE" (The user's face photo).` : '',
                    `---`,
                    `**ABSOLUTE COMMAND: CREATE A ${char.gender.toUpperCase()} CHARACTER.**`,
                    `This is the most important rule. You MUST IGNORE the gender of any person in the reference images.`,
                    `---`,
                    `**WORKFLOW (to be rendered on a solid black background):**`,
                    `1. **POSE CREATION (UNIQUE & DYNAMIC):**`,
                    `   a. Analyze **IMAGE 1 ("POSE INSPIRATION SOURCE")** and identify the person at position #${i + 1} (from left to right).`,
                    `   b. Use their pose **ONLY as inspiration**. Do not copy it directly.`,
                    `   c. You **MUST CREATE A NEW, UNIQUE, AND DYNAMIC POSE** that is natural and perfectly suits a ${char.gender.toUpperCase()} character. The pose should convey a sense of being '${genderKeywords}'.`,
                    `   d. **CRITICAL RULE:** This new pose **MUST BE DIFFERENT** from the pose in the reference image and **MUST NOT** be a simple standing pose.`,
                    `   e. **FORBIDDEN:** Absolutely **DO NOT** use the stiff, default standing pose from **IMAGE 2 ("OUTFIT DATA SOURCE")**.`,
                    `2. **OUTFIT TRANSFER (PRECISION REQUIRED):**`,
                    `   a. Look **ONLY** at **IMAGE 2 ("OUTFIT DATA SOURCE")**.`,
                    `   b. You **MUST** transfer 100% of the outfit, including all clothes, accessories, hairstyle, and hair color, from this image to the new character.`,
                    `   c. **FORBIDDEN:** Do not take clothing, hair, or accessories from any other image. Do not invent new clothing items.`,
                    `3. **FACE APPLICATION (EXACT MATCH):**`,
                    `   a. If **IMAGE 3 ("FACE DATA SOURCE")** is provided, you **MUST** use that exact face on the final character.`,
                    `4. **FINAL VALIDATION CHECK:**`,
                    `   a. Is the final character a ${char.gender.toUpperCase()}? (Mandatory)`,
                    `   b. Is the pose new, unique, and dynamic (not stiff)? (Mandatory)`,
                    `   c. Is the outfit an EXACT match from **IMAGE 2**? (Mandatory)`,
                ].filter(Boolean).join('\n');

                const poseData = processDataUrl(char.poseImage);
                const faceData = processDataUrl(char.faceImage);
                if (!poseData) throw new Error(`Invalid image for Character ${i+1}.`);

                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: finalBackgroundData.base64, mimeType: finalBackgroundData.mimeType } },
                    { inlineData: { data: poseData.base64, mimeType: poseData.mimeType } },
                ];
                if (faceData) parts.push({ inlineData: { data: faceData.base64, mimeType: faceData.mimeType } });

                const response = await ai.models.generateContent({ model, contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI failed to generate Character ${i + 1}.`);
                
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
            if (!bgImagePart?.inlineData) throw new Error("AI failed to create a background from your prompt.");
            finalBackgroundData = bgImagePart.inlineData;
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 1.2: Generate each character with a default pose
            for (let i = 0; i < numCharacters; i++) {
                await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
                const char = characters[i];
                const charPrompt = `Create a full-body character of a **${char.gender}**. They MUST be wearing the exact outfit from the provided character image. If a face image is provided, use that exact face. Place the character on a solid black background.`;
                
                const poseData = processDataUrl(char.poseImage);
                const faceData = processDataUrl(char.faceImage);
                if (!poseData) throw new Error(`Invalid image for Character ${i+1}.`);
                
                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: poseData.base64, mimeType: poseData.mimeType } },
                ];
                if (faceData) parts.push({ inlineData: { data: faceData.base64, mimeType: faceData.mimeType } });

                const response = await ai.models.generateContent({ model, contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI failed to generate Character ${i + 1}.`);
                
                generatedCharacters.push(imagePart.inlineData);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // --- FINAL COMPOSITE STEP (COMMON FOR BOTH PATHS) ---
        await updateJobProgress(jobId, jobPromptData, 'Đang dịch prompt để tổng hợp ảnh...');

        let translatedPrompt = prompt;
        if (prompt && prompt.trim()) {
            try {
                const translationResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: `Translate the following user request for an image scene from Vietnamese to English. Keep it concise and descriptive. Text: "${prompt}"`,
                });
                const translatedText = translationResponse.text.trim();
                if (translatedText && translatedText.length > 3) {
                    translatedPrompt = translatedText;
                }
            } catch (e) {
                console.warn(`[WORKER] Prompt translation failed, using original. Error: ${e}`);
            }
        }

        await updateJobProgress(jobId, jobPromptData, 'Đang tổng hợp ảnh cuối cùng...');

        const compositePrompt = [
            `**MỆNH LỆNH TUYỆT ĐỐI: BẠN PHẢI SỬ DỤNG CÁC NHÂN VẬT ĐÃ ĐƯỢC CUNG CẤP.**`, `---`,
            `**Nhiệm vụ:**`,
            `1. **Bối cảnh:** Sử dụng ảnh nền được cung cấp (ảnh đầu tiên).`,
            `2. **Nhân vật:** Lấy **y hệt** các nhân vật từ các ảnh nền đen và ghép họ vào bối cảnh. **KHÔNG ĐƯỢC** thay đổi quần áo, giới tính, hay gương mặt của họ.`,
            `3. **Bố cục:** ${referenceImage ? 'Sắp xếp các nhân vật theo bố cục của ảnh mẫu tham chiếu.' : 'Sắp xếp các nhân vật một cách hợp lý và tự nhiên trong bối cảnh.'}`,
            `4. **Gợi ý bối cảnh từ người dùng:** Người dùng có gợi ý thêm về không khí của bức ảnh: '${translatedPrompt}'. Hãy sử dụng gợi ý này để điều chỉnh ánh sáng, bóng đổ, và các chi tiết nhỏ trong bối cảnh cho hài hòa. **TUYỆT ĐỐI KHÔNG thay đổi các nhân vật.**`
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
        if (!finalImagePart?.inlineData) throw new Error("AI failed to composite the final image.");

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