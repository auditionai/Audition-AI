import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_PER_IMAGE = 2;
const XP_PER_GENERATION = 15; // More XP for a premium feature

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

        const { prompt, femaleImage, maleImage } = JSON.parse(event.body || '{}');
        if (!prompt || !femaleImage || !maleImage) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and both character images are required.' }) };
        }
        
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < COST_PER_IMAGE) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${COST_PER_IMAGE}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const apiModel = 'gemini-2.5-flash-image';

        const parts: any[] = [];
        const fullPrompt = `Create a scene based on the following instructions, featuring the female character from the first image and the male character from the second image. \n\nPROMPT: "${prompt}"`;
        
        parts.push({ text: fullPrompt });
        
        const addImagePart = (imageDataUrl: string) => {
            if (!imageDataUrl) return;
            const [header, base64] = imageDataUrl.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
            parts.push({ inlineData: { data: base64, mimeType } });
        };
        
        addImagePart(femaleImage);
        addImagePart(maleImage);
            
        const response = await ai.models.generateContent({
            model: apiModel,
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh từ mô tả này. Hãy thử lại.");

        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType;

        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/love-story/${Date.now()}.${fileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        });
        await s3Client.send(putCommand);
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        const newDiamondCount = userData.diamonds - COST_PER_IMAGE;
        const newXp = userData.xp + XP_PER_GENERATION;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: `[AI Love Story] ${prompt}`,
                image_url: publicUrl,
                model_used: apiModel,
            }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -COST_PER_IMAGE,
                transaction_type: 'AI_LOVE_STORY',
                description: 'Tạo ảnh cho AI Love Story'
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount, newXp }),
        };

    } catch (error: any) {
        console.error("Generate love story image function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi không xác định từ máy chủ.' }) };
    }
};

export { handler };