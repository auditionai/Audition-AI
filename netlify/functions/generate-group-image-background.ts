
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from 'jimp';

const XP_PER_CHARACTER = 5;

// Watermark Function (Fixed for Serverless/Netlify)
const addWatermark = async (imageBuffer: Buffer): Promise<Buffer> => {
    try {
        console.log("Starting watermark process (group)...");
        const image = await (Jimp as any).read(imageBuffer);
        
        // FIX: Use reliable GitHub Raw URLs for fonts
        const FONT_SMALL_URL = "https://raw.githubusercontent.com/jimp-dev/jimp/master/packages/plugin-print/fonts/open-sans/open-sans-16-white/open-sans-16-white.fnt";
        const FONT_LARGE_URL = "https://raw.githubusercontent.com/jimp-dev/jimp/master/packages/plugin-print/fonts/open-sans/open-sans-32-white/open-sans-32-white.fnt";

        const [fontSmall, fontLarge] = await Promise.all([
            (Jimp as any).loadFont(FONT_SMALL_URL),
            (Jimp as any).loadFont(FONT_LARGE_URL)
        ]);
        
        const textTop = "Created by";
        const textBottom = "AUDITION AI";
        
        const widthTop = (Jimp as any).measureText(fontSmall, textTop);
        const widthBottom = (Jimp as any).measureText(fontLarge, textBottom);
        
        const heightTop = (Jimp as any).measureTextHeight(fontSmall, textTop, 1000);
        const heightBottom = (Jimp as any).measureTextHeight(fontLarge, textBottom, 1000);
        
        const padding = 10;
        const boxWidth = Math.max(widthTop, widthBottom) + (padding * 2);
        const boxHeight = heightTop + heightBottom + (padding * 1.5); 
        
        const margin = 20;
        const x = image.getWidth() - boxWidth - margin;
        const y = image.getHeight() - boxHeight - margin;
        
        // 0x000000AA = Black ~66% opacity
        const bgImage = new (Jimp as any)(boxWidth, boxHeight, 0x000000AA);
        
        image.composite(bgImage, x, y);
        
        const xTop = x + (boxWidth - widthTop) / 2;
        const xBottom = x + (boxWidth - widthBottom) / 2;
        
        image.print(fontSmall, xTop, y + padding, textTop);
        image.print(fontLarge, xBottom, y + padding + heightTop - 4, textBottom); 

        console.log("Watermark added successfully (group).");
        return await image.getBufferAsync((Jimp as any).MIME_PNG);
    } catch (error) {
        console.error("Failed to add watermark in group worker:", error);
        return imageBuffer;
    }
};

const failJob = async (jobId: string, reason: string, userId: string, cost: number) => {
    console.error(`[WORKER] Failing job ${jobId}: ${reason}`);
    try {
        await Promise.all([
            supabaseAdmin.from('generated_images').delete().eq('id', jobId),
            supabaseAdmin.rpc('increment_user_diamonds', { user_id_param: userId, diamond_amount: cost }),
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

        jobPromptData = JSON.parse(jobData.prompt);
        payload = jobPromptData.payload;
        userId = jobData.user_id;

        const { characters, referenceImage, prompt, style, aspectRatio, model: selectedModel, imageSize = '1K', useSearch = false, removeWatermark = false } = payload;
        const numCharacters = characters.length;
        
        // Sync this cost logic with generate-group-image.ts
        let baseCost = 1;
        if (selectedModel === 'pro') {
            if (imageSize === '4K') baseCost = 20;
            else if (imageSize === '2K') baseCost = 15;
            else baseCost = 10;
        }
        totalCost = baseCost + numCharacters;
        if (removeWatermark) totalCost += 1;

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const modelName = selectedModel === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
        const isPro = selectedModel === 'pro';
        
        const generatedCharacters = [];
        let finalBackgroundData;

        if (referenceImage) {
            finalBackgroundData = processDataUrl(referenceImage);
            if (!finalBackgroundData) throw new Error('Ảnh mẫu tham chiếu không hợp lệ.');

            for (let i = 0; i < numCharacters; i++) {
                await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
                
                const char = characters[i];
                const faceReferenceExists = !!char.faceImage;

                const charPrompt = [
                    `**ROLE DEFINITIONS:**`,
                    `Create a full body character of a ${char.gender} based on the reference pose and outfit provided.`,
                    faceReferenceExists ? `Use the face from the provided face image.` : '',
                    `Render on a solid black background.`
                ].join('\n');

                const poseData = processDataUrl(char.poseImage);
                const faceData = processDataUrl(char.faceImage);
                if (!poseData) throw new Error(`Invalid image for Character ${i+1}.`);

                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: finalBackgroundData.base64, mimeType: finalBackgroundData.mimeType } },
                    { inlineData: { data: poseData.base64, mimeType: poseData.mimeType } },
                ];
                if (faceData) parts.push({ inlineData: { data: faceData.base64, mimeType: faceData.mimeType } });

                // Use standard config for intermediate steps to save cost and time
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI failed to generate Character ${i + 1}.`);
                
                generatedCharacters.push(imagePart.inlineData);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

        } else {
            // --- No Reference Image ---
            await updateJobProgress(jobId, jobPromptData, 'Đang tạo bối cảnh từ prompt...');
            const bgPrompt = `Create a high-quality, cinematic background scene described as: "${prompt}". The scene should have a style of "${style}". Do NOT include any people or characters.`;
            
            // Ensure proper config for background generation
            const bgConfig: any = { responseModalities: [Modality.IMAGE] };
            if (isPro) {
                 bgConfig.imageConfig = { imageSize, aspectRatio };
                 if (useSearch) bgConfig.tools = [{ googleSearch: {} }];
            }

            const bgResponse = await ai.models.generateContent({ model: modelName, contents: { parts: [{ text: bgPrompt }] }, config: bgConfig });
            const bgImagePart = bgResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!bgImagePart?.inlineData) throw new Error("AI failed to create a background from your prompt.");
            finalBackgroundData = bgImagePart.inlineData;
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Generate characters (standard model)
            for (let i = 0; i < numCharacters; i++) {
                await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
                const char = characters[i];
                const charPrompt = `Create a full-body character of a **${char.gender}**. They MUST be wearing the exact outfit from the provided character image. Place the character on a solid black background.`;
                
                const poseData = processDataUrl(char.poseImage);
                if (!poseData) throw new Error(`Invalid image for Character ${i+1}.`);
                
                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: poseData.base64, mimeType: poseData.mimeType } },
                ];
                
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI failed to generate Character ${i + 1}.`);
                
                generatedCharacters.push(imagePart.inlineData);
            }
        }
        
        // --- FINAL COMPOSITE STEP ---
        await updateJobProgress(jobId, jobPromptData, 'Đang tổng hợp ảnh cuối cùng...');

        const compositePrompt = [
            `**MỆNH LỆNH TUYỆT ĐỐI: BẠN PHẢI SỬ DỤNG CÁC NHÂN VẬT ĐÃ ĐƯỢC CUNG CẤP.**`, `---`,
            `**Nhiệm vụ:**`,
            `1. **Bối cảnh:** Sử dụng ảnh nền được cung cấp (ảnh đầu tiên).`,
            `2. **Nhân vật:** Lấy **y hệt** các nhân vật từ các ảnh nền đen và ghép họ vào bối cảnh.`,
            `3. **Bố cục:** Sắp xếp các nhân vật một cách hợp lý và tự nhiên trong bối cảnh.`
        ].join('\n');
        
        const finalParts = [
            { text: compositePrompt },
            { inlineData: { data: finalBackgroundData.base64, mimeType: finalBackgroundData.mimeType } },
            ...generatedCharacters.map(charData => ({ inlineData: charData }))
        ];
        
        // Final Config: Apply strict Pro config if selected
        const finalConfig: any = { 
            responseModalities: [Modality.IMAGE] 
        };

        if (isPro) {
            finalConfig.imageConfig = {
                aspectRatio: aspectRatio,
                imageSize: imageSize
            };
            if (useSearch) {
                finalConfig.tools = [{ googleSearch: {} }];
            }
        }

        const finalResponse = await ai.models.generateContent({
            model: modelName,
            contents: { parts: finalParts },
            config: finalConfig,
        });

        const finalImagePart = finalResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!finalImagePart?.inlineData) throw new Error("AI failed to composite the final image.");

        const finalImageBase64 = finalImagePart.inlineData.data;
        const finalImageMimeType = finalImagePart.inlineData.mimeType;

        // --- WATERMARK LOGIC ---
        let imageBuffer = Buffer.from(finalImageBase64, 'base64');
        if (!removeWatermark) {
            imageBuffer = await addWatermark(imageBuffer);
        }
        // --- END WATERMARK LOGIC ---

        const s3Client = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT!, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }});
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
