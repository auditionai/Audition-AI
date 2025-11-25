
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from 'jimp';
import { addSmartWatermark } from './watermark-service';

const COST_UPSCALE = 1;
const COST_REMOVE_WATERMARK = 1; 
const XP_PER_GENERATION = 10;

/**
 * CHIẾN THUẬT "CANVAS XÁM CỨNG" (HARD GREY CANVAS STRATEGY)
 * Tạo một khung ảnh màu xám đúng tỷ lệ yêu cầu, sau đó đặt nhân vật vào.
 * Bắt buộc AI phải vẽ trên khung này -> Tỷ lệ không bao giờ sai.
 */
const processImageForGemini = async (imageDataUrl: string | null, targetAspectRatio: string): Promise<string | null> => {
    if (!imageDataUrl) return null;

    try {
        const [header, base64] = imageDataUrl.split(',');
        if (!base64) return null;

        const imageBuffer = Buffer.from(base64, 'base64');
        const image = await (Jimp as any).read(imageBuffer);

        // 1. Tính toán kích thước Canvas dựa trên tỷ lệ được chọn
        const [aspectW, aspectH] = targetAspectRatio.split(':').map(Number);
        const targetRatio = aspectW / aspectH;

        // Chuẩn hóa kích thước (Base 1024px để tối ưu cho Gemini)
        const MAX_DIM = 1024;
        let canvasW, canvasH;

        if (targetRatio > 1) {
            // Ngang (Landscape)
            canvasW = MAX_DIM;
            canvasH = Math.round(MAX_DIM / targetRatio);
        } else {
            // Dọc (Portrait) hoặc Vuông
            canvasH = MAX_DIM;
            canvasW = Math.round(MAX_DIM * targetRatio);
        }
        
        // 2. TẠO CANVAS XÁM (#808080)
        // Màu xám giúp AI dễ dàng "outpaint" (vẽ thêm nền) và hòa trộn ánh sáng hơn màu đen/trắng
        const newCanvas = new (Jimp as any)(canvasW, canvasH, '#808080');
        
        // 3. Đặt nhân vật vào Canvas
        // Sử dụng 'contain' để giữ nguyên toàn bộ chi tiết nhân vật, không bị cắt mất đầu/chân
        image.contain(canvasW, canvasH);

        // 4. Composite (Ghép)
        newCanvas.composite(image, 0, 0);

        const mime = header.match(/:(.*?);/)?.[1] || (Jimp as any).MIME_PNG;
        return newCanvas.getBase64Async(mime as any);

    } catch (error) {
        console.error("Error creating Grey Canvas:", error);
        return imageDataUrl; // Fallback nếu lỗi (dù hiếm)
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

        const body = JSON.parse(event.body || '{}');
        const { 
            prompt, apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, negativePrompt, seed, useUpscaler,
            imageSize = '1K', useGoogleSearch = false,
            removeWatermark = false 
        } = body;

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        // COST CALCULATION
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

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < totalCost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        // --- PROMPT ENGINEERING: CANVAS, VIBE & SOUL ---
        let fullPrompt = prompt;
        
        // 1. Canvas Mandate (Mệnh lệnh khung hình)
        fullPrompt += `\n\n**LAYOUT MANDATE:**\n- I have provided a GREY CANVAS with aspect ratio ${aspectRatio}. You MUST fill this canvas completely.\n- The grey area is for you to draw the background/environment.\n- DO NOT change the canvas dimensions.`;

        // 2. Style Rule: Hyper-realistic 3D Render (Not Photorealistic)
        fullPrompt += `\n\n**STYLE:**\n- **Hyper-realistic 3D Render** (High-end Game Cinematic style, Unreal Engine 5).\n- Detailed skin texture, volumetric lighting, raytracing reflections.\n- **NOT** "Photorealistic" (Do not make it look like a real camera photo).\n- **NOT** "Cartoon" or "2D".`;

        // 3. Character Vibe & Pose (Hồn nhân vật)
        if (characterImage) {
             fullPrompt += `\n\n**CHARACTER & POSE INSTRUCTIONS:**\n`;
             fullPrompt += `- **OUTFIT:** Keep the exact clothing design from the reference image.\n`;
             fullPrompt += `- **POSE:** DO NOT COPY THE REFERENCE POSE. Create a **NEW, NATURAL, DYNAMIC POSE** fitting the scene "${prompt}".\n`;
             
             // Logic phân biệt giới tính dựa trên prompt hoặc mặc định
             // (Tạm thời áp dụng logic chung, AI tự nhận diện giới tính từ ảnh)
             fullPrompt += `- **IF MALE:** Pose must be **Cool, Confident, Masculine, Strong**. Vibe: Charismatic, stylish, "bad boy" or gentleman depending on clothes.\n`;
             fullPrompt += `- **IF FEMALE:** Pose must be **Muse-like, Graceful, Girly ("Bánh bèo"), Charming, Sexy**. Vibe: Elegant, confident, high-fashion.\n`;
             
             fullPrompt += `- **EXPRESSION:** Subtle, natural facial expression. Slight smile if happy. **DO NOT** exaggerate emotions. Preserve facial identity strictly.\n`;
             fullPrompt += `- **INTERACTION:** Interact naturally with the environment (leaning, sitting, holding items). NO stiffness.`;
        }

        // 4. Face Lock
        if (faceReferenceImage) {
            fullPrompt += `\n\n**FACE ID:**\n- Use the exact facial structure from 'Face Reference'. Blend it seamlessly.`;
        }

        // 5. Negative Prompt (Chặn AI hóa, Chặn Người thật)
        const hardNegative = "photorealistic, real photo, grainy, low quality, 2D, sketch, cartoon, flat color, stiff pose, t-pose, mannequin, looking at camera blankly, distorted face, ugly, blurry";
        fullPrompt += ` --no ${hardNegative}, ${negativePrompt || ''}`;

        const parts: any[] = [];
        
        // --- QUAN TRỌNG: Xử lý ảnh qua Jimp để tạo Canvas Xám ---
        const [
            processedCharacterImage,
            processedStyleImage,
            processedFaceImage,
        ] = await Promise.all([
            processImageForGemini(characterImage, aspectRatio),
            processImageForGemini(styleImage, aspectRatio),
            processImageForGemini(faceReferenceImage, aspectRatio)
        ]);
        
        parts.push({ text: fullPrompt });

        const addImagePart = (imageDataUrl: string | null, label: string) => {
            if (!imageDataUrl) return;
            const [header, base64] = imageDataUrl.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
            parts.push({ text: `[${label}]` });
            parts.push({ inlineData: { data: base64, mimeType } });
        };

        // Gửi Canvas đã xử lý (Đã có nhân vật nằm giữa nền xám)
        addImagePart(processedCharacterImage, "CANVAS_WITH_CHARACTER_AND_GREY_BG");
        addImagePart(processedStyleImage, "STYLE_REFERENCE");
        addImagePart(processedFaceImage, "FACE_REFERENCE");
        
        const config: any = { 
            responseModalities: [Modality.IMAGE],
            seed: seed ? Number(seed) : undefined,
        };

        if (isProModel) {
            config.imageConfig = {
                aspectRatio: aspectRatio,
                imageSize: imageSize 
            };
            if (useGoogleSearch) {
                config.tools = [{ googleSearch: {} }]; 
            }
        }

        const response = await ai.models.generateContent({
            model: apiModel,
            contents: { parts: parts },
            config: config,
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) {
            console.error("Gemini Response Error:", JSON.stringify(response, null, 2));
            throw new Error("AI không thể tạo hình ảnh từ mô tả này. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");
        }

        finalImageBase64 = imagePartResponse.inlineData.data;
        finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        
        // --- WATERMARK LOGIC ---
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

        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = userData.xp + XP_PER_GENERATION;
        
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
        let clientFriendlyError = 'Lỗi không xác định từ máy chủ.';
        if (error?.message) {
            if (error.message.includes('INVALID_ARGUMENT')) {
                 clientFriendlyError = 'Lỗi cấu hình AI: Vui lòng thử lại hoặc đổi model.';
            } else {
                clientFriendlyError = error.message;
            }
        }
        return { statusCode: 500, body: JSON.stringify({ error: clientFriendlyError }) };
    }
};

export { handler };
