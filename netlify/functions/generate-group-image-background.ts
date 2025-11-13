// IMPORTANT: This file is now correctly named with a "-background" suffix for Netlify to treat it as a background function.
// The client calls the endpoint WITHOUT the suffix: /.netlify/functions/generate-group-image

import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const XP_PER_CHARACTER = 5;

// This is now the "worker" function.
const handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return; 

    const { jobId } = JSON.parse(event.body || '{}');

    const failJob = async (reason: string) => {
        console.error(`[WORKER] Failing job ${jobId}: ${reason}`);
        await supabaseAdmin.from('generated_images').delete().eq('id', jobId);
    };

    if (!jobId) { console.error("[WORKER] Job ID is missing."); return; }

    try {
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData || !jobData.prompt) {
            throw new Error(fetchError?.message || 'Job not found or payload is missing.');
        }

        const payload = JSON.parse(jobData.prompt);
        const { characters, referenceImage, prompt, style, aspectRatio } = payload;
        const userId = jobData.user_id;

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) {
            await failJob('Hết tài nguyên AI. Vui lòng thử lại sau.');
            return;
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // --- NEW PROMPT ENGINEERING LOGIC ---
        const parts: any[] = [];
        const characterDetailsLines: string[] = [];
        let imageInputIndex = 1; // Start counting from 1 for human-readable prompt

        // Add Reference Image first (this will be Image 1)
        if (referenceImage) {
            const [h, b] = referenceImage.split(',');
            parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
            imageInputIndex++;
        } else {
             throw new Error('Reference image is missing from the payload.');
        }
        
        // Add all character and face images
        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            let charDescription = `- Character ${i + 1}:`;

            if (char.poseImage) {
                const [h, b] = char.poseImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription += `\n  - Their **OUTFIT, GENDER, and GENERAL APPEARANCE** are defined by Image ${imageInputIndex}.`;
                imageInputIndex++;
            }
            if (char.faceImage) {
                const [h, b] = char.faceImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription += `\n  - **CRITICAL**: Their **FACE** must be an EXACT replica from Image ${imageInputIndex}.`;
                imageInputIndex++;
            }
            characterDetailsLines.push(charDescription);
        }

        const megaPrompt = [
            "You are a master film director and artist creating a high-quality group photo. Your primary goal is to intelligently recreate the scene from the first image provided (Image 1) using a new cast of characters.",
            "\n--- CORE MISSION ---",
            "1. **Analyze Image 1 (The Blueprint):** Deeply analyze the first image provided for its overall **composition, background environment, lighting, mood, and the specific poses and positions** of each person in it.",
            "2. **Recast the Scene:** You will now replace the people in Image 1 with the new characters provided in the subsequent images.",
            `3. **Generate a NEW Image:** Create a completely new, photorealistic, and coherent image. **DO NOT cut and paste**. You must redraw the entire scene, placing the new characters into the poses and positions from the blueprint image.`,

            "\n--- CHARACTER ASSIGNMENTS (STRICTLY FOLLOW) ---",
            "Use the following images to define the new characters:",
            ...characterDetailsLines,
            `There are a total of ${characters.length} new characters to place in the scene.`,

            "\n--- ARTISTIC & CONTEXTUAL GUIDELINES ---",
            `1. **Art Style:** The final image must have a '${style}' aesthetic.`,
            `2. **User Prompt:** Incorporate these additional details into the scene: "${prompt || 'Follow the reference image closely.'}"`,
            "3. **Final Directives:** Ensure all characters are blended seamlessly into the background. Lighting, shadows, and perspective must be consistent and realistic. The final output must be a single, high-quality, anatomically correct image."
        ].join('\n');
        
        // Add the prompt as the first part.
        parts.unshift({ text: megaPrompt });
        
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
             console.error(`[WORKER] Failed to award XP for job ${jobId}:`, incrementXpResult.error.message);
        }

        await supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id });

    } catch (error: any) {
        console.error("[WORKER] Group image background function error:", error);
        await failJob(error.message || 'Lỗi không xác định từ máy chủ.');
    }
};

export { handler };