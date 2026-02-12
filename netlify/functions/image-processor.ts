
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
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

        const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

        const { image: imageDataUrl, model } = JSON.parse(event.body || '{}');
        if (!imageDataUrl) return { statusCode: 400, body: JSON.stringify({ error: 'Image data is required.' }) };

        // 1. Validate Cost & Balance (Read Only)
        const isPro = model === 'gemini-3-pro-image-preview';
        const cost = isPro ? 10 : 1;

        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();
        
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < cost) return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương.' }) };

        // 2. Process with AI
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
            .from('api_keys')
            .select('id, key_value')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const selectedModel = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image'; 

        const parts: any[] = [];
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)[1];
        parts.push({ inlineData: { data: base64, mimeType } });
        parts.push({ text: "isolate the main subject with a solid black background" });

        // Add safety settings
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ];

        try {
            const response = await ai.models.generateContent({
                model: selectedModel,
                contents: { parts: parts },
                config: { 
                    responseModalities: [Modality.IMAGE],
                    safetySettings: safetySettings 
                },
            });

            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) {
                 if (response.promptFeedback?.blockReason) {
                     throw new Error(`Ảnh bị AI chặn do vi phạm an toàn: ${response.promptFeedback.blockReason}`);
                }
                throw new Error("AI không thể tách nền hình ảnh này.");
            }
            
            const finalImageBase64 = imagePartResponse.inlineData.data;
            const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';

            // 3. Upload to R2
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

            // 4. Deduct Diamonds (Pay on Success)
            const { data: latestUser } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
            const newDiamondCount = (latestUser?.diamonds || userData.diamonds) - cost;

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
        } catch (genError: any) {
            // Check for specific API error
            let msg = genError.message;
            if (msg.includes('400')) msg = 'AI không hiểu ảnh này hoặc ảnh không hợp lệ (400).';
            if (msg.includes('500')) msg = 'Lỗi hệ thống AI Google (500).';
            throw new Error(msg);
        }

    } catch (error: any) {
        console.error(`Image Processor Error:`, error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };