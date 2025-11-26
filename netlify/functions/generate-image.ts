
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service';

const COST_UPSCALE = 1;
const COST_REMOVE_WATERMARK = 1; 

// Helper function to refund user reliably
const refundUser = async (userId: string, amount: number, reason: string) => {
    try {
        const { data: userNow } = await supabaseAdmin.from('users').select('diamonds').eq('id', userId).single();
        if (!userNow) return;

        const refundBalance = userNow.diamonds + amount;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: refundBalance }).eq('id', userId),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: userId,
                amount: amount,
                transaction_type: 'REFUND',
                description: `Hoàn tiền lỗi tạo ảnh: ${reason.substring(0, 50)}`
            })
        ]);
        console.log(`[REFUND] Refunded ${amount} diamonds to ${userId}. Reason: ${reason}`);
    } catch (e) {
        console.error("[REFUND CRITICAL] Failed to refund user:", e);
    }
};

const handler: Handler = async (event: HandlerEvent) => {
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

    let userLogId = "";
    let calculatedCost = 0;

    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }
        
        const authHeader = event.headers['authorization'];
        if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        const token = authHeader.split(' ')[1];
        if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

        const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        
        userLogId = user.id;

        const body = JSON.parse(event.body || '{}');
        const { 
            prompt, apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, negativePrompt, seed, useUpscaler,
            imageSize = '1K', useGoogleSearch = false,
            removeWatermark = false 
        } = body;

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        // --- 1. COST CALCULATION ---
        let baseCost = 1;
        const isProModel = apiModel === 'gemini-3-pro-image-preview';

        if (isProModel) {
             if (imageSize === '4K') baseCost = 20;
             else if (imageSize === '2K') baseCost = 15;
             else baseCost = 10;
        }
        
        let totalCost = baseCost;
        if (useUpscaler) totalCost += COST_UPSCALE;
        if (removeWatermark) totalCost += COST_REMOVE_WATERMARK; 
        
        calculatedCost = totalCost;

        // --- 2. CHECK BALANCE & DEDUCT ---
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < totalCost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        
        const newDiamondCount = userData.diamonds - totalCost;
        const { error: deductError } = await supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id);
        if (deductError) throw new Error("Lỗi giao dịch: Không thể trừ kim cương.");

        // LOG TRANSACTION
        let logDescription = `Tạo ảnh`;
        if (isProModel) logDescription += ` (Pro ${imageSize})`; else logDescription += ` (Flash)`;
        if (useUpscaler) logDescription += " + Upscale";
        if (removeWatermark) logDescription += " + NoWatermark";

        await supabaseAdmin.from('diamond_transactions_log').insert({
            user_id: user.id,
            amount: -totalCost,
            transaction_type: 'IMAGE_GENERATION',
            description: logDescription
        });
        
        // --- 3. PROCESSING ---
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // --- PROMPT ENGINEERING (SUPREME COMMAND WITH ANCHORS) ---
        let fullPrompt = "";
        const hasInputImage = !!characterImage;
        
        if (hasInputImage) {
            // SUPREME COMMAND: ANCHOR & OUTPAINT
            // We explicitly instruct the AI to recognize the anchors and fill the gray.
            fullPrompt = `
*** SUPREME SYSTEM COMMAND: CANVAS PRESERVATION & OUTPAINTING ***
You are provided with an input image labeled 'INPUT_IMAGE_WITH_ANCHORS'.
This image contains:
1. A central character/pose.
2. **GRAY PADDING (#888888)** filling the rest of the canvas.
3. **4 DARK ANCHOR PIXELS** in the extreme corners.

**YOUR INSTRUCTIONS:**
1. [BOUNDARIES]: You MUST output an image with the **EXACT SAME PIXEL DIMENSIONS** as the input. DO NOT CROP. DO NOT RESIZE. The 4 anchor pixels define the absolute limits.
2. [OUTPAINTING]: Identify all GRAY (#888888) areas. Treat them as "Void". You MUST completely replace ALL gray pixels with the background scenery described below.
3. [SUBJECT]: Keep the central character's pose and outfit structure intact, but blend them realistically into the new environment.

**USER PROMPT:** ${prompt}

**STYLE:** Hyper-realistic 3D Render, Audition Game Style, High Fidelity, Volumetric Lighting.
`;
        } else {
            // Text-to-Image only
            fullPrompt = `${prompt}\n\n**STYLE:**\n- **Hyper-realistic 3D Render** (High-end Game Cinematic style, Unreal Engine 5).\n- Detailed skin texture, volumetric lighting, raytracing reflections.`;
        }

        if (faceReferenceImage) {
            fullPrompt += `\n\n**FACE ID:**\n- Use the exact facial structure from 'Face Reference'. Blend it seamlessly.`;
        }

        const hardNegative = "photorealistic, real photo, grainy, low quality, 2D, sketch, cartoon, flat color, stiff pose, t-pose, mannequin, looking at camera blankly, distorted face, ugly, blurry, deformed hands, gray borders, gray bars, cropped, vertical crop, monochrome background, gray background, border, frame";
        fullPrompt += ` --no ${hardNegative}, ${negativePrompt || ''}`;

        const parts: any[] = [];
        
        // --- IMAGE PROCESSING ---
        parts.push({ text: fullPrompt });

        const addImagePart = (imageDataUrl: string | null, label: string) => {
            if (!imageDataUrl) return;
            const [header, base64] = imageDataUrl.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
            parts.push({ text: `[${label}]` });
            parts.push({ inlineData: { data: base64, mimeType } });
        };

        // The characterImage is already Padded & Anchored from the client side
        addImagePart(characterImage, "INPUT_IMAGE_WITH_ANCHORS");
        addImagePart(styleImage, "STYLE_REFERENCE");
        addImagePart(faceReferenceImage, "FACE_REFERENCE");
        
        // --- CONFIGURATION LOGIC (CRITICAL FIX FOR ASPECT RATIO) ---
        const config: any = { 
            responseModalities: [Modality.IMAGE],
            seed: seed ? Number(seed) : undefined,
        };

        if (!hasInputImage) {
            // Text-to-Image Mode: We MUST specify aspect ratio via config
            config.imageConfig = { aspectRatio: aspectRatio };
            if (isProModel) {
                config.imageConfig.imageSize = imageSize;
            }
        } else {
            // Image-to-Image Mode (With Anchors): 
            // CRITICAL: DO NOT add imageConfig.aspectRatio or imageSize. 
            // We rely ENTIRELY on the input image's pixel dimensions + Anchors.
            // Sending aspectRatio here causes conflict because the model tries to crop to that ratio
            // instead of respecting the input canvas.
        }

        if (isProModel && useGoogleSearch) {
            config.tools = [{ googleSearch: {} }]; 
        }

        const response = await ai.models.generateContent({
            model: apiModel,
            contents: { parts: parts },
            config: config,
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) {
            throw new Error("AI không thể tạo hình ảnh từ mô tả này (Lỗi Model Output).");
        }

        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        
        // --- WATERMARK & UPLOAD ---
        let imageBuffer = Buffer.from(finalImageBase64, 'base64');

        if (!removeWatermark) {
            const siteUrl = process.env.URL || 'https://auditionai.io.vn';
            const watermarkUrl = `${siteUrl}/watermark.png`;
            imageBuffer = await addSmartWatermark(imageBuffer, watermarkUrl);
        }

        const fileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/${Date.now()}_${isProModel ? 'pro' : 'flash'}.${fileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        });
        await (s3Client as any).send(putCommand);
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        // --- SUCCESS ---
        const newXp = userData.xp + 10;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: prompt,
                image_url: publicUrl,
                model_used: apiModel,
                used_face_enhancer: !!faceReferenceImage
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount, newXp }),
        };

    } catch (error: any) {
        console.error("Generate image function error:", error);
        if (userLogId && calculatedCost > 0) {
            await refundUser(userLogId, calculatedCost, error.message || "Unknown Error");
        }
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi không xác định từ máy chủ.' }) };
    }
};

export { handler };
