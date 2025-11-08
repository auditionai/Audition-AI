import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_BASE = 1;
const COST_UPSCALE = 1;
const XP_PER_GENERATION = 10;

// --- ROBUST ASPECT RATIO FIX ---
// Pre-generated, tiny, gray canvases as base64 strings.
// These act as a strong visual anchor for the Gemini model.
const ASPECT_RATIO_CANVASES = {
    '3:4': 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAAECAIAAADpP+8GAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAYSURBVAhXY/z//z8DAwMTAwMDAwMjgAADAF91A/3f28dEAAAAAElFTkSuQmCC', // 3x4 Gray
    '4:3': 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAWSURBVAhXY/z//z8DAwMTAwMjgAADACvZA/1V2u3UAAAAAElFTkSuQmCC', // 4x3 Gray
    '1:1': 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAWSURBVAhXY/z//z8DAwMTAwMjgAADACvZA/1V2u3UAAAAAElFTkSuQmCC', // 1x1, but using 4x4 for visibility
    '9:16': 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAQCAIAAABLKsIUAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAeSURBVBhXY/z//z8DAwMTAwMDAwMjgAADwMTAwMAAAD9fBf+6e3Y1AAAAAElFTkSuQmCC', // 9x16 Gray
    '16:9': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAAyvKMIAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wmetaIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIj4KCTxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CgkJPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpwaG90b3Nob3A9Imh0dHA6Ly9ucy5hZG9iZS5jb20vcGhvdG9zaG9wLzEuMC8iIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI1LjkgKE1hY2ludG9zaCkiIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiPgogICAgIDwvcmRmOkRlc2NyaXB0aW9uPgoJPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KPD94cGFja2V0IGVuZD0iciI/PgHm24MAAAAYdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjMuMTKfqsfWAAAAF0lEQVQYGWNgYGD4//8/AwcDEwMTAwMjgAADABJ/Aw89x91xAAAAAElFTkSuQmCC', // 16x9 Gray
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

        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        let fullPrompt = prompt;
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
            const hasImageInput = characterImage || styleImage || faceReferenceImage;
            let finalPromptText = fullPrompt;

            // --- ROBUST ASPECT RATIO FIX IMPLEMENTATION ---
            if (hasImageInput) {
                const canvasBase64 = ASPECT_RATIO_CANVASES[aspectRatio as keyof typeof ASPECT_RATIO_CANVASES];
                if (canvasBase64) {
                    // 1. Add the pre-sized canvas as the VERY FIRST input.
                    parts.push({ inlineData: { data: canvasBase64, mimeType: 'image/png' } });
                    
                    // 2. Modify the prompt to explicitly command the AI to use the canvas.
                    finalPromptText = `Strictly adhere to the aspect ratio of the initial gray canvas provided. Fill the entire canvas. The artistic content should be: ${fullPrompt}`;
                }
            }
            
            const processImagePart = (imageDataUrl: string | null) => {
                if (!imageDataUrl) return;
                const [header, base64] = imageDataUrl.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
                parts.push({ inlineData: { data: base64, mimeType } });
            };

            processImagePart(characterImage);
            processImagePart(styleImage);
            if (faceReferenceImage) {
                 const isDataUrl = faceReferenceImage.startsWith('data:');
                 if (isDataUrl) {
                    processImagePart(faceReferenceImage);
                 } else {
                    parts.push({ inlineData: { data: faceReferenceImage, mimeType: 'image/png' } });
                 }
            }
            
            // Add the final, potentially modified, text prompt
            parts.push({ text: finalPromptText });
            
            const response = await ai.models.generateContent({
                model: apiModel,
                contents: { parts: parts },
                config: { 
                    responseModalities: [Modality.IMAGE],
                    seed: seed ? Number(seed) : undefined,
                },
            });

            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh từ mô tả này.");

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
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred during image generation.' }) };
    }
};

export { handler };