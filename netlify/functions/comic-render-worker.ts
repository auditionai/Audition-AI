
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST = 10; // For refund calculation

const processDataUrl = (dataUrl: string | null) => {
    if (!dataUrl) return null;
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return { base64, mimeType };
};

const failJob = async (jobId: string, userId: string, reason: string) => {
    console.error(`[COMIC WORKER] Failing job ${jobId}: ${reason}`);
    try {
        // Refund and Delete Job
        await Promise.all([
            supabaseAdmin.from('generated_images').delete().eq('id', jobId),
            supabaseAdmin.rpc('increment_user_diamonds', { user_id_param: userId, diamond_amount: COST }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: userId,
                amount: COST,
                transaction_type: 'REFUND',
                description: `Hoàn tiền vẽ truyện thất bại (Lỗi: ${reason.substring(0, 50)})`,
            })
        ]);
    } catch (e) {
        console.error("Critical failure during refund:", e);
    }
};

const handler: Handler = async (event: HandlerEvent) => {
    // Fire-and-forget style, return 200 immediately to client usually, 
    // but here we are called by the client to start processing.
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) return { statusCode: 400, body: "Missing Job ID" };

    let userId = "";

    try {
        // 1. Fetch Job Details
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData) throw new Error("Job not found");
        
        userId = jobData.user_id;
        const jobConfig = JSON.parse(jobData.prompt);
        const { panel, characters, style, aspectRatio } = jobConfig.payload;

        // 2. Get API Key
        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('key_value, id').eq('status', 'active').limit(1).single();
        if (!apiKeyData) throw new Error('Hết tài nguyên AI.');

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // 3. Prepare Prompt
        const parts: any[] = [];
        const systemPrompt = `
            You are a master comic artist specialized in ${style} style.
            Generate a single high-quality comic panel based on the description.
            
            **Visual Description:**
            ${panel.visual_description}
            
            **Style Constraints:**
            - Art Style: ${style}
            - High contrast, expressive lines.
            - Cinematic lighting.
            - Do NOT include speech bubbles or text in the image.
        `;
        parts.push({ text: systemPrompt });

        // Add Character References
        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        parts.push({ text: `Reference for character "${char.name}":` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

        // 4. Generate (Heavy Operation)
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: {
                    aspectRatio: aspectRatio || '16:9',
                    imageSize: '2K'
                }
            }
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart?.inlineData) throw new Error("AI failed to render.");

        // 5. Upload (Heavy Operation)
        const s3Client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_ENDPOINT!,
            credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
        });

        const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
        const fileName = `${userId}/comic/${Date.now()}_panel_${panel.panel_number}.png`;
        
        await (s3Client as any).send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: buffer,
            ContentType: 'image/png'
        }));

        if (!process.env.R2_PUBLIC_URL) {
            throw new Error("Server configuration error: Missing R2_PUBLIC_URL");
        }

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        // Add a small delay to ensure CDN propagation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 6. Finalize Job (Update DB)
        // We restore the prompt to just the visual description or keep it clean, 
        // and set the real image_url.
        await Promise.all([
            supabaseAdmin.from('generated_images').update({ 
                image_url: publicUrl,
                prompt: panel.visual_description // Clean up the prompt column
            }).eq('id', jobId),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

        console.log(`[WORKER] Job ${jobId} completed successfully.`);

    } catch (error: any) {
        if (userId) {
            await failJob(jobId, userId, error.message);
        }
    }

    return { statusCode: 200 };
};

export { handler };
