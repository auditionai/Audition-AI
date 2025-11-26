
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

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    const token = authHeader.split(' ')[1];
    
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    try {
        const { image, mode } = JSON.parse(event.body || '{}');
        if (!image) return { statusCode: 400, body: JSON.stringify({ error: 'Image data required.' }) };

        // 1. Cost Calculation
        const cost = mode === 'pro' ? 10 : 1;
        const { data: userData } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        
        if (!userData || userData.diamonds < cost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${cost} 💎` }) };
        }

        // 2. AI Processing
        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('key_value, id').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (!apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Service busy.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const modelName = mode === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
        
        const [header, base64] = image.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';

        const prompt = `
            **TASK:** Image Restoration and Enhancement.
            **INPUT:** A low quality or blurry image.
            **OUTPUT:** A high fidelity, sharp, clean version of the same image.
            **INSTRUCTIONS:**
            1. Remove noise and artifacts.
            2. Sharpen details (especially face and eyes).
            3. Upscale resolution.
            4. Enhance lighting and color balance.
            5. DO NOT change the content or composition. Keep it identical to input, just higher quality.
        `;

        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { data: base64, mimeType } }
                ]
            },
            config: { 
                responseModalities: [Modality.IMAGE],
                imageConfig: mode === 'pro' ? { imageSize: '2K' } : undefined
            }
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart?.inlineData) throw new Error("AI failed to enhance image.");

        const finalImageBase64 = imagePart.inlineData.data;
        const finalMimeType = imagePart.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';

        // 3. Upload Result to R2 (Temp folder)
        const buffer = Buffer.from(finalImageBase64, 'base64');
        const ext = finalMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/enhanced/${Date.now()}_${mode}.${ext}`;

        await (s3Client as any).send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: buffer,
            ContentType: finalMimeType
        }));

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        // 4. Transaction
        const newBalance = userData.diamonds - cost;
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newBalance }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -cost,
                transaction_type: 'TOOL_USE',
                description: `Làm nét ảnh (${mode === 'pro' ? 'Pro' : 'Flash'})`
            })
        ]);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store' // Prevent caching
            },
            body: JSON.stringify({ 
                success: true, 
                imageUrl: publicUrl, 
                // imageBase64 removed to prevent timeout/payload size issues
                mimeType: finalMimeType,
                newDiamondCount: newBalance 
            }),
        };

    } catch (error: any) {
        console.error("Enhance error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
