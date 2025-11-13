// IMPORTANT: This file is now correctly named with a "-background" suffix for Netlify to treat it as a background function.
// The client calls the endpoint WITHOUT the suffix: /.netlify/functions/generate-group-image

import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from 'jimp';

const XP_PER_CHARACTER = 5;

// This is now the "worker" function.
// 1. It receives only a small payload with the job ID.
// 2. It fetches the full job details from the database.
// 3. It performs the long-running AI task.
// 4. It uploads the result.
// 5. It updates the job record in the database with the final status.
const handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return; 

    const { jobId } = JSON.parse(event.body || '{}');

    // FIX: This function now deletes the placeholder record on failure.
    const failJob = async (reason: string) => {
        console.error(`[WORKER] Failing job ${jobId}: ${reason}`);
        await supabaseAdmin.from('generated_images').delete().eq('id', jobId);
    };

    if (!jobId) { console.error("[WORKER] Job ID is missing."); return; }

    try {
        // 1. Fetch the full job details from the database
        // FIX: Query using the 'id' column instead of the non-existent 'job_id' column.
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id') // The 'prompt' column contains the full payload
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData || !jobData.prompt) {
            throw new Error(fetchError?.message || 'Job not found or payload is missing.');
        }

        const payload = JSON.parse(jobData.prompt);
        const { characters, layout, layoutPrompt, background, backgroundPrompt, style, stylePrompt, aspectRatio } = payload;
        const userId = jobData.user_id;

        // 2. Get API Key
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) {
            await failJob('Hết tài nguyên AI. Vui lòng thử lại sau.');
            return;
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // 3. Construct prompt and assets for Gemini
        const parts: any[] = [];
        const characterDetailsLines: string[] = [];
        let imageInputIndex = 1;

        const finalPromptPlaceholder = "PROMPT_PLACEHOLDER"; // Will be replaced later
        parts.push({ text: finalPromptPlaceholder });

        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            let charDescription = `- Character ${i + 1}:`;

            if (char.poseImage) {
                // The image processor is no longer needed here as the AI model is robust enough.
                const [h, b] = char.poseImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription += `\n  - Appearance (OUTFIT, POSE, GENDER, HAIRSTYLE) is defined by Image ${imageInputIndex}.`;
                imageInputIndex++;
            }
            if (char.faceImage) {
                const [h, b] = char.faceImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription += `\n  - **CRITICAL**: The FACE must be an EXACT replica from Image ${imageInputIndex}.`;
                imageInputIndex++;
            }
            characterDetailsLines.push(charDescription);
        }
        
        const megaPrompt = [
            `You are a master digital artist creating a group photo of ${characters.length} characters.`,
            "\n--- SCENE ---",
            `1. **Style:** '${style}'. Details: ${stylePrompt || 'None'}.`,
            `2. **Background:** '${background}'. Details: ${backgroundPrompt || 'None'}.`,
            `3. **Composition:** '${layout}'. Details: ${layoutPrompt || 'Arrange them naturally.'}.`,
            "\n--- CHARACTER BLUEPRINTS (MANDATORY) ---",
            "Follow these assignments with extreme precision. Images are provided sequentially after this prompt.",
            ...characterDetailsLines,
            "\n--- FINAL DIRECTIVES ---",
            "1. **Strict Adherence:** Use the specified images for each character. Do not mix them up.",
            "2. **Harmonization:** Blend all characters seamlessly. Ensure lighting and shadows are consistent.",
            "3. **Quality:** Output a single, high-quality, anatomically correct image."
        ].join('\n');
        
        parts[0].text = megaPrompt;
        
        // 4. Call Gemini AI
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh nhóm. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");

        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType;

        // 5. Upload result to R2
        const s3Client = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT!, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }});
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${userId}/group/${Date.now()}.${finalImageMimeType.split('/')[1] || 'png'}`;
        
        await s3Client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: fileName, Body: imageBuffer, ContentType: finalImageMimeType }));
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
        
        const xpToAward = (characters.length || 0) * XP_PER_CHARACTER;

        // 6. Update DB record to 'completed' and increment user XP
        // FIX: Update using 'id' instead of 'job_id' and remove non-existent 'status' column.
        const [updateJobResult, incrementXpResult] = await Promise.all([
             supabaseAdmin.from('generated_images').update({
                image_url: publicUrl,
            }).eq('id', jobId),

            supabaseAdmin.rpc('increment_user_xp', {
                user_id_param: userId,
                xp_amount: xpToAward,
            })
        ]);

        if (updateJobResult.error) throw new Error(`Failed to update job status: ${updateJobResult.error.message}`);
        if (incrementXpResult.error) {
             // Log the error but don't fail the entire job, as the image was created.
             console.error(`[WORKER] Failed to award XP for job ${jobId}:`, incrementXpResult.error.message);
        }

        await supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id });

    } catch (error: any) {
        console.error("[WORKER] Group image background function error:", error);
        await failJob(error.message || 'Lỗi không xác định từ máy chủ.');
    }
};

export { handler };