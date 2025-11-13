import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from 'jimp';

const XP_PER_CHARACTER = 5;

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
            characters, layout, layoutPrompt, background, backgroundPrompt, style, stylePrompt, aspectRatio, useUpscaler
        } = JSON.parse(event.body || '{}');

        if (!characters || characters.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Character information is required.' }) };
        }
        
        const totalCost = characters.length + (useUpscaler ? 1 : 0);
        const totalXpGain = characters.length * XP_PER_CHARACTER;

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < totalCost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // --- CONSTRUCT MEGA PROMPT (REVISED) ---
        const parts: any[] = [];
        const characterDetailsLines = [];
        let imageIndex = 1;

        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            characterDetailsLines.push(`- Character ${i + 1}:`);
            if (char.poseImage) {
                characterDetailsLines.push(`  - The outfit, gender, and pose for this character MUST be taken from the upcoming reference Image ${imageIndex}.`);
                imageIndex++;
            }
            if (char.faceImage) {
                characterDetailsLines.push(`  - **CRITICAL**: The face for this character MUST be an EXACT, pixel-perfect copy from the upcoming reference Image ${imageIndex}. Do NOT alter facial features, makeup, accessories, gender, or expression. It must be a perfect replication transplanted onto the character.`);
                imageIndex++;
            }
        }

        const finalPrompt = [
            `Generate a single, cohesive, high-quality image featuring exactly ${characters.length} distinct human characters. Follow all instructions precisely.`,
            "\n--- SCENE DEFINITION ---",
            `1.  **Style:** The image must have an overall aesthetic of '${style}'. Additional style notes: ${stylePrompt || 'None'}.`,
            `2.  **Background:** The setting is '${background}'. Additional background details: ${backgroundPrompt || 'None'}.`,
            `3.  **Composition:** Arrange the characters in a '${layout}' formation. Additional layout details: ${layoutPrompt || 'None'}. Make the characters' poses look natural and interactive for a group photo, while retaining the core elements from their reference images.`,
            "\n--- CHARACTER SPECIFICATIONS (MANDATORY) ---",
            "Adhere strictly to these image-to-character assignments. Do NOT mix or swap references.",
            ...characterDetailsLines,
            "\n--- ABSOLUTE FINAL RULES ---",
            "1.  **Identity Preservation:** You MUST preserve the gender, face, and clothing for EACH character as specified by their dedicated reference images.",
            "2.  **Consistency:** Lighting and shadows must be consistent across all characters and the background.",
            "3.  **Quality:** The final image must be anatomically correct, free of artifacts, and look like a single, unified piece of artwork.",
        ].join('\n');

        parts.push({ text: finalPrompt });

        // This order is critical for the prompt indexing to work
        const allImagesToProcess = characters.flatMap((char: any) => [char.poseImage, char.faceImage]).filter(Boolean);
        const processedImages = await Promise.all(
            allImagesToProcess.map(imgDataUrl => processImageForGemini(imgDataUrl, aspectRatio))
        );

        processedImages.forEach(processedDataUrl => {
            if (processedDataUrl) {
                const [header, base64] = processedDataUrl.split(',');
                parts.push({ inlineData: { data: base64, mimeType: header.match(/:(.*?);/)?.[1] || 'image/png' } });
            }
        });
        
        const apiModel = 'gemini-2.5-flash-image';
        const response = await ai.models.generateContent({
            model: apiModel,
            contents: { parts: parts },
            config: { 
                responseModalities: [Modality.IMAGE],
            },
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh nhóm từ mô tả này. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");

        let finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        
        if (useUpscaler) {
            console.log(`[UPSCALER] Upscaling GROUP image for user ${user.id}... (DEMO)`);
        }
        
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/group/${Date.now()}.${fileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        });
        await (s3Client as any).send(putCommand);
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = userData.xp + totalXpGain;
        
        let logDescription = `Tạo ảnh nhóm ${characters.length} người`;
        if (useUpscaler) {
            logDescription += " (Nâng cấp)";
        }
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: `[Group Photo]: ${layout}, ${background}, ${style}`,
                image_url: publicUrl,
                model_used: apiModel,
            }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'GROUP_IMAGE_GENERATION',
                description: logDescription
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount }),
        };

    } catch (error: any) {
        console.error("Generate group image function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi không xác định từ máy chủ.' }) };
    }
};

export { handler };