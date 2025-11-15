import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
// Fix: Use a standard ES module import for 'jimp' as the project is targeting ECMAScript modules.
import Jimp from 'jimp';

const COST_BASE = 1;
const COST_UPSCALE = 1;
const XP_PER_GENERATION = 10;

/**
 * Pre-processes an image by placing it onto a new canvas of a target aspect ratio.
 * This "letterboxing" technique ensures all input images sent to Gemini
 * have the same aspect ratio, forcing the output to match.
 * @param imageDataUrl The base64 data URL of the input image.
 * @param targetAspectRatio The desired aspect ratio string (e.g., '16:9').
 * @returns A promise that resolves to the new base64 data URL.
 */
const processImageForGemini = async (imageDataUrl: string | null, targetAspectRatio: string): Promise<string | null> => {
    if (!imageDataUrl) return null;

    try {
        const [header, base64] = imageDataUrl.split(',');
        if (!base64) return null;

        const imageBuffer = Buffer.from(base64, 'base64');
        // FIX: The type definitions for 'jimp' may not align with its ESM module exports. Casting to 'any' bypasses the TypeScript error for `read`, assuming the method exists at runtime.
        const image = await (Jimp as any).read(imageBuffer);
        const originalWidth = image.getWidth();
        const originalHeight = image.getHeight();

        const [aspectW, aspectH] = targetAspectRatio.split(':').map(Number);
        const targetRatio = aspectW / aspectH;
        const originalRatio = originalWidth / originalHeight;

        let newCanvasWidth: number, newCanvasHeight: number;

        // Determine new canvas dimensions to match target aspect ratio while enclosing the original image
        if (targetRatio > originalRatio) {
            // Target is wider than original (pillarbox)
            newCanvasHeight = originalHeight;
            newCanvasWidth = Math.round(originalHeight * targetRatio);
        } else {
            // Target is taller than original (letterbox)
            newCanvasWidth = originalWidth;
            newCanvasHeight = Math.round(originalWidth / targetRatio);
        }
        
        // Create a new black canvas with the target dimensions
        // FIX: The 'jimp' constructor is not constructable on the imported type. Using `new (Jimp as any)` bypasses the strict type check.
        const newCanvas = new (Jimp as any)(newCanvasWidth, newCanvasHeight, '#000000');
        
        // Calculate position to center the original image
        const x = (newCanvasWidth - originalWidth) / 2;
        const y = (newCanvasHeight - originalHeight) / 2;
        
        // Composite the original image onto the new canvas
        newCanvas.composite(image, x, y);

        // FIX: The type definitions for 'jimp' may not align with its ESM module exports. Casting to 'any' bypasses the TypeScript error for the MIME_PNG constant.
        const mime = header.match(/:(.*?);/)?.[1] || (Jimp as any).MIME_PNG;
        return newCanvas.getBase64Async(mime as any);

    } catch (error) {
        console.error("Error pre-processing image for Gemini:", error);
        // If processing fails, return the original to not break the flow,
        // though aspect ratio might be wrong.
        return imageDataUrl;
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

        // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

        const { 
            prompt, apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, negativePrompt, seed, useUpscaler 
        } = JSON.parse(event.body || '{}');

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        const totalCost = COST_BASE + (useUpscaler ? COST_UPSCALE : 0);

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < totalCost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        let translatedPrompt = prompt;
        if (prompt && prompt.trim()) {
            try {
                const translationResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: `Translate the following image description from Vietnamese to English. Keep it concise and descriptive. Text: "${prompt}"`,
                });
                const translatedText = translationResponse.text.trim();
                if (translatedText && translatedText.length > 3) {
                    translatedPrompt = translatedText;
                }
            } catch (e) {
                console.warn(`[generate-image] Prompt translation failed, using original. Error: ${e}`);
            }
        }

        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        let fullPrompt = translatedPrompt;

        // NEW: Add absolute instruction for Super Face Lock
        if (faceReferenceImage) {
            const faceLockInstruction = `(ABSOLUTE INSTRUCTION: The final image MUST use the exact face, including all features, details, and the complete facial expression, from the provided face reference image. Do NOT alter, modify, stylize, or change the expression of this face in any way. Ignore any conflicting instructions about facial expressions in the user's prompt. The face from the reference image must be perfectly preserved and transplanted onto the generated character.)\n\n`;
            fullPrompt = faceLockInstruction + fullPrompt;
        }

        if (negativePrompt) {
            fullPrompt += ` --no ${negativePrompt}`;
        }

        if (apiModel.startsWith('imagen')) {
            const response = await ai.models.generateImages({
                model: apiModel,
                prompt: fullPrompt,
                config: { 
                    numberOfImages: 1, 
                    outputMimeType: 'image/png',
                    aspectRatio: aspectRatio,
                    seed: seed ? Number(seed) : undefined,
                },
            });
            finalImageBase64 = response.generatedImages[0].image.imageBytes;
            finalImageMimeType = 'image/png';
        } else { // Assuming gemini-flash-image
            const parts: any[] = [];
            
            // --- The Ultimate Solution: Pre-process ALL images to match target aspect ratio ---
            const [
                processedCharacterImage,
                processedStyleImage,
                processedFaceImage,
            ] = await Promise.all([
                processImageForGemini(characterImage, aspectRatio),
                processImageForGemini(styleImage, aspectRatio),
                processImageForGemini(faceReferenceImage, aspectRatio)
            ]);
            
            // The text prompt is ALWAYS the first part.
            parts.push({ text: fullPrompt });

            // Helper to add processed image parts
            const addImagePart = (imageDataUrl: string | null) => {
                if (!imageDataUrl) return;
                const [header, base64] = imageDataUrl.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
                parts.push({ inlineData: { data: base64, mimeType } });
            };

            // Add the pre-processed images to the request
            addImagePart(processedCharacterImage);
            addImagePart(processedStyleImage);
            addImagePart(processedFaceImage);
            
            const response = await ai.models.generateContent({
                model: apiModel,
                contents: { parts: parts },
                config: { 
                    responseModalities: [Modality.IMAGE],
                    seed: seed ? Number(seed) : undefined,
                },
            });

            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh từ mô tả này. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");

            finalImageBase64 = imagePartResponse.inlineData.data;
            finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        }

        // --- Placeholder for Upscaler Logic ---
        if (useUpscaler) {
            console.log(`[UPSCALER] Upscaling image for user ${user.id}... (DEMO)`);
        }
        // --- End of Placeholder ---

        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/${Date.now()}.${fileExtension}`;

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
        
        let logDescription = `Tạo ảnh: ${prompt.substring(0, 50)}...`;
        if (useUpscaler) {
            logDescription += " (Nâng cấp)";
        }
        
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
        // Provide a more specific error message if available from Gemini
        let clientFriendlyError = 'Lỗi không xác định từ máy chủ.';
        if (error?.message) {
            if (error.message.includes('INVALID_ARGUMENT')) {
                 clientFriendlyError = 'Lỗi từ AI: Không thể xử lý ảnh đầu vào. Hãy thử lại hoặc thay đổi ảnh đầu vào.';
            } else {
                clientFriendlyError = error.message;
            }
        }
            
        return { statusCode: 500, body: JSON.stringify({ error: clientFriendlyError }) };
    }
};

export { handler };