
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service';

// Helper to fetch image from URL
const fetchImage = async (url: string | null): Promise<{ data: string; mimeType: string } | null> => {
    if (!url) return null;
    if (url.startsWith('data:')) {
         const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
         return matches ? { mimeType: matches[1], data: matches[2] } : null;
    }
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch input image");
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        return { data: base64, mimeType };
    } catch (e) {
        console.error("Failed to fetch image:", url);
        return null;
    }
};

const failJob = async (jobId: string, userId: string, reason: string, cost: number) => {
    console.error(`[SINGLE WORKER] Failing job ${jobId}: ${reason}.`);
    try {
        const { data: userNow } = await supabaseAdmin.from('users').select('diamonds').eq('id', userId).single();
        if (userNow) {
            await Promise.all([
                supabaseAdmin.from('generated_images').update({ 
                    image_url: `FAILED: ${reason.substring(0, 200)}` 
                }).eq('id', jobId),
                
                supabaseAdmin.from('users').update({ diamonds: userNow.diamonds + cost }).eq('id', userId),
                supabaseAdmin.from('diamond_transactions_log').insert({
                    user_id: userId,
                    amount: cost,
                    transaction_type: 'REFUND',
                    description: `Hoàn tiền: ${reason.substring(0, 50)}...`,
                })
            ]);
        }
    } catch (e) {}
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) return { statusCode: 400, body: "Missing Job ID" };

    let userId = "";
    let totalCost = 0;

    try {
        // 1. Fetch Lightweight Job Data
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData) throw new Error("Job not found in database");
        
        userId = jobData.user_id;
        
        let payload;
        try {
             payload = JSON.parse(jobData.prompt); 
        } catch (e) {
             throw new Error("Invalid job payload format.");
        }

        const { 
            prompt, apiModel, characterImageUrl, faceReferenceImageUrl, styleImageUrl, 
            aspectRatio, negativePrompt, seed,
            imageSize = '1K', useGoogleSearch = false, removeWatermark = false,
            totalCost: costFromPayload 
        } = payload;

        totalCost = costFromPayload || 0;

        // 2. Setup AI
        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (!apiKeyData) throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const isProModel = apiModel === 'gemini-3-pro-image-preview';

        // 3. Prompt Construction
        const styleEnforcement = `
        ** AESTHETIC RULES: AUDITION GAME STYLE **
        1. [MEDIUM]: 3D CGI Render.
        2. [SKIN]: Smooth, stylized 3D skin texture.
        3. [LIGHTING]: Volumetric lighting, bloom.
        `;

        let fullPrompt = `${styleEnforcement} **SCENE:** ${prompt}`;
        if (characterImageUrl) {
            fullPrompt += `\n**CHARACTER:** Use provided input as reference. Preserve outfit and pose. Fill background.`;
        }
        const hardNegative = "photograph, real life, grainy, noise, jpeg artifacts, low quality, distorted, ugly, blurry, gray borders, letterbox, watermark, text";
        fullPrompt += ` --no ${hardNegative}, ${negativePrompt || ''}`;

        const parts: any[] = [{ text: fullPrompt }];

        // 4. Download Assets from URLs (Parallel)
        const [charData, styleData, faceData] = await Promise.all([
            fetchImage(characterImageUrl),
            fetchImage(styleImageUrl),
            fetchImage(faceReferenceImageUrl)
        ]);

        if (charData) parts.push({ inlineData: { data: charData.data, mimeType: charData.mimeType } });
        if (styleData) parts.push({ inlineData: { data: styleData.data, mimeType: styleData.mimeType } });
        if (faceData) parts.push({ inlineData: { data: faceData.data, mimeType: faceData.mimeType } });

        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ];

        const config: any = { 
            responseModalities: [Modality.IMAGE],
            seed: seed ? Number(seed) : undefined,
            safetySettings: safetySettings,
            imageConfig: { 
                aspectRatio: aspectRatio, 
                imageSize: isProModel ? imageSize : undefined
            }
        };

        if (isProModel && useGoogleSearch) config.tools = [{ googleSearch: {} }];

        // 5. Generate
        const response = await ai.models.generateContent({
            model: apiModel,
            contents: { parts: parts },
            config: config,
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI không trả về kết quả hình ảnh.");

        // 6. Watermark & Upload
        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        
        let imageBuffer = Buffer.from(finalImageBase64, 'base64');
        if (!removeWatermark) {
            imageBuffer = await addSmartWatermark(imageBuffer, '');
        }

        const s3Client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_ENDPOINT!,
            credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
        });

        const fileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${userId}/${Date.now()}_${isProModel ? 'pro' : 'flash'}.${fileExtension}`;

        await (s3Client as any).send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        }));

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        // 7. Success Update
        await Promise.all([
            supabaseAdmin.from('generated_images').update({ 
                image_url: publicUrl,
                prompt: prompt 
            }).eq('id', jobId),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

        console.log(`[SINGLE WORKER] Job ${jobId} completed.`);

    } catch (error: any) {
        if (userId) await failJob(jobId, userId, error.message, totalCost);
    }

    return { statusCode: 200 };
};

export { handler };
