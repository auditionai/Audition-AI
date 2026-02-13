
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_UPSCALE = 1;
const COST_REMOVE_WATERMARK = 1; 

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Init S3
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        
        const authHeader = event.headers['authorization'];
        if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        const token = authHeader.split(' ')[1];

        const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        
        const body = JSON.parse(event.body || '{}');
        const { 
            prompt, apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, negativePrompt, seed, useUpscaler,
            imageSize = '1K', useGoogleSearch = false,
            removeWatermark = false 
        } = body;

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        // --- 2. Cost Check ---
        let baseCost = 1;
        const isProModel = apiModel === 'gemini-3-pro-image-preview';

        if (isProModel) {
             if (imageSize === '4K') baseCost = 20;
             else if (imageSize === '2K') baseCost = 15;
             else baseCost = 10;
        }
        
        let totalCost = baseCost;
        if (useUpscaler) totalCost += COST_UPSCALE;
        if (removeWatermark) totalCost += COST_REMOVE_WATERMARK; 
        
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        
        if (userData.diamonds < totalCost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        }
        
        // --- 3. UPLOAD ASSETS TO R2 (Optimized) ---
        const jobId = crypto.randomUUID();
        
        const uploadInput = async (base64Data: string | null): Promise<string | null> => {
            if (!base64Data) return null;
            if (base64Data.startsWith('http')) return base64Data;
            try {
                const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) return null;
                const mimeType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const ext = mimeType.split('/')[1] || 'jpg';
                
                const key = `temp/${user.id}/${jobId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
                await (s3Client as any).send(new PutObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME!,
                    Key: key,
                    Body: buffer,
                    ContentType: mimeType
                }));
                return `${process.env.R2_PUBLIC_URL}/${key}`;
            } catch (e) {
                console.error("Input upload failed", e);
                return null;
            }
        };

        const [charUrl, faceUrl, styleUrl] = await Promise.all([
            uploadInput(characterImage),
            uploadInput(faceReferenceImage),
            uploadInput(styleImage)
        ]);

        // --- 4. CREATE JOB & DEDUCT ---
        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = userData.xp + 10;
        
        let logDescription = `Tạo ảnh ${isProModel ? `(Pro ${imageSize})` : '(Flash)'}`;
        if (useUpscaler) logDescription += " + Upscale";
        if (removeWatermark) logDescription += " + NoWatermark";

        // Save lightweight job payload (URLs only)
        const jobPayload = {
            prompt, apiModel, 
            characterImageUrl: charUrl, 
            faceReferenceImageUrl: faceUrl, 
            styleImageUrl: styleUrl,
            aspectRatio, negativePrompt, seed, useUpscaler,
            imageSize, useGoogleSearch, removeWatermark,
            totalCost 
        };

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'IMAGE_GENERATION',
                description: logDescription
            }),
            supabaseAdmin.from('generated_images').insert({
                id: jobId,
                user_id: user.id,
                prompt: JSON.stringify(jobPayload), // URL-based JSON
                image_url: 'PENDING',
                model_used: apiModel,
                used_face_enhancer: !!faceUrl
            })
        ]);

        return {
            statusCode: 202,
            body: JSON.stringify({ 
                jobId, 
                newDiamondCount, 
                newXp,
                message: "Tác vụ đã được tạo. Đang kích hoạt xử lý..." 
            }),
        };

    } catch (error: any) {
        console.error("Generate image spawner error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi server.' }) };
    }
};

export { handler };
