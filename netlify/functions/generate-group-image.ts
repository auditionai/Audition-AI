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
            let charDescription = `- **Character ${i + 1}:**`;

            if (char.poseImage) {
                const [h, b] = char.poseImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription += `\n  - **ABSOLUTE RULE:** Their **ENTIRE APPEARANCE** (outfit, all clothing, accessories, shoes, hair style, hair color, body shape) is **PERFECTLY PRESERVED** from Image ${imageInputIndex}. It is FORBIDDEN to alter, add, or remove any detail.`;
                imageInputIndex++;
            }
            if (char.faceImage) {
                const [h, b] = char.faceImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription += `\n  - **CRITICAL RULE:** Their **FACE** is **SACROSANCT**. It must be an EXACT, 100% replica from Image ${imageInputIndex}. Do not stylize or change it in any way.`;
                imageInputIndex++;
            }
            characterDetailsLines.push(charDescription);
        }

        const megaPrompt = [
            "You are a master film director and artist creating a high-quality group photo. Your primary goal is to intelligently and faithfully recreate the scene from the first image provided (Image 1) using a new cast of characters.",
            "\n--- CORE MISSION ---",
            "1. **Analyze Image 1 (The Blueprint):** Deeply analyze the first image for its:",
            "   - **Composition:** Poses, positions, and interactions of people.",
            "   - **Environment:** Background, setting, mood, and lighting.",
            "   - **Cinematography (CRITICAL):**",
            "     - **Camera Framing:** Identify if it's a **close-up (headshot), medium shot (waist up), or full shot (full body)**. The final image MUST use the same framing.",
            "     - **Camera Angle:** Identify if it's a **low angle, eye-level, or high angle** shot and replicate it precisely.",
            "2. **Recast the Scene:** You will now replace the people in Image 1 with the new characters provided in the subsequent images, placing them into the EXACT poses and positions from the blueprint.",
            "3. **Generate a NEW Image:** Create a completely new, photorealistic, and coherent image. **DO NOT cut and paste**. You must redraw the entire scene based on your analysis.",

            "\n--- CHARACTER ASSIGNMENTS (NON-NEGOTIABLE RULES) ---",
            "Use the following images to define the new characters. These rules are absolute:",
            ...characterDetailsLines,
            `There are a total of ${characters.length} new characters to place in the scene.`,

            "\n--- ARTISTIC & CONTEXTUAL GUIDELINES ---",
            `1. **Art Style:** The final image must have a '${style}' aesthetic.`,
            `2. **User Prompt:** Incorporate these additional details into the scene: "${prompt || 'Follow the reference image closely.'}"`,
            "3. **Final Directives:** Ensure all characters are blended seamlessly into the background. Lighting, shadows, and perspective must be consistent with the blueprint image. The final output must be a single, high-quality, anatomically correct image."
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