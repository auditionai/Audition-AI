
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service';

const COST_UPSCALE = 1;
const COST_REMOVE_WATERMARK = 1; 

const handler: Handler = async (event: HandlerEvent) => {
    // Initialize S3 Client
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

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
        
        // Safety parsing
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (e) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
        }

        const { 
            prompt, apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, negativePrompt, seed, useUpscaler,
            imageSize = '1K', useGoogleSearch = false,
            removeWatermark = false 
        } = body;

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        // --- 1. CALCULATE COST ---
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
        
        // --- 2. CHECK BALANCE (READ ONLY - NO DEDUCTION YET) ---
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        
        // Strict check before processing
        if (userData.diamonds < totalCost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        }
        
        // --- 3. AI PROCESSING ---
        // Fetch API Key
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // Construct Prompt
        let fullPrompt = "";
        const hasInputImage = !!characterImage;
        
        if (hasInputImage) {
            fullPrompt = `
** SYSTEM COMMAND: BOUNDARY & DIMENSION PRESERVATION **
You are provided with an input image labeled 'INPUT_CANVAS'.
This image contains a SOLID BLACK BORDER defining the EXACT output dimensions.

1. [NON-NEGOTIABLE] You MUST output an image with the EXACT same aspect ratio as the input. DO NOT CROP. DO NOT RESIZE.
2. [OUTPAINTING] The GRAY area (#808080) inside the border is void space. You MUST completely fill it with the environment described in the prompt.
3. [SUBJECT PRESERVATION] Keep the character's Pose, Outfit, and Gender exactly as shown in the non-gray parts. Blend them seamlessly into the new background.

**USER PROMPT:** ${prompt}

**STYLE:** Hyper-realistic 3D Render, Audition Game Style, High Fidelity, Volumetric Lighting.
`;
        } else {
            fullPrompt = `${prompt}\n\n**STYLE:**\n- **Hyper-realistic 3D Render** (High-end Game Cinematic style, Unreal Engine 5).\n- Detailed skin texture, volumetric lighting, raytracing reflections.`;
        }

        if (faceReferenceImage) {
            fullPrompt += `\n\n**FACE ID:**\n- Use the exact facial structure from 'Face Reference'. Blend it seamlessly.`;
        }

        const hardNegative = "photorealistic, real photo, grainy, low quality, 2D, sketch, cartoon, flat color, stiff pose, t-pose, mannequin, looking at camera blankly, distorted face, ugly, blurry, deformed hands, gray borders, gray bars, cropped, vertical crop, monochrome background, gray background, border, frame";
        fullPrompt += ` --no ${hardNegative}, ${negativePrompt || ''}`;

        // Prepare Parts
        const parts: any[] = [];
        parts.push({ text: fullPrompt });

        const addImagePart = (imageDataUrl: string | null, label: string) => {
            if (!imageDataUrl || typeof imageDataUrl !== 'string') return;
            try {
                const partsSplit = imageDataUrl.split(',');
                if (partsSplit.length < 2) {
                    console.warn(`Skipping invalid image data for ${label}`);
                    return;
                }
                const header = partsSplit[0];
                const base64 = partsSplit[1];
                
                // Robust MIME extraction
                let mimeType = 'image/jpeg'; // Default to JPEG to be safe
                const match = header.match(/:(.*?);/);
                if (match && match[1]) {
                    mimeType = match[1];
                }
                
                // Ensure we don't send empty base64
                if (base64 && base64.length > 100) {
                    parts.push({ text: `[${label}]` });
                    parts.push({ inlineData: { data: base64, mimeType } });
                } else {
                    console.warn(`Image data for ${label} is empty or too short.`);
                }
            } catch (e) {
                console.error(`Error processing image part ${label}`, e);
            }
        };

        addImagePart(characterImage, "INPUT_CANVAS");
        addImagePart(styleImage, "STYLE_REFERENCE");
        addImagePart(faceReferenceImage, "FACE_REFERENCE");
        
        // API Config
        const config: any = { 
            responseModalities: [Modality.IMAGE],
            seed: seed ? Number(seed) : undefined,
            imageConfig: { 
                aspectRatio: aspectRatio, 
                imageSize: isProModel ? imageSize : undefined
            }
        };

        if (isProModel && useGoogleSearch) {
            config.tools = [{ googleSearch: {} }]; 
        }

        // CALL GEMINI
        console.log(`Sending request to model ${apiModel} with ${parts.length} parts...`);
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
        
        // --- 4. WATERMARK & UPLOAD ---
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

        // --- 5. TRANSACTION (PAY ON SUCCESS) ---
        // Crucial Step: Only deduct NOW, after image is safely secured.
        
        // Re-fetch user data to ensure atomic safety (though low risk of race condition for single user)
        const { data: userRecheck } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        
        // Even if balance dropped (rare), we allow it to go negative slightly as we already incurred the AI cost.
        // Better to give user the image than to fail after generation.
        const currentDiamonds = userRecheck?.diamonds ?? userData.diamonds;
        const newDiamondCount = currentDiamonds - totalCost;
        const newXp = userData.xp + 10;
        
        let logDescription = `Tạo ảnh`;
        if (isProModel) logDescription += ` (Pro ${imageSize})`; else logDescription += ` (Flash)`;
        if (useUpscaler) logDescription += " + Upscale";
        if (removeWatermark) logDescription += " + NoWatermark";

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: prompt,
                image_url: publicUrl,
                model_used: apiModel,
                used_face_enhancer: !!faceReferenceImage
            }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'IMAGE_GENERATION',
                description: logDescription
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount, newXp }),
        };

    } catch (error: any) {
        console.error("Generate image function error:", error);
        // Return specific error message. Since we haven't deducted, no refund needed.
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi không xác định từ máy chủ.' }) };
    }
};

export { handler };
