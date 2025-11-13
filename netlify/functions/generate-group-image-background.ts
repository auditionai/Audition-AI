// IMPORTANT: This file is now correctly named with a "-background" suffix for Netlify to treat it as a background function.
// The client calls the endpoint WITHOUT the suffix: /.netlify/functions/generate-group-image

import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from 'jimp';

const XP_PER_CHARACTER = 5;

const processImageForGemini = async (imageDataUrl: string | null, targetAspectRatio: string): Promise<string | null> => {
    if (!imageDataUrl) return null;

    try {
        const [header, base64] = imageDataUrl.split(',');
        if (!base64) return null;

        const imageBuffer = Buffer.from(base64, 'base64');
        const image = await (Jimp as any).read(imageBuffer);
        const originalWidth = image.getWidth();
        const originalHeight = image.getHeight();

        const [aspectW, aspectH] = targetAspectRatio.split(':').map(Number);
        const targetRatio = aspectW / aspectH;
        const originalRatio = originalWidth / originalHeight;

        let newCanvasWidth: number, newCanvasHeight: number;

        if (targetRatio > originalRatio) {
            newCanvasHeight = originalHeight;
            newCanvasWidth = Math.round(originalHeight * targetRatio);
        } else {
            newCanvasWidth = originalWidth;
            newCanvasHeight = Math.round(originalWidth / targetRatio);
        }
        
        const newCanvas = new (Jimp as any)(newCanvasWidth, newCanvasHeight, '#000000');
        
        const x = (newCanvasWidth - originalWidth) / 2;
        const y = (newCanvasHeight - originalHeight) / 2;
        
        newCanvas.composite(image, x, y);

        const mime = header.match(/:(.*?);/)?.[1] || (Jimp as any).MIME_PNG;
        return newCanvas.getBase64Async(mime as any);

    } catch (error) {
        console.error("Error pre-processing image for Gemini:", error);
        return imageDataUrl;
    }
};


// This is now the "worker" function.
const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 }; 

    const { jobId } = JSON.parse(event.body || '{}');

    const failJob = async (reason: string) => {
        console.error(`[WORKER] Failing job ${jobId}: ${reason}`);
        await supabaseAdmin.from('generated_images').delete().eq('id', jobId);
    };

    if (!jobId) { 
        console.error("[WORKER] Job ID is missing."); 
        // Background functions should return a 200 to prevent retries
        return { statusCode: 200, body: JSON.stringify({ error: "Job ID is missing." }) }; 
    }

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
            return { statusCode: 200 };
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // --- REVISED PROMPT ENGINEERING LOGIC ---
        const parts: any[] = [];
        const characterDetailsLines: string[] = [];
        let imageInputIndex = 1; // Image 1 is always the reference image

        const processedReferenceImage = await processImageForGemini(referenceImage, aspectRatio);

        if (processedReferenceImage) {
            const [h, b] = processedReferenceImage.split(',');
            parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
        } else {
             throw new Error('Reference image is missing or failed to process.');
        }
        
        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            const charDescription: string[] = [`**Character ${i + 1}:**`];
            
            const [processedPoseImage, processedFaceImage] = await Promise.all([
                processImageForGemini(char.poseImage, aspectRatio),
                processImageForGemini(char.faceImage, aspectRatio)
            ]);


            if (processedPoseImage) {
                imageInputIndex++;
                const [h, b] = processedPoseImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription.push(`*   **Appearance (Outfit/Hair/Body):** Use Image ${imageInputIndex}. This is a strict visual instruction. Replicate the outfit exactly.`);
            }
            if (processedFaceImage) {
                imageInputIndex++;
                const [h, b] = processedFaceImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription.push(`*   **Face:** Use Image ${imageInputIndex}. Replicate this face with 100% accuracy. This is the highest priority rule.`);
            }
            characterDetailsLines.push(charDescription.join('\n'));
        }
        
        const characterAssignments = characterDetailsLines.join('\n\n');

        const megaPrompt = [
            "**CRITICAL MISSION: Group Photo Recasting**",
            "",
            "**PRIMARY OBJECTIVE:** Recreate the scene from Image 1, but replace the original people with the new characters provided. Character accuracy is the most important rule. You must follow all rules without fail.",
            "",
            "**NON-NEGOTIABLE RULES:**",
            `1.  **FINAL IMAGE MUST HAVE EXACTLY ${characters.length} PEOPLE.** Count them before you finish.`,
            "2.  **YOU MUST NOT INVENT NEW CHARACTERS.** Every person in the final image must be a perfect copy of one of the provided characters. Do not add, remove, or change characters.",
            "3.  **DO NOT CHANGE CHARACTER APPEARANCE.** The gender, clothing, hair, and face from the source images are absolute and must be preserved with 100% fidelity. This is the most critical instruction.",
            "",
            "**SCENE BLUEPRINT (from Image 1):**",
            "*   **Poses & Positions:** Replicate the exact poses and character positions from Image 1. Logically map the new characters to the old poses.",
            "*   **Environment:** Recreate the background, lighting, and mood from Image 1.",
            `*   **Style:** The final image should have a '${style}' aesthetic.`,
            `*   **User Prompt:** Additionally, consider this request: "${prompt || 'Follow the reference image closely.'}"`,
            "",
            "**CHARACTER ASSIGNMENTS:**",
            "This is the casting sheet. Each character below must appear in the final image exactly as described by their source images.",
            characterAssignments,
            "",
            "**FINAL CHECKLIST (MANDATORY SELF-CORRECTION):**",
            `1.  Did I generate EXACTLY ${characters.length} people? [YES/NO]`,
            "2.  Is EVERY character a perfect match to their source images (outfit, face, hair, gender)? [YES/NO]",
            "3.  Are the poses from Image 1 copied correctly? [YES/NO]",
            "**If any answer is NO, you MUST discard your current attempt and regenerate the image correctly. This is not optional.**"
        ].join('\n');
        
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
        
        // FIX: Cast s3Client to 'any' to bypass a likely environment-specific TypeScript type resolution error.
        await (s3Client as any).send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: fileName, Body: imageBuffer, ContentType: finalImageMimeType }));
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
        
        return { statusCode: 200 };

    } catch (error: any) {
        console.error("[WORKER] Group image background function error:", error);
        await failJob(error.message || 'Lỗi không xác định từ máy chủ.');
        return { statusCode: 200 }; // Always return 200 for background functions
    }
};

export { handler };