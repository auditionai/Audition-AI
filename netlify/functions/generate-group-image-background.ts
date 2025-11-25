
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service'; 
import Jimp from 'jimp';

const XP_PER_CHARACTER = 5;

// FIX: Refund logic using Direct Database Update instead of RPC
const failJob = async (jobId: string, reason: string, userId: string, cost: number) => {
    console.error(`[WORKER] Failing job ${jobId}. Reason: ${reason}. Refunding: ${cost}`);
    try {
        // 1. Fetch fresh user data
        const { data: userNow } = await supabaseAdmin.from('users').select('diamonds').eq('id', userId).single();
        
        if (userNow) {
            const refundBalance = userNow.diamonds + cost;
            
            // 2. Perform Refund Update
            await Promise.all([
                supabaseAdmin.from('generated_images').delete().eq('id', jobId),
                supabaseAdmin.from('users').update({ diamonds: refundBalance }).eq('id', userId),
                supabaseAdmin.from('diamond_transactions_log').insert({
                    user_id: userId,
                    amount: cost,
                    transaction_type: 'REFUND',
                    description: `Hoàn tiền tạo ảnh nhóm thất bại (Lỗi: ${reason.substring(0, 50)})`,
                })
            ]);
            console.log(`[WORKER] Refund successful for ${userId}`);
        }
    } catch (e) {
        console.error(`[WORKER] CRITICAL: Failed to clean up or refund for job ${jobId}`, e);
    }
};

// Helper to fetch image from URL and return base64 (Just In Time)
const fetchImageToBase64 = async (url: string | null): Promise<{ data: string; mimeType: string } | null> => {
    if (!url) return null;
    
    // Check if it's already base64 (Legacy support or small images)
    if (url.startsWith('data:')) {
        const [header, base64] = url.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        return { data: base64, mimeType };
    }

    // It's a URL
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/png';
        return { data: base64, mimeType };
    } catch (e) {
        console.warn("Failed to fetch image from URL:", url, e);
        return null;
    }
}

// Helper: Enforce Aspect Ratio by COVERING (Filling) the canvas with Grey
const enforceAspectRatioCanvas = async (data: { data: string; mimeType: string } | null, targetAspectRatio: string): Promise<{ data: string; mimeType: string } | null> => {
     if (!data) return null;
     try {
        const imageBuffer = Buffer.from(data.data, 'base64');
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

        // GREY CANVAS (#808080)
        const newCanvas = new (Jimp as any)(canvasW, canvasH, '#808080');
        
        // USE COVER to fill the canvas completely
        image.cover(canvasW, canvasH);
        
        newCanvas.composite(image, 0, 0);
        
        const mime = data.mimeType || 'image/png';
        const newBase64 = await newCanvas.getBase64Async(mime);
        
        return { data: newBase64.split(',')[1], mimeType: mime };

     } catch (e) {
         console.warn("[WORKER] Aspect Ratio Enforcement Failed (Falling back to raw image):", e);
         return data; 
     }
};

const updateJobProgress = async (jobId: string, currentPromptData: any, progressMessage: string) => {
    try {
        const newProgressData = { ...currentPromptData, progress: progressMessage };
        await supabaseAdmin.from('generated_images').update({ prompt: JSON.stringify(newProgressData) }).eq('id', jobId);
    } catch (e) {
        console.warn("Failed to update progress:", e);
    }
};


const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) return { statusCode: 200 };

    let jobPromptData, payload, userId;
    let totalCost = 0;

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
        
        const { characters, model: selectedModel, imageSize = '1K', removeWatermark = false } = payload;
        const numCharacters = characters?.length || 0;
        
        let baseCost = 1;
        if (selectedModel === 'pro') {
            if (imageSize === '4K') baseCost = 20;
            else if (imageSize === '2K') baseCost = 15;
            else baseCost = 10;
        }
        totalCost = baseCost + numCharacters;
        if (removeWatermark) totalCost += 1;

        await updateJobProgress(jobId, jobPromptData, 'Máy chủ đang xử lý dữ liệu...');

        const { referenceImage, prompt, style, aspectRatio, useSearch = false } = payload;

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const modelName = selectedModel === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
        const isPro = selectedModel === 'pro';
        
        const generatedCharacters = [];
        let layoutData: { data: string; mimeType: string } | null = null;

        // --- STEP 1: PREPARE CHARACTER & LAYOUT ASSETS ---
        
        if (referenceImage) {
            // If reference image exists, fetch it and set as layout base
            layoutData = await fetchImageToBase64(referenceImage);
            
            // PARALLEL GENERATION FOR CHARACTERS
            await updateJobProgress(jobId, jobPromptData, `Đang xử lý đồng thời ${numCharacters} nhân vật...`);
            
            const charPromises = characters.map(async (char: any, i: number) => {
                try {
                    const isMale = char.gender === 'male';
                    const vibe = isMale ? 'Cool, confident, masculine, strong' : 'Muse-like, graceful, girly ("bánh bèo"), sexy';
                    
                    const charPrompt = [
                        `Create a full-body 3D character of a **${char.gender}**.`,
                        `**OUTFIT:** Strictly maintain the outfit from the input image.`,
                        `**POSE & VIBE:** Pose must be **${vibe}**. Action fits scene: "${prompt}".`,
                        `**EXPRESSION:** Subtle, natural smile. No exaggerated emotions.`,
                        `**STYLE:** 3D Render. Neutral lighting. Solid Grey Background.`,
                    ].join('\n');

                    // Fetch images in parallel
                    const [poseData, faceData, refData] = await Promise.all([
                        fetchImageToBase64(char.poseImage),
                        fetchImageToBase64(char.faceImage),
                        fetchImageToBase64(referenceImage)
                    ]);

                    if (!poseData || !refData) throw new Error(`Lỗi tải ảnh nhân vật ${i+1}.`);

                    const parts: any[] = [
                        { text: charPrompt },
                        { inlineData: { data: refData.data, mimeType: refData.mimeType } },
                        { inlineData: { data: poseData.data, mimeType: poseData.mimeType } },
                    ];
                    if (faceData) parts.push({ inlineData: { data: faceData.data, mimeType: faceData.mimeType } });

                    const response = await ai.models.generateContent({ 
                        model: 'gemini-2.5-flash-image', 
                        contents: { parts }, 
                        config: { responseModalities: [Modality.IMAGE] } 
                    });
                    
                    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                    if (!imagePart?.inlineData) throw new Error(`AI không thể tạo nhân vật ${i + 1}.`);
                    
                    return imagePart.inlineData;
                } catch (charErr) {
                    console.error(`Error generating character ${i}:`, charErr);
                    throw charErr;
                }
            });

            const results = await Promise.all(charPromises);
            generatedCharacters.push(...results);

        } else {
            // Generate Background First
            await updateJobProgress(jobId, jobPromptData, 'Đang tạo bối cảnh từ prompt...');
            
            // [STRICT] FORCE EMPTY BACKGROUND
            const bgPrompt = `Create a high-quality, cinematic background scene: "${prompt}". Style: "${style}". EXTREMELY IMPORTANT: EMPTY SCENE, NO PEOPLE, NO CHARACTERS, NO CROWDS. Just the environment. Ratio: ${aspectRatio}.`;
            
            const bgConfig: any = { 
                responseModalities: [Modality.IMAGE],
                imageConfig: { aspectRatio: aspectRatio } 
            };
            
            if (isPro) {
                 bgConfig.imageConfig.imageSize = imageSize;
                 if (useSearch) bgConfig.tools = [{ googleSearch: {} }];
            }

            const bgResponse = await ai.models.generateContent({ model: modelName, contents: { parts: [{ text: bgPrompt }] }, config: bgConfig });
            const bgImagePart = bgResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!bgImagePart?.inlineData?.data) throw new Error("AI không thể tạo bối cảnh nền.");
            
            layoutData = { data: bgImagePart.inlineData.data, mimeType: bgImagePart.inlineData.mimeType };

            // Generate characters in PARALLEL
            await updateJobProgress(jobId, jobPromptData, `Đang xử lý đồng thời ${numCharacters} nhân vật...`);
            
            const charPromises = characters.map(async (char: any, i: number) => {
                const isMale = char.gender === 'male';
                const vibe = isMale ? 'Cool, confident, masculine, strong, stylish' : 'Muse-like, graceful, girly ("bánh bèo"), sexy, charming';
                
                const charPrompt = `Create a full-body character of a **${char.gender}**. VIBE: ${vibe}. POSE: Dynamic, natural, interacting in scene "${prompt}". Maintain OUTFIT. Neutral lighting. Grey BG.`;
                
                const poseData = await fetchImageToBase64(char.poseImage);
                if (!poseData) throw new Error(`Lỗi tải ảnh nhân vật ${i+1}.`);
                
                const parts = [
                    { text: charPrompt },
                    { inlineData: { data: poseData.data, mimeType: poseData.mimeType } },
                ];
                
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts }, config: { responseModalities: [Modality.IMAGE] } });
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI không thể tạo nhân vật ${i + 1}.`);
                
                return imagePart.inlineData;
            });

            const results = await Promise.all(charPromises);
            generatedCharacters.push(...results);
        }
        
        if (!layoutData) throw new Error("Lỗi xử lý ảnh nền.");

        // --- STEP 2: COMPOSE ON PROCESSED CANVAS ---
        await updateJobProgress(jobId, jobPromptData, 'Đang tổng hợp và hòa trộn cảm xúc...');
        
        const finalLayout = await enforceAspectRatioCanvas(layoutData, aspectRatio);
        if (!finalLayout) throw new Error("Lỗi xử lý layout canvas.");

        // --- STEP 3: FINAL BLEND ---
        // [STRICT] Force Quantity Constraint
        const compositePrompt = [
            `**TASK: GROUP PHOTO COMPOSITION (HYPER-REALISTIC 3D RENDER)**`,
            `**STRICT QUANTITY CONTROL:** The final image MUST contain EXACTLY ${numCharacters} main characters.`,
            `**ABSOLUTE PROHIBITION:** Do NOT generate any extra people, bystanders, crowds, or background characters. The background must remain strictly environmental as provided.`,
            `**ASPECT RATIO IS LAW:** The input [CANVAS_WITH_CHARACTER_AND_GREY_BG] sets the absolute size. DO NOT CHANGE IT.`,
            `---`,
            `**CRITICAL: VIBE & SOUL**`,
            `1. **MALE CHARACTERS:** Must look Cool, Confident, Masculine, Strong.`,
            `2. **FEMALE CHARACTERS:** Must look Muse-like, Graceful, Girly ("Bánh bèo"), Charming, Sexy.`,
            `3. **EXPRESSIONS:** Subtle, natural smiles. DO NOT DISTORT FACES.`,
            `4. **INTERACTION:** Characters MUST interact (leaning, touching, looking at each other).`,
            `---`,
            `**TECHNICAL EXECUTION:**`,
            `1. **ANCHOR:** Place characters firmly on the ground.`,
            `2. **RELIGHT:** Use global illumination.`,
            `3. **OUTFIT:** Preserve outfit details from input.`,
            `4. **STYLE:** Hyper-realistic 3D Render (Audition Game High-End).`,
            `--no extra people, crowd, audience, bystanders, distorted faces, bad anatomy, blurry, low quality`
        ].join('\n');
        
        const finalParts = [
            { text: compositePrompt },
            { text: "[CANVAS_WITH_CHARACTER_AND_GREY_BG]" },
            { inlineData: { data: finalLayout.data, mimeType: finalLayout.mimeType } },
            ...generatedCharacters.map((charData) => ({ 
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
             console.error(`[WORKER ${jobId}] Failed without user/cost info. No refund possible. Error:`, error);
        }
    }

    return { statusCode: 200 };
};

export { handler };
