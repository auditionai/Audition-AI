import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_PER_IMAGE = 1;
const XP_PER_IMAGE = 10;

const handler: Handler = async (event: HandlerEvent) => {
    // Fix: Moved S3Client initialization inside the handler to prevent potential scope/caching issues in serverless environments.
    // Cấu hình S3 client để kết nối với Cloudflare R2
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
        
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

        const { prompt, characterImage, styleImage, model, style, aspectRatio, isOutpainting } = JSON.parse(event.body || '{}');

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < COST_PER_IMAGE) return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương.' }) };

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        let finalImageBase64: string;
        let finalImageMimeType: string;

        let creativeBrief = prompt;
        if (style.id !== 'none' && creativeBrief) {
            creativeBrief = `${prompt}, in the style of ${style.name}`;
        }

        let finalPrompt = creativeBrief;

        if (isOutpainting) {
            const jsonCommand = {
                task: "image_outpainting",
                instructions: "You are an expert photo editor AI. Your only task is outpainting. The provided image contains a central subject placed on a gray canvas. Fill the gray area with a new scene. CRITICAL COMMAND: The final image MUST strictly maintain the exact dimensions and aspect ratio of the provided canvas.",
                creative_brief: creativeBrief,
                target_aspect_ratio: aspectRatio
            };
            finalPrompt = `URGENT, SUPREME COMMAND: You MUST parse the following JSON and strictly follow its instructions to generate the final image. Do not deviate from the specified 'aspect_ratio'. JSON object: ${JSON.stringify(jsonCommand)}`;
        } else if (characterImage) {
            finalPrompt = `CRITICAL COMMAND: You are an expert AI photo generator. Your most important task is to preserve the exact facial identity from the provided input image with the highest possible fidelity. This includes all facial features (eyes, nose, mouth), hairstyle, makeup, and any accessories on the face (like glasses or piercings). Do NOT alter the person's identity or "AI-ify" the face unless the source image is too blurry to extract details. Apply the following creative brief ONLY to the clothing, background, and pose: "${creativeBrief}"`;
        }

        if (model.apiModel === 'imagen-4.0-generate-001') {
            if (isOutpainting || characterImage || styleImage) {
                 return { statusCode: 400, body: JSON.stringify({ error: `Model ${model.name} không hỗ trợ vẽ mở rộng hoặc sử dụng ảnh đầu vào.` }) };
            }
            const response = await ai.models.generateImages({
                model: model.apiModel,
                prompt: finalPrompt,
                config: { numberOfImages: 1, aspectRatio, outputMimeType: 'image/jpeg' },
            });
            const imageResponse = response.generatedImages[0];
            if (!imageResponse?.image?.imageBytes) throw new Error("AI không thể tạo hình ảnh này (Imagen).");
            finalImageBase64 = imageResponse.image.imageBytes;
            finalImageMimeType = 'image/jpeg';
        } else {
            const parts: any[] = [];
            if (characterImage) parts.push({ inlineData: characterImage });
            if (styleImage) parts.push({ inlineData: styleImage });
            if (finalPrompt) parts.push({ text: finalPrompt });

            const response = await ai.models.generateContent({
                model: model.apiModel,
                contents: { parts: parts },
                config: { responseModalities: [Modality.IMAGE] },
            });
            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh này (Gemini).");
            finalImageBase64 = imagePartResponse.inlineData.data;
            finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        }

        // --- START OF R2 UPLOAD LOGIC ---
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const finalFileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/${Date.now()}.${finalFileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        });
        
        await s3Client.send(putCommand);

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
        // --- END OF R2 UPLOAD LOGIC ---

        const newDiamondCount = userData.diamonds - COST_PER_IMAGE;
        const newXp = userData.xp + XP_PER_IMAGE;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.from('generated_images').insert({ user_id: user.id, prompt: prompt, image_url: publicUrl, model_used: model.name }),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -COST_PER_IMAGE,
                transaction_type: 'IMAGE_GENERATION',
                description: `Tạo ảnh: ${model.name}`
            })
        ]);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount, newXp }),
        };

    } catch (error: any) {
        console.error("Image Generation Function Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: `Lỗi khi tạo ảnh: ${error.message || 'Unknown server error.'}` }) };
    }
};

export { handler };