
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service';

// Helper to fetch image from URL back to base64/buffer (Node.js compatible)
const fetchImage = async (url: string | null): Promise<{ data: string; mimeType: string } | null> => {
    if (!url) return null;
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
    console.error(`[SINGLE WORKER] Failing job ${jobId}: ${reason}. Refunding ${cost}.`);
    try {
        const { data: userNow } = await supabaseAdmin.from('users').select('diamonds').eq('id', userId).single();
        if (userNow) {
            const refundBalance = userNow.diamonds + cost;
            await Promise.all([
                supabaseAdmin.from('generated_images').delete().eq('id', jobId),
                supabaseAdmin.from('users').update({ diamonds: refundBalance }).eq('id', userId),
                supabaseAdmin.from('diamond_transactions_log').insert({
                    user_id: userId,
                    amount: cost,
                    transaction_type: 'REFUND',
                    description: `Hoàn tiền lỗi Tạo ảnh: ${reason.substring(0, 50)}`,
                })
            ]);
        }
    } catch (e) {
        console.error("Critical failure during refund:", e);
    }
};

const handler: Handler = async (event: HandlerEvent) => {
    // Background functions might not wait for response, but we return 200 logic
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) return { statusCode: 400, body: "Missing Job ID" };

    let userId = "";
    let totalCost = 0;

    try {
        // 1. Fetch Job Data
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData) throw new Error("Job not found");
        
        userId = jobData.user_id;
        
        // Parse payload stored in 'prompt' column
        let payload;
        try {
             payload = JSON.parse(jobData.prompt); 
        } catch (e) {
             // Fallback if prompt is just text (legacy)
             payload = { prompt: jobData.prompt };
        }

        const { 
            prompt, apiModel, characterImageUrl, faceReferenceImageUrl, styleImageUrl, 
            aspectRatio, negativePrompt, seed, useUpscaler,
            imageSize = '1K', useGoogleSearch = false, removeWatermark = false,
            totalCost: costFromPayload 
        } = payload;

        totalCost = costFromPayload || 0;

        // 2. Setup AI
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const isProModel = apiModel === 'gemini-3-pro-image-preview';

        // 3. Construct Prompt & Fetch Inputs
        let fullPrompt = "";
        
        // System Instruction for Outpainting if Input Canvas (Character Image) is present
        if (characterImageUrl) {
            fullPrompt = `
            *** SYSTEM COMMAND: OUTPAINTING & EXPANSION ***
            1. [INPUT ANALYSIS]: The image labeled 'INPUT_CANVAS' contains a subject placed on a GRAY (#808080) or WHITE padding background with a SOLID BORDER.
            2. [MANDATORY ACTION]: The GRAY/WHITE area is VOID space. You MUST NOT preserve it.
            3. [GENERATION]:
               - EXTEND the scene from the central subject outwards to FILL the entire canvas.
               - GENERATE new background details (scenery, lighting, environment) to replace the gray/white bars.
               - The final image MUST NOT have any solid color borders or bars. It must be a full-bleed illustration.
            4. [SUBJECT PRESERVATION]: Keep the character's Pose, Outfit, and Identity exactly as shown in the non-gray parts. Blend them seamlessly into the newly generated background.
            
            **USER PROMPT:** ${prompt}
            **STYLE:** Hyper-realistic 3D Render, Audition Game Style, High Fidelity, Volumetric Lighting.
            `;
        } else {
            fullPrompt = `${prompt}\n\n**STYLE:**\n- **Hyper-realistic 3D Render** (High-end Game Cinematic style, Unreal Engine 5).\n- Detailed skin texture, volumetric lighting, raytracing reflections.`;
        }

        if (faceReferenceImageUrl) {
            fullPrompt += `\n\n**FACE ID:**\n- Use the exact facial structure from 'Face Reference'. Blend it seamlessly.`;
        }

        const hardNegative = "photorealistic, real photo, grainy, low quality, 2D, sketch, cartoon, flat color, stiff pose, t-pose, mannequin, looking at camera blankly, distorted face, ugly, blurry, deformed hands, gray borders, gray bars, letterbox, pillarbox, cropped, vertical crop, monochrome background, gray background, border, frame, blank space, white background";
        fullPrompt += ` --no ${hardNegative}, ${negativePrompt || ''}`;

        const parts: any[] = [];
        parts.push({ text: fullPrompt });

        // Parallel fetch inputs
        const [charData, styleData, faceData] = await Promise.all([
            fetchImage(characterImageUrl),
            fetchImage(styleImageUrl),
            fetchImage(faceReferenceImageUrl)
        ]);

        if (charData) {
            parts.push({ text: "[INPUT_CANVAS]" });
            parts.push({ inlineData: { data: charData.data, mimeType: charData.mimeType } });
        }
        if (styleData) {
            parts.push({ text: "[STYLE_REFERENCE]" });
            parts.push({ inlineData: { data: styleData.data, mimeType: styleData.mimeType } });
        }
        if (faceData) {
            parts.push({ text: "[FACE_REFERENCE]" });
            parts.push({ inlineData: { data: faceData.data, mimeType: faceData.mimeType } });
        }

        const config: any = { 
            responseModalities: [Modality.IMAGE],
            seed: seed ? Number(seed) : undefined,
            imageConfig: { 
                aspectRatio: aspectRatio, 
                imageSize: isProModel ? imageSize : undefined
            }
        };

        if (isProModel && useGoogleSearch) {
            config.tools = [{ googleSearch: {} }]; 
        }

        console.log(`[WORKER] Generating image for Job ${jobId} using ${apiModel}...`);
        
        // Call Gemini API
        const response = await ai.models.generateContent({
            model: apiModel,
            contents: { parts: parts },
            config: config,
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) {
            throw new Error("AI Generation failed (No output).");
        }

        // 4. Watermark & Upload Final Result
        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        
        let imageBuffer = Buffer.from(finalImageBase64, 'base64');
        
        if (!removeWatermark) {
            // Pass empty string as URL since the service now loads local file
            imageBuffer = await addSmartWatermark(imageBuffer, '');
        }

        // Init S3 Client for R2
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

        // 5. Update DB (Completion)
        // Overwrite the complex payload JSON in 'prompt' column with the simple user prompt string for clean display in UI
        await Promise.all([
            supabaseAdmin.from('generated_images').update({ 
                image_url: publicUrl,
                prompt: prompt // Restore simple prompt text
            }).eq('id', jobId),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

        console.log(`[WORKER] Job ${jobId} completed.`);

    } catch (error: any) {
        if (userId) {
            await failJob(jobId, userId, error.message, totalCost);
        }
    }

    return { statusCode: 200 };
};

export { handler };
