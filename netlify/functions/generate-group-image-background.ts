
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service'; 

const XP_PER_CHARACTER = 5;

// FIX: Refund logic using Direct Database Update instead of RPC
const failJob = async (jobId: string, reason: string, userId: string, cost: number) => {
    console.error(`[WORKER] Failing job ${jobId}. Reason: ${reason}. Refunding: ${cost}`);
    try {
        const { data: userNow } = await supabaseAdmin.from('users').select('diamonds').eq('id', userId).single();
        if (userNow) {
            const refundBalance = userNow.diamonds + cost;
            await Promise.all([
                supabaseAdmin.from('generated_images').delete().eq('id', jobId),
                supabaseAdmin.from('users').update({ diamonds: refundBalance }).eq('id', userId),
                supabaseAdmin.from('diamond_transactions_log').insert({
                    user_id: userId,
                    amount: cost,
                    transaction_type: 'REFUND',
                    description: `Hoàn tiền lỗi tạo ảnh: ${reason.substring(0, 50)}`,
                })
            ]);
            console.log(`[WORKER] Refund successful for ${userId}`);
        }
    } catch (e) {
        console.error(`[WORKER] CRITICAL: Failed to clean up or refund for job ${jobId}`, e);
    }
};

const fetchImageToBase64 = async (url: string | null): Promise<{ data: string; mimeType: string } | null> => {
    if (!url) return null;
    if (url.startsWith('data:')) {
        const [header, base64] = url.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        return { data: base64, mimeType };
    }
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
        let masterLayoutData: { data: string; mimeType: string } | null = null;

        // --- BƯỚC 1: LẤY MASTER CANVAS (ĐÃ PRE-PROCESS Ở CLIENT) ---
        await updateJobProgress(jobId, jobPromptData, 'Đang thiết lập khung tranh chuẩn...');
        
        // The referenceImage URL is now GUARANTEED to be the master canvas (either user ref or blank)
        if (referenceImage) {
            masterLayoutData = await fetchImageToBase64(referenceImage);
        } else {
            // Should typically not happen as client always sends it, but robust fallback check
            throw new Error("Dữ liệu khung tranh bị thiếu.");
        }
        
        if (!masterLayoutData) throw new Error("Lỗi tải khung ảnh nền.");

        // --- BƯỚC 2: XỬ LÝ NHÂN VẬT (SONG SONG) ---
        await updateJobProgress(jobId, jobPromptData, `Đang xử lý đồng thời ${numCharacters} nhân vật...`);
        
        const charPromises = characters.map(async (char: any, i: number) => {
            try {
                const isMale = char.gender === 'male';
                const vibe = isMale ? 'Cool, confident, masculine' : 'Muse-like, graceful, sexy';
                
                const charPrompt = [
                    `Create a full-body 3D character of a **${char.gender}**.`,
                    `**OUTFIT:** Strictly maintain the outfit from the input image.`,
                    `**POSE:** Create a pose fitting the description: "${prompt}".`,
                    `**VIBE:** ${vibe}.`,
                    `**BACKGROUND:** Solid Grey Background.`,
                ].join('\n');

                const [poseData, faceData] = await Promise.all([
                    fetchImageToBase64(char.poseImage),
                    fetchImageToBase64(char.faceImage)
                ]);

                if (!poseData) throw new Error(`Lỗi tải ảnh nhân vật ${i+1}.`);

                const parts: any[] = [
                    { inlineData: { data: poseData.data, mimeType: poseData.mimeType } },
                    { text: charPrompt },
                ];
                
                if (faceData) {
                    parts.push({ text: "Face Reference (High Priority):" });
                    parts.push({ inlineData: { data: faceData.data, mimeType: faceData.mimeType } });
                }

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

        // --- BƯỚC 3: TỔNG HỢP TRÊN MASTER CANVAS ---
        await updateJobProgress(jobId, jobPromptData, 'Đang tổng hợp và hòa trộn cảm xúc...');
        
        const compositePrompt = [
            `**TASK: GROUP PHOTO COMPOSITION**`,
            `**ASPECT RATIO ENFORCEMENT:**`,
            `I have provided a MASTER CANVAS image first. You MUST use this canvas as the base.`,
            `| TECHNICAL REQUIREMENT: The input MASTER CANVAS has been PRE-FORMATTED with WHITE PADDING to rigidly enforce a target aspect ratio of ${aspectRatio}. Do NOT crop this image. You MUST perform OUTPAINTING. Verify the white padded areas and fill them completely with a seamless background that matches the scene's context. The final output MUST be exactly ${aspectRatio} and contain NO remaining white borders.`,
            `---`,
            `**SCENE DESCRIPTION:** ${prompt}`,
            `**STYLE:** Hyper-realistic 3D Render (Audition Game Style), Volumetric Lighting, ${style || 'Cinematic'}.`,
            `---`,
            `**CHARACTERS:**`,
            `I have provided ${numCharacters} individual character images below.`,
            `You MUST composite ALL ${numCharacters} characters into the scene.`,
            `**QUANTITY LOCK:** The final image must contain EXACTLY ${numCharacters} people. NO MORE, NO LESS.`,
            `**NO EXTRAS:** Do NOT generate any extra people, crowd, or background characters.`,
            `---`,
            `**NEGATIVE PROMPT:** extra people, crowd, audience, bystanders, distorted faces, bad anatomy, blurry, watermark, text, low resolution, white borders, white bars.`
        ].join('\n');
        
        const finalParts: any[] = [
            { inlineData: { data: masterLayoutData.data, mimeType: masterLayoutData.mimeType } },
            { text: `[MASTER CANVAS - BASE LAYOUT - DO NOT RESIZE]` },
            { text: compositePrompt },
        ];

        generatedCharacters.forEach((charData, idx) => {
            finalParts.push({ text: `[Input Character ${idx + 1}]` });
            finalParts.push({ inlineData: charData });
        });
        
        // Force Aspect Ratio in config to prevent cropping.
        // We rely on client-side padding to match this ratio.
        const validRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
        const finalConfig: any = { 
            responseModalities: [Modality.IMAGE],
        };
        
        if (validRatios.includes(aspectRatio)) {
            finalConfig.imageConfig = { aspectRatio: aspectRatio };
        }

        if (isPro) {
            if (!finalConfig.imageConfig) finalConfig.imageConfig = {};
            finalConfig.imageConfig.imageSize = imageSize;
            
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
