
import type { Handler, HandlerEvent } from "@netlify/functions";
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
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

    try {
        const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }
        
        const rawPayload = event.body;
        if (!rawPayload) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
        }
        
        const payload = JSON.parse(rawPayload);
        const { jobId, characters, referenceImage, model, imageSize = '1K', useSearch = false, removeWatermark = false, prompt, style, aspectRatio } = payload;
        
        if (!jobId || !characters || !Array.isArray(characters) || characters.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Job ID and character data are required.' }) };
        }

        // Cost Calculation
        let baseCost = 1;
        if (model === 'pro') {
            if (imageSize === '4K') baseCost = 20;
            else if (imageSize === '2K') baseCost = 15;
            else baseCost = 10;
        }

        let totalCost = baseCost + characters.length;
        if (removeWatermark) totalCost += 1;

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < totalCost) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        }

        // --- UPLOAD INPUTS TO R2 ---
        const uploadInput = async (base64Data: string | null): Promise<string | null> => {
            if (!base64Data) return null;
            if (base64Data.startsWith('http')) return base64Data; 
            try {
                const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
                const header = base64Data.includes(',') ? base64Data.split(',')[0] : '';
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                const ext = mimeType.split('/')[1] || 'jpg';
                
                const buffer = Buffer.from(cleanBase64, 'base64');
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

        // Upload Inputs
        const uploadedRefImage = await uploadInput(referenceImage);
        const uploadedCharacters = await Promise.all(characters.map(async (c: any) => {
            const [poseUrl, faceUrl] = await Promise.all([
                uploadInput(c.poseImage),
                uploadInput(c.faceImage)
            ]);
            return { ...c, poseImage: poseUrl, faceImage: faceUrl };
        }));

        const newDiamondCount = userData.diamonds - totalCost;

        // Optimized Payload with URLs
        const optimizedPayload = { 
            jobId,
            characters: uploadedCharacters, 
            referenceImage: uploadedRefImage, 
            prompt, style, aspectRatio, model, 
            imageSize, useSearch, removeWatermark,
            totalCost 
        };

        // Create initial job data struct
        const initialJobData = {
            payload: optimizedPayload,
            progress: 'Đang khởi tạo tác vụ...'
        };

        // Store prompt as Stringified JSON to be safe with all Supabase column types
        const { error: insertError } = await supabaseAdmin.from('generated_images').insert({
            id: jobId,
            user_id: user.id,
            model_used: model === 'pro' ? `Group Studio (Pro ${imageSize})` : 'Group Studio (Flash)',
            prompt: JSON.stringify(initialJobData), 
            is_public: false,
            image_url: 'PENDING',
        });
        
        if (insertError) {
            if (insertError.code !== '23505') { // Ignore unique constraint error if retrying
                throw new Error(`Failed to create job record: ${insertError.message}`);
            }
        }

        let description = `Tạo ảnh nhóm ${characters.length} người (${model === 'pro' ? `Pro ${imageSize}` : 'Flash'})`;
        if (removeWatermark) description += " + NoWatermark";

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'GROUP_IMAGE_GENERATION',
                description: description,
            }),
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Job record created successfully.', newDiamondCount })
        };

    } catch (error: any) {
        console.error("Generate group image spawner error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error during task initialization.' }) };
    }
};

export { handler };
