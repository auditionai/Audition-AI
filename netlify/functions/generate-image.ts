
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_UPSCALE = 1;
const COST_REMOVE_WATERMARK = 1; 

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
        
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (e) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
        }

        const { 
            prompt, apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, negativePrompt, seed, useUpscaler,
            imageSize = '1K', useGoogleSearch = false,
            removeWatermark = false 
        } = body;

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        // --- 1. CALCULATE COST ---
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
        
        // --- 2. CHECK BALANCE & DEDUCT UPFRONT ---
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        
        if (userData.diamonds < totalCost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        }
        
        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = userData.xp + 10; // Anticipated XP
        
        let logDescription = `Tạo ảnh`;
        if (isProModel) logDescription += ` (Pro ${imageSize})`; else logDescription += ` (Flash)`;
        if (useUpscaler) logDescription += " + Upscale";
        if (removeWatermark) logDescription += " + NoWatermark";

        // --- 3. CREATE JOB RECORD & UPLOAD INPUTS ---
        const jobId = crypto.randomUUID();

        // Helper to upload input to R2 Temp
        const uploadInput = async (base64Data: string | null): Promise<string | null> => {
            if (!base64Data) return null;
            try {
                const [header, base64] = base64Data.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                const ext = mimeType.split('/')[1] || 'jpg';
                const buffer = Buffer.from(base64, 'base64');
                const key = `temp/${user.id}/${jobId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
                
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

        // Save job payload (JSON) to 'prompt' column temporarily
        const jobPayload = {
            prompt, apiModel, 
            characterImageUrl: charUrl, 
            faceReferenceImageUrl: faceUrl, 
            styleImageUrl: styleUrl,
            aspectRatio, negativePrompt, seed, useUpscaler,
            imageSize, useGoogleSearch, removeWatermark,
            totalCost // Save cost for refunding if failure
        };

        await Promise.all([
            // Deduct Money
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            // Log Transaction
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'IMAGE_GENERATION',
                description: logDescription
            }),
            // Create PENDING Job
            supabaseAdmin.from('generated_images').insert({
                id: jobId,
                user_id: user.id,
                prompt: JSON.stringify(jobPayload), // Store full payload here for worker
                image_url: 'PENDING',
                model_used: apiModel,
                used_face_enhancer: !!faceReferenceImage
            })
        ]);

        // --- 4. TRIGGER WORKER ---
        fetch(`${process.env.URL}/.netlify/functions/generate-image-background`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId })
        }).catch(e => console.error("Failed to trigger worker", e));

        return {
            statusCode: 202, // Accepted
            body: JSON.stringify({ 
                jobId, 
                newDiamondCount, 
                newXp,
                message: "Tác vụ đang được xử lý nền." 
            }),
        };

    } catch (error: any) {
        console.error("Generate image spawner error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi không xác định từ máy chủ.' }) };
    }
};

export { handler };
