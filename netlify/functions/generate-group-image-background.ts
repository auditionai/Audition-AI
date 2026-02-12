
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service'; 

const XP_PER_CHARACTER = 5;

// Refund Function used by Worker
const failJob = async (jobId: string, reason: string, userId: string, cost: number) => {
    console.error(`[GROUP WORKER] Failing job ${jobId}. Reason: ${reason}. Refunding: ${cost}`);
    try {
        const { data: userNow } = await supabaseAdmin.from('users').select('diamonds').eq('id', userId).single();
        if (userNow) {
            const refundBalance = userNow.diamonds + cost;
            await Promise.all([
                // UPDATE: Mark as FAILED so client sees message
                supabaseAdmin.from('generated_images').update({ 
                    image_url: `FAILED: ${reason.substring(0, 200)}` 
                }).eq('id', jobId),

                supabaseAdmin.from('users').update({ diamonds: refundBalance }).eq('id', userId),
                supabaseAdmin.from('diamond_transactions_log').insert({
                    user_id: userId,
                    amount: cost,
                    transaction_type: 'REFUND',
                    description: `Hoàn tiền lỗi Studio Nhóm: ${reason.substring(0, 50)}`,
                })
            ]);
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
            throw new Error(fetchError?.message || 'Job not found.');
        }

        jobPromptData = JSON.parse(jobData.prompt);
        payload = jobPromptData.payload;
        userId = jobData.user_id;
        
        const { characters, model: selectedModel, imageSize = '1K', removeWatermark = false } = payload;
        const numCharacters = characters?.length || 0;
        
        // Re-calculate cost to refund correctly
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
        
        // Safety Settings
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ];
        
        const generatedCharacters = [];
        let masterLayoutData: { data: string; mimeType: string } | null = null;

        // --- BƯỚC 1: LẤY MASTER CANVAS (LOCKED) ---
        await updateJobProgress(jobId, jobPromptData, 'Đang thiết lập khung tranh chuẩn...');
        
        if (referenceImage) {
            masterLayoutData = await fetchImageToBase64(referenceImage);
        } else {
            throw new Error("Dữ liệu khung tranh bị thiếu.");
        }
        
        if (!masterLayoutData) throw new Error("Lỗi tải khung ảnh nền.");

        // --- BƯỚC 2: TẠO NHÂN VẬT (ISOLATION PIPELINE) ---
        await updateJobProgress(jobId, jobPromptData, `Đang xử lý từng nhân vật theo quy trình...`);
        
        const charPromises = characters.map(async (char: any, i: number) => {
            try {
                const genderUpper = char.gender.toUpperCase();
                const genderPrompt = genderUpper === 'MALE' ? 'MALE, MAN, BOY, MASCULINE' : 'FEMALE, WOMAN, GIRL, FEMININE';
                
                const isolationPrompt = `
                ** SYSTEM COMMAND: CHARACTER GENERATION **
                ** TASK: ** Generate a single 3D Character Sprite.
                ** STYLE: ** 3D GAME ASSET (Unreal Engine / Audition Style).
                ** STRICT CONSTRAINT: **
                1. [GENDER]: **${genderUpper}** (${genderPrompt}). DO NOT SWAP GENDER.
                2. [INPUT ADHERENCE]: You MUST look at the provided 'CHARACTER_REF' image. COPY the Outfit, Hair, and Face exactly.
                3. [ISOLATION]: Ignore any other context. Focus ONLY on this single character.
                4. [BACKGROUND]: Solid Green (#00FF00) for easy masking.
                5. [POSE]: ${prompt} (Apply this pose to THIS character only).
                6. [TEXTURE]: Smooth 3D skin texture. NO photorealism.
                `;

                const [poseData, faceData] = await Promise.all([
                    fetchImageToBase64(char.poseImage),
                    fetchImageToBase64(char.faceImage)
                ]);

                if (!poseData) throw new Error(`Lỗi tải ảnh nhân vật ${i+1}.`);

                const parts: any[] = [
                    { inlineData: { data: poseData.data, mimeType: poseData.mimeType } },
                    { text: "[CHARACTER_REF]" },
                    { text: isolationPrompt },
                ];
                
                if (faceData) {
                    parts.push({ text: "[FACE_REF (Use for ID)]" });
                    parts.push({ inlineData: { data: faceData.data, mimeType: faceData.mimeType } });
                }

                const response = await ai.models.generateContent({ 
                    model: 'gemini-2.5-flash-image', 
                    contents: { parts }, 
                    config: { 
                        responseModalities: [Modality.IMAGE],
                        safetySettings: safetySettings
                    } 
                });
                
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (!imagePart?.inlineData) throw new Error(`AI không thể tạo nhân vật ${i + 1}.`);
                
                return {
                    index: i,
                    gender: char.gender,
                    data: imagePart.inlineData
                };
            } catch (charErr) {
                throw charErr;
            }
        });

        const results = await Promise.all(charPromises);
        results.sort((a, b) => a.index - b.index);
        generatedCharacters.push(...results);

        // --- BƯỚC 3: TỔNG HỢP (COMPOSITION) ---
        await updateJobProgress(jobId, jobPromptData, 'Đang lắp ráp đội hình và hoàn thiện...');
        
        const compositePrompt = `
            *** SUPREME SYSTEM COMMAND: BOUNDARY & COMPOSITION ***
            
            1. [FRAME RULE]: The input 'MASTER CANVAS' has a SOLID BORDER. You MUST preserve the aspect ratio defined by this border. DO NOT CROP.
            2. [OUTPAINTING]: Fill the gray area inside the border with the scene: "${prompt}".
            3. [STYLE LOCK]: 3D GAME RENDER (Unreal Engine / Audition Game Style).
            
            4. [STRICT ASSEMBLY]:
            I have provided ${numCharacters} pre-generated character sprites labeled [SPRITE_1], [SPRITE_2], etc.
            You MUST place these specific sprites into the scene.
            - [SPRITE_1] is Character 1 (${generatedCharacters[0].gender}).
            ${generatedCharacters[1] ? `- [SPRITE_2] is Character 2 (${generatedCharacters[1].gender}).` : ''}
            ${generatedCharacters[2] ? `- [SPRITE_3] is Character 3 (${generatedCharacters[2].gender}).` : ''}
            
            **RULE:** DO NOT regenerate their features (Face/Clothes/Gender). USE THE SPRITES PROVIDED. Blend them into the lighting of the scene.
            
            **STYLE:** Hyper-realistic 3D Render (Audition Game Style), Volumetric Lighting, ${style || 'Cinematic'}.
            **NEGATIVE:** photograph, real life, live action, real person, grainy, noise, text.
        `;
        
        const finalParts: any[] = [
            { inlineData: { data: masterLayoutData.data, mimeType: masterLayoutData.mimeType } },
            { text: `[MASTER CANVAS]` },
            { text: compositePrompt },
        ];

        generatedCharacters.forEach((char, idx) => {
            finalParts.push({ text: `[SPRITE_${idx + 1} (${char.gender.toUpperCase()})]` });
            finalParts.push({ inlineData: char.data });
        });
        
        const finalConfig: any = { 
            responseModalities: [Modality.IMAGE],
            safetySettings: safetySettings,
            imageConfig: { 
                aspectRatio: aspectRatio, // ENFORCED
                imageSize: isPro ? imageSize : undefined
            }
        };
        
        if (isPro && useSearch) {
            finalConfig.tools = [{ googleSearch: {} }];
        }

        const finalResponse = await ai.models.generateContent({
            model: modelName,
            contents: { parts: finalParts },
            config: finalConfig,
        });

        const finalImagePart = finalResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!finalImagePart?.inlineData) {
            if (finalResponse.promptFeedback?.blockReason) {
                 throw new Error(`Ảnh cuối bị chặn do vi phạm an toàn: ${finalResponse.promptFeedback.blockReason}`);
            }
            throw new Error("AI failed to composite the final image.");
        }

        const finalImageBase64 = finalImagePart.inlineData.data;
        const finalImageMimeType = finalImagePart.inlineData.mimeType;

        let imageBuffer = Buffer.from(finalImageBase64, 'base64');
        if (!removeWatermark) {
            imageBuffer = await addSmartWatermark(imageBuffer, '');
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

    } catch (error: any) {
        if (userId && totalCost > 0) {
            await failJob(jobId, error.message, userId, totalCost);
        }
    }

    return { statusCode: 200 };
};

export { handler };