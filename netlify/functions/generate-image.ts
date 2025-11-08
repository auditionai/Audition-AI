import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_PER_GENERATION = 1;
const XP_PER_GENERATION = 10;

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

        const { prompt, apiModel, characterImage, faceReferenceImage } = JSON.parse(event.body || '{}');
        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < COST_PER_GENERATION) return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương.' }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        let finalImageBase64: string;
        let finalImageMimeType: string;

        if (apiModel.startsWith('imagen')) {
            const response = await ai.models.generateImages({
                model: apiModel,
                prompt: prompt,
                config: { numberOfImages: 1, outputMimeType: 'image/png' },
            });
            finalImageBase64 = response.generatedImages[0].image.imageBytes;
            finalImageMimeType = 'image/png';
        } else { // Assuming gemini-flash-image
            const parts: any[] = [];
            
            // Add main character/pose image if provided
            if (characterImage) {
                const [header, base64] = characterImage.split(',');
                const mimeType = header.match(/:(.*?);/)[1];
                parts.push({ inlineData: { data: base64, mimeType } });
            }

            // Add dedicated face reference image if provided
            if (faceReferenceImage) {
                const [header, base64] = faceReferenceImage.split(',');
                const mimeType = header.match(/:(.*?);/)[1];
                // Add it as another part for the model to reference
                parts.push({ inlineData: { data: base64, mimeType } });
            }
            
            // Always add the text prompt
            parts.push({ text: prompt });
            
            const response = await ai.models.generateContent({
                model: apiModel,
                contents: { parts: parts },
                config: { responseModalities: [Modality.IMAGE] },
            });

            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh từ mô tả này.");

            finalImageBase64 = imagePartResponse.inlineData.data;
            finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
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

        const newDiamondCount = userData.diamonds - COST_PER_GENERATION;
        const newXp = userData.xp + XP_PER_GENERATION;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: prompt,
                image_url: publicUrl,
                model_used: apiModel
            }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -COST_PER_GENERATION,
                transaction_type: 'IMAGE_GENERATION',
                description: `Tạo ảnh: ${prompt.substring(0, 50)}...`
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
