
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service'; 
import Jimp from 'jimp';

const XP_PER_CHARACTER = 5;

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

// Helper: Enforce Aspect Ratio by COVERING (Filling) the canvas with Grey
const enforceAspectRatioCanvas = async (dataUrl: string, targetAspectRatio: string): Promise<{ data: string; mimeType: string } | null> => {
     if (!dataUrl) return null;
     try {
        const [header, base64] = dataUrl.split(',');
        const imageBuffer = Buffer.from(base64, 'base64');
        const image = await (Jimp as any).read(imageBuffer);

        const [aspectW, aspectH] = targetAspectRatio.split(':').map(Number);
        const targetRatio = aspectW / aspectH;
        
        const MAX_DIM = 1024;
        let canvasW, canvasH;
        
        if (targetRatio > 1) {
            canvasW = MAX_DIM;
            canvasH = Math.round(MAX_DIM / targetRatio);
        } else {
            canvasH = MAX_DIM;
            canvasW = Math.round(MAX_DIM * targetRatio);
        }

        // GREY CANVAS (#808080) - Quan trọng: Phải là màu xám
        const newCanvas = new (Jimp as any)(canvasW, canvasH, '#808080');
        
        // USE COVER to fill the canvas completely (Crop excess) if it's a background
        image.cover(canvasW, canvasH);
        
        newCanvas.composite(image, 0, 0);
        
        const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
        const newBase64 = await newCanvas.getBase64Async(mime);
        
        return { data: newBase64.split(',')[1], mimeType: mime };

     } catch (e) {
         console.error("Error enforcing aspect ratio canvas:", e);
         return null;
     }
};

const processDataUrl = (dataUrl: string | null) => {
    if (!dataUrl) return null;
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return { data: base64, mimeType };
};

const updateJobProgress = async (jobId: string, currentPromptData: any, progressMessage: string) => {
    const newProgressData = { ...currentPromptData, progress: progressMessage };
    await supabaseAdmin.from('generated_images').update({ prompt: JSON.stringify(newProgressData) }).eq('id', jobId);
};


const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) return { statusCode: 200 };

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

        await updateJobProgress(jobId, jobPromptData, 'Máy chủ đang xử lý dữ liệu...');

        const { characters, referenceImage, prompt, style, aspectRatio, model: selectedModel, imageSize = '1K', useSearch = false, removeWatermark = false } = payload;
        const numCharacters = characters.length;
        
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
        
        let layoutImageUrl: string | null = null; 

        // --- STEP 1: PREPARE CHARACTER & LAYOUT ASSETS ---
        
        if (referenceImage) {
            layoutImageUrl = referenceImage;
            
            // If using reference image, we respect its layout but re-generate characters to match prompt vibe
            for (let i = 0; i < numCharacters; i++) {
                await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
                
                const char = characters[i];
                const isMale = char.gender === 'male';
                
                // DYNAMIC POSE PROMPT WITH VIBE
                const vibe = isMale ? 'Cool, confident, masculine, strong' : 'Muse-like, graceful, girly ("bánh bèo"), sexy';
                
                const charPrompt = [
                    `Create a full-body 3D character of a **${char.gender}**.`,
                    `**OUTFIT:** Strictly maintain the outfit from the input image.`,
                    `**POSE & VIBE:** Pose must be **${vibe}**. Action fits scene: "${prompt}".`,
                    `**EXPRESSION:** Subtle, natural smile. No exaggerated emotions.`,
                    `**STYLE:** 3D Render. Neutral lighting. Solid Grey Background.`,
                ].join('\n');

                const poseData = processDataUrl(char.poseImage);
                const faceData = processDataUrl(char.faceImage);
                const refData = processDataUrl(referenceImage); 

                if (!poseData) throw new Error(`Lỗi dữ liệu ảnh dáng nhân vật ${i+1}.`);

                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: refData!.data, mimeType: refData!.mimeType } }, // Ref helps with scale/position
                    { inlineData: { data: poseData.data, mimeType: poseData.mimeType } },
                ];
                if (faceData) parts.push({ inlineData: { data: faceData.data, mimeType: faceData.mimeType } });

                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI không thể tạo nhân vật ${i + 1}.`);
                
                generatedCharacters.push(imagePart.inlineData);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

        } else {
            // Generate Background from Prompt First (Strict Ratio)
            await updateJobProgress(jobId, jobPromptData, 'Đang tạo bối cảnh từ prompt...');
            const bgPrompt = `Create a high-quality, cinematic background scene: "${prompt}". Style: "${style}". NO people. Ratio: ${aspectRatio}.`;
            
            const bgConfig: any = { 
                responseModalities: [Modality.IMAGE],
                imageConfig: { aspectRatio: aspectRatio } // Enforce ratio on background creation
            };
            
            if (isPro) {
                 bgConfig.imageConfig.imageSize = imageSize;
                 if (useSearch) bgConfig.tools = [{ googleSearch: {} }];
            }

            const bgResponse = await ai.models.generateContent({ model: modelName, contents: { parts: [{ text: bgPrompt }] }, config: bgConfig });
            const bgImagePart = bgResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!bgImagePart?.inlineData?.data) throw new Error("AI không thể tạo bối cảnh nền.");
            
            layoutImageUrl = `data:${bgImagePart.inlineData.mimeType};base64,${bgImagePart.inlineData.data}`;

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Generate characters with context
            for (let i = 0; i < numCharacters; i++) {
                await updateJobProgress(jobId, jobPromptData, `Đang xử lý nhân vật ${i + 1}/${numCharacters}...`);
                const char = characters[i];
                const isMale = char.gender === 'male';
                const vibe = isMale ? 'Cool, confident, masculine' : 'Graceful, girly, sexy';
                
                const charPrompt = `Create a full-body character of a **${char.gender}**. VIBE: ${vibe}. POSE: Dynamic, natural, interacting in scene "${prompt}". Maintain OUTFIT. Neutral lighting. Grey BG.`;
                
                const poseData = processDataUrl(char.poseImage);
                if (!poseData) throw new Error(`Lỗi dữ liệu ảnh dáng nhân vật ${i+1}.`);
                
                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: poseData.data, mimeType: poseData.mimeType } },
                ];
                
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI không thể tạo nhân vật ${i + 1}.`);
                
                generatedCharacters.push(imagePart.inlineData);
            }
        }
        
        if (!layoutImageUrl) throw new Error("Lỗi xử lý ảnh nền.");

        // --- STEP 2: COMPOSE ON PROCESSED CANVAS ---
        await updateJobProgress(jobId, jobPromptData, 'Đang tổng hợp và hòa trộn cảm xúc...');
        
        // This creates the RIGID GREY CANVAS structure (CROP/COVER if needed)
        const processedLayout = await enforceAspectRatioCanvas(layoutImageUrl, aspectRatio);
        
        if (!processedLayout) throw new Error("Lỗi xử lý khung hình (Canvas).");

        // --- STEP 3: FINAL BLEND (THE MAGIC STEP) ---
        const compositePrompt = [
            `**TASK: GROUP PHOTO COMPOSITION (HYPER-REALISTIC 3D RENDER)**`,
            `**ASPECT RATIO IS LAW:** The input [CANVAS_WITH_CHARACTER_AND_GREY_BG] sets the absolute size. DO NOT CHANGE IT.`,
            `---`,
            `**CRITICAL: VIBE & SOUL**`,
            `1. **MALE CHARACTERS:** Must look Cool, Confident, Masculine, Strong.`,
            `2. **FEMALE CHARACTERS:** Must look Muse-like, Graceful, Girly ("Bánh bèo"), Charming, Sexy.`,
            `3. **EXPRESSIONS:** Subtle, natural smiles. DO NOT DISTORT FACES. No creepy smiles.`,
            `4. **INTERACTION:** Characters MUST interact (leaning, touching, looking at each other). NO static "mannequin" poses.`,
            `---`,
            `**TECHNICAL EXECUTION:**`,
            `1. **ANCHOR:** Place characters firmly on the ground of the background.`,
            `2. **RELIGHT:** Use global illumination to blend characters into the scene.`,
            `3. **OUTFIT:** Preserve outfit details from inputs.`,
            `4. **STYLE:** Hyper-realistic 3D Render (Audition Game High-End).`
        ].join('\n');
        
        const finalParts = [
            { text: compositePrompt },
            { text: "[CANVAS_WITH_CHARACTER_AND_GREY_BG]" },
            { inlineData: { data: processedLayout.data, mimeType: processedLayout.mimeType } },
            ...generatedCharacters.map((charData, idx) => ({ 
                inlineData: charData 
            }))
        ];
        
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

        let imageBuffer = Buffer.from(finalImageBase64, 'base64');
        if (!removeWatermark) {
            const siteUrl = process.env.URL || 'https://auditionai.io.vn';
            const watermarkUrl = `${siteUrl}/watermark.png`;
            imageBuffer = await addSmartWatermark(imageBuffer, watermarkUrl);
        }

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
