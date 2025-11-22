import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from 'jimp';

const COST_UPSCALE = 1;
const COST_REMOVE_WATERMARK = 1; // Cost for removing watermark
const XP_PER_GENERATION = 10;

// Font URLs - Using specific version to ensure stability
const FONT_URL_32 = "https://raw.githubusercontent.com/jimp-dev/jimp/main/packages/plugin-print/fonts/open-sans/open-sans-32-white/open-sans-32-white.fnt";
const FONT_URL_16 = "https://raw.githubusercontent.com/jimp-dev/jimp/main/packages/plugin-print/fonts/open-sans/open-sans-16-white/open-sans-16-white.fnt";

/**
 * Helper to load font with retry
 */
const loadFontSafe = async (url: string) => {
    try {
        return await (Jimp as any).loadFont(url);
    } catch (e) {
        console.error(`Failed to load font ${url}:`, e);
        return null;
    }
};

/**
 * Pre-processes an image by placing it onto a new canvas of a target aspect ratio.
 */
const processImageForGemini = async (imageDataUrl: string | null, targetAspectRatio: string): Promise<string | null> => {
    if (!imageDataUrl) return null;

    try {
        const [header, base64] = imageDataUrl.split(',');
        if (!base64) return null;

        const imageBuffer = Buffer.from(base64, 'base64');
        const image = await (Jimp as any).read(imageBuffer);
        const originalWidth = image.getWidth();
        const originalHeight = image.getHeight();

        const [aspectW, aspectH] = targetAspectRatio.split(':').map(Number);
        const targetRatio = aspectW / aspectH;
        const originalRatio = originalWidth / originalHeight;

        let newCanvasWidth: number, newCanvasHeight: number;

        if (targetRatio > originalRatio) {
            newCanvasHeight = originalHeight;
            newCanvasWidth = Math.round(originalHeight * targetRatio);
        } else {
            newCanvasWidth = originalWidth;
            newCanvasHeight = Math.round(originalWidth / targetRatio);
        }
        
        const newCanvas = new (Jimp as any)(newCanvasWidth, newCanvasHeight, '#000000');
        
        const x = (newCanvasWidth - originalWidth) / 2;
        const y = (newCanvasHeight - originalHeight) / 2;
        
        newCanvas.composite(image, x, y);

        const mime = header.match(/:(.*?);/)?.[1] || (Jimp as any).MIME_PNG;
        return newCanvas.getBase64Async(mime as any);

    } catch (error) {
        console.error("Error pre-processing image for Gemini:", error);
        return imageDataUrl;
    }
};

// Add Watermark Function (Gradient Vignette + Text)
const addWatermark = async (imageBuffer: Buffer): Promise<Buffer> => {
    try {
        console.log("Starting watermark process (Gradient)...");
        const image = await (Jimp as any).read(imageBuffer);
        
        const width = image.getWidth();
        const height = image.getHeight();

        // 1. Create Gradient Vignette (Darken bottom area)
        // This ensures white text is visible on light images without a solid black box.
        const gradientHeight = 140; // Height of the fade area
        const startY = Math.max(0, height - gradientHeight);
        
        image.scan(0, startY, width, gradientHeight, function (x: number, y: number, idx: number) {
            // Normalized vertical position in gradient (0 to 1)
            const ratio = (y - startY) / gradientHeight;
            
            // Darkening Factor: 0 (top of gradient) -> 0.85 (bottom of image)
            // Using cubic curve for a smoother, more natural fade
            const opacity = Math.pow(ratio, 1.5) * 0.85; 
            
            // Apply darkening to RGB channels
            this.bitmap.data[idx + 0] = this.bitmap.data[idx + 0] * (1 - opacity); // Red
            this.bitmap.data[idx + 1] = this.bitmap.data[idx + 1] * (1 - opacity); // Green
            this.bitmap.data[idx + 2] = this.bitmap.data[idx + 2] * (1 - opacity); // Blue
            // Alpha channel (idx + 3) is left untouched
        });

        // 2. Load fonts
        const font32 = await loadFontSafe(FONT_URL_32);
        const font16 = await loadFontSafe(FONT_URL_16);

        if (font32 && font16) {
            const text1 = "Created by";
            const text2 = "AUDITION AI";

            // Calculate positions (Right aligned with margin)
            const text1Width = (Jimp as any).measureText(font16, text1);
            const text2Width = (Jimp as any).measureText(font32, text2);
            
            const margin = 24;
            const x1 = width - text1Width - margin;
            const x2 = width - text2Width - margin;
            
            const yText = height - 55; 

            // Print Text
            image.print(font16, x1, yText - 22, text1);
            image.print(font32, x2, yText, text2);
            console.log("Watermark text rendered.");
        } else {
            console.warn("Fonts failed to load, skipping text render.");
        }

        return await image.getBufferAsync((Jimp as any).MIME_PNG);
    } catch (error) {
        console.error("Failed to add watermark:", error);
        return imageBuffer; // Return original on failure
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
            removeWatermark = false // Get param
        } = body;

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        // COST CALCULATION
        let baseCost = 1;
        const isProModel = apiModel === 'gemini-3-pro-image-preview';

        if (isProModel) {
             // Pricing: 1K = 10, 2K = 15, 4K = 20
             if (imageSize === '4K') baseCost = 20;
             else if (imageSize === '2K') baseCost = 15;
             else baseCost = 10; // 1K Base
        }
        
        let totalCost = baseCost;
        if (useUpscaler) totalCost += COST_UPSCALE;
        if (removeWatermark) totalCost += COST_REMOVE_WATERMARK; // Charge for watermark removal

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < totalCost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        let fullPrompt = prompt;

        if (faceReferenceImage) {
            const faceLockInstruction = `(ABSOLUTE INSTRUCTION: The final image MUST use the exact face, including all features, details, and the complete facial expression, from the provided face reference image. Do NOT alter, modify, stylize, or change the expression of this face in any way. Ignore any conflicting instructions about facial expressions in the user's prompt. The face from the reference image must be perfectly preserved and transplanted onto the generated character.)\n\n`;
            fullPrompt = faceLockInstruction + fullPrompt;
        }

        if (negativePrompt) {
            fullPrompt += ` --no ${negativePrompt}`;
        }

        // Gemini (Flash or Pro) logic
        const parts: any[] = [];
        
        // Pre-process ALL images to match target aspect ratio
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

        addImagePart(processedCharacterImage);
        addImagePart(processedStyleImage);
        addImagePart(processedFaceImage);
        
        // --- STRICT CONFIGURATION CONSTRUCTION ---
        const config: any = { 
            responseModalities: [Modality.IMAGE],
            seed: seed ? Number(seed) : undefined,
        };

        if (isProModel) {
            // Gemini 3 Pro Config
            config.imageConfig = {
                aspectRatio: aspectRatio,
                imageSize: imageSize // "1K", "2K", "4K"
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
        
        // --- R2 Upload & Watermarking Logic ---
        let imageBuffer = Buffer.from(finalImageBase64, 'base64');

        // Apply Watermark if user did NOT choose to remove it
        if (!removeWatermark) {
            imageBuffer = await addWatermark(imageBuffer);
        }

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
        
        // Create detailed log description
        let logDescription = `Tạo ảnh`;
        if (isProModel) {
            logDescription += ` (Pro ${imageSize})`;
        } else {
            logDescription += ` (Flash)`;
        }
        
        if (useUpscaler) logDescription += " + Upscale";
        if (removeWatermark) logDescription += " + NoWatermark";
        
        logDescription += `: ${prompt.substring(0, 20)}...`;
        
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