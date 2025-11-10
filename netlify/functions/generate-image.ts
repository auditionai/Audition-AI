import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
// Fix: Changed to a standard ES module default import for Jimp to resolve the "Import assignment cannot be used" error.
import Jimp from 'jimp';

const COST_BASE = 1;
const COST_UPSCALE = 1;
const XP_PER_GENERATION = 10;

const processImageForGemini = async (imageDataUrl: string | null, targetAspectRatio: string): Promise<string | null> => {
    if (!imageDataUrl) return null;
    try {
        const [header, base64] = imageDataUrl.split(',');
        if (!base64) return null;
        const imageBuffer = Buffer.from(base64, 'base64');
        const image = await Jimp.read(imageBuffer);
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
        const newCanvas = new Jimp(newCanvasWidth, newCanvasHeight, '#000000');
        const x = (newCanvasWidth - originalWidth) / 2;
        const y = (newCanvasHeight - originalHeight) / 2;
        newCanvas.composite(image, x, y);
        const mime = header.match(/:(.*?);/)?.[1] || Jimp.MIME_PNG;
        return newCanvas.getBase64Async(mime as any);
    } catch (error) {
        console.error("Error pre-processing image for Gemini:", error);
        return imageDataUrl;
    }
};

const buildSignaturePrompt = (
    text: string, style: string, position: string, 
    color: string, customColor: string, size: string
): string => {
    if (!text || text.trim() === '') return '';

    const instructions: string[] = [];
    instructions.push(`Add the text "${text.trim()}" as a signature.`);

    const styleMap: { [key: string]: string } = {
        handwritten: 'in a handwritten script style',
        sans_serif: 'in a clean, modern sans-serif font',
        bold: 'in a bold, oversized font',
        vintage: 'in a vintage, retro-style font',
        '3d': 'as 3D typography',
        messy: 'in a messy, grunge-style font',
        outline: 'as an outline font',
        teen_code: 'in a playful, teen-code style font',
        mixed: 'using a creative mix of fonts',
    };
    if (styleMap[style]) {
        instructions.push(`The signature should be ${styleMap[style]}.`);
    }

    const sizeMap: { [key: string]: string } = {
        small: 'It should be small and discreet.',
        medium: 'It should be a medium, noticeable size.',
        large: 'It should be large and prominent.',
    };
    if (sizeMap[size]) {
        instructions.push(sizeMap[size]);
    }

    if (color === 'rainbow') {
        instructions.push('The color should be a vibrant rainbow gradient.');
    } else if (color === 'custom' && customColor) {
        instructions.push(`The color should be ${customColor}.`);
    } else if (color === 'random') {
        instructions.push('The color should be a random, complementary color.');
    } else {
        instructions.push('The color should be white or another contrasting color.');
    }
    
    const positionMap: { [key: string]: string } = {
        bottom_right: 'Place it in the bottom-right corner.',
        bottom_left: 'Place it in the bottom-left corner.',
        top_right: 'Place it in the top-right corner.',
        top_left: 'Place it in the top-left corner.',
        center: 'Place it in the center.',
        random: 'Place it in a random but pleasing location.',
    };
    if (positionMap[position]) {
        instructions.push(positionMap[position]);
    }

    return ' ' + instructions.join(' ');
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

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

        const { 
            prompt, apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, useUpscaler,
            signatureText, signatureStyle, signaturePosition, signatureColor, signatureCustomColor, signatureSize
        } = JSON.parse(event.body || '{}');

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        const totalCost = COST_BASE + (useUpscaler ? COST_UPSCALE : 0);

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < totalCost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        let fullPrompt = prompt;
        
        // Append signature instructions to the prompt
        const signatureInstruction = buildSignaturePrompt(
            signatureText, signatureStyle, signaturePosition, signatureColor, signatureCustomColor, signatureSize
        );
        if (signatureInstruction) {
            fullPrompt += signatureInstruction;
        }

        const randomSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        if (apiModel.startsWith('imagen')) {
            const response = await ai.models.generateImages({
                model: apiModel,
                prompt: fullPrompt,
                config: { 
                    numberOfImages: 1, 
                    outputMimeType: 'image/png',
                    aspectRatio: aspectRatio,
                    seed: randomSeed,
                },
            });
            finalImageBase64 = response.generatedImages[0].image.imageBytes;
            finalImageMimeType = 'image/png';
        } else { // Assuming gemini-flash-image
            const parts: any[] = [];
            
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

            const addImagePart = (imageDataUrl: string | null) => {
                if (!imageDataUrl) return;
                const [header, base64] = imageDataUrl.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
                parts.push({ inlineData: { data: base64, mimeType } });
            };

            addImagePart(processedCharacterImage);
            addImagePart(processedStyleImage);
            addImagePart(processedFaceImage);
            
            const response = await ai.models.generateContent({
                model: apiModel,
                contents: { parts: parts },
                config: { 
                    responseModalities: [Modality.IMAGE],
                    seed: randomSeed,
                },
            });

            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh từ mô tả này. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");

            finalImageBase64 = imagePartResponse.inlineData.data;
            finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        }

        if (useUpscaler) {
            console.log(`[UPSCALER] Upscaling image for user ${user.id}... (DEMO)`);
        }

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