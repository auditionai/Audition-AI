
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

        const { image: imageDataUrl, model } = JSON.parse(event.body || '{}');
        if (!imageDataUrl) return { statusCode: 400, body: JSON.stringify({ error: 'Image data is required.' }) };

        // Validate Cost
        const isPro = model === 'gemini-3-pro-image-preview';
        // UPDATE: Pro cost = 10
        const cost = isPro ? 10 : 1;

        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();
        
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < cost) return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương.' }) };

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
            .from('api_keys')
            .select('id, key_value')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        
        // Selected model logic
        const selectedModel = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image'; 

        const parts: any[] = [];
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)[1];
        parts.push({ inlineData: { data: base64, mimeType } });
        parts.push({ text: "isolate the main subject with a solid black background" });

        // STRICT CONFIG: Do not add extra properties
        const config: any = { 
            responseModalities: [Modality.IMAGE] 
        };
        
        // Note: We don't set imageConfig for editing/bg removal usually, as we want to preserve input aspect ratio if possible.
        // However, if Pro requires it, we might default to 1K, but usually it's safer to omit for editing tasks unless generating new content.

        const response = await ai.models.generateContent({
            model: selectedModel,
            contents: { parts: parts },
            config: config,
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) {
            throw new Error("AI không thể tách nền hình ảnh này.");
        }
        
        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';

        // --- START OF R2 UPLOAD LOGIC ---
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const finalFileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/bg_removed/${Date.now()}.${finalFileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        });

        await (s3Client as any).send(putCommand);

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
        // --- END OF R2 UPLOAD LOGIC ---

        const newDiamondCount = userData.diamonds - cost;
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -cost,
                transaction_type: 'BG_REMOVAL',
                description: `Tách nền ảnh (${isPro ? 'Pro' : 'Flash'})`
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl: publicUrl,
                newDiamondCount,
                imageBase64: finalImageBase64,
                mimeType: finalImageMimeType,
            }),
        };

    } catch (error: any) {
        console.error(`A FATAL ERROR occurred in the image-processor function:`, error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ 
                error: `Lỗi máy chủ nghiêm trọng: ${error.message || 'Unknown server error.'}` 
            }) 
        };
    }
};

export { handler };
