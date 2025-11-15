import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_PER_REMOVAL = 1;

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
        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };
        }

        // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }

        const { image: imageDataUrl } = JSON.parse(event.body || '{}');
        if (!imageDataUrl) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Image data is required.' }) };
        }

        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();
        
        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < COST_PER_REMOVAL) {
            return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương.' }) };
        }

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
            .from('api_keys')
            .select('id, key_value')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (apiKeyError || !apiKeyData) {
            return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        }

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const model = 'gemini-2.5-flash-image'; 

        const parts: any[] = [];
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)[1];
        parts.push({ inlineData: { data: base64, mimeType } });
        parts.push({ text: "isolate the main subject with a solid black background" });

        const response = await ai.models.generateContent({
            model,
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE] },
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

        // FIX: Cast s3Client to 'any' to bypass a likely environment-specific TypeScript type resolution error.
        await (s3Client as any).send(putCommand);

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
        // --- END OF R2 UPLOAD LOGIC ---

        const newDiamondCount = userData.diamonds - COST_PER_REMOVAL;
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -COST_PER_REMOVAL,
                transaction_type: 'BG_REMOVAL',
                description: 'Tách nền ảnh'
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