// IMPORTANT: This file is now correctly named with a "-background" suffix for Netlify to treat it as a background function.
// The client calls the endpoint WITHOUT the suffix: /.netlify/functions/generate-group-image

import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const XP_PER_CHARACTER = 5;

const failJob = async (jobId: string, reason: string) => {
    console.error(`[WORKER] Failing job ${jobId}: ${reason}`);
    await supabaseAdmin.from('generated_images').delete().eq('id', jobId);
};

// Helper to extract base64 and mimeType from data URL
const processDataUrl = (dataUrl: string | null) => {
    if (!dataUrl) return null;
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return { base64, mimeType };
};


// This is now the "worker" function.
const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 }; 

    const { jobId } = JSON.parse(event.body || '{}');
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
        const { characters, referenceImage, prompt, style } = payload;
        const userId = jobData.user_id;
        const numCharacters = characters.length;

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) {
            throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        }

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const model = 'gemini-2.5-flash-image';

        // ====================================================================
        // STEP 1: GENERATE THE BLUEPRINT IMAGE WITH MANNEQUINS
        // ====================================================================
        console.log(`[WORKER ${jobId}] Step 1: Generating blueprint...`);

        const blueprintPrompt = `
            **CRITICAL TASK: Scene Mannequin Blueprint**
            Your only goal is to analyze the provided image (Image 1) and create a new image based on it.
            
            **RULES:**
            1.  Recreate the background, lighting, and environment from Image 1 exactly.
            2.  Identify all people in Image 1.
            3.  In the new image, replace EVERY person with a featureless, matte gray, gender-neutral mannequin.
            4.  The mannequins MUST be in the exact same poses and positions as the original people.
            5.  The final image MUST contain EXACTLY ${numCharacters} mannequins. Do not add or remove any.
            
            Do not add any other details. The output must be a clean blueprint of the scene with mannequins.
        `.trim();

        const refImageProcessed = processDataUrl(referenceImage);
        if (!refImageProcessed) throw new Error('Reference image is invalid.');

        const blueprintResponse = await ai.models.generateContent({
            model,
            contents: { parts: [
                { text: blueprintPrompt },
                { inlineData: { data: refImageProcessed.base64, mimeType: refImageProcessed.mimeType } }
            ]},
            config: { responseModalities: [Modality.IMAGE] },
        });

        const blueprintImagePart = blueprintResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!blueprintImagePart?.inlineData) throw new Error("AI failed to create the initial scene blueprint.");
        
        const blueprintImageBase64 = blueprintImagePart.inlineData.data;
        const blueprintImageMimeType = blueprintImagePart.inlineData.mimeType;
        console.log(`[WORKER ${jobId}] Step 1: Blueprint generated successfully.`);

        // ====================================================================
        // STEP 2: "INPAINT" CHARACTERS ONTO THE BLUEPRINT
        // ====================================================================
        console.log(`[WORKER ${jobId}] Step 2: Inpainting characters...`);
        
        const inpaintingParts: any[] = [];
        const characterDetailsLines: string[] = [];
        let imageInputIndex = 1; // Image 1 is now the blueprint

        // Add blueprint as the first image
        inpaintingParts.push({ inlineData: { data: blueprintImageBase64, mimeType: blueprintImageMimeType } });

        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            const charDescription: string[] = [`**Character ${i + 1}:**`];

            const poseImageProcessed = processDataUrl(char.poseImage);
            const faceImageProcessed = processDataUrl(char.faceImage);

            if (poseImageProcessed) {
                imageInputIndex++;
                inpaintingParts.push({ inlineData: { data: poseImageProcessed.base64, mimeType: poseImageProcessed.mimeType } });
                charDescription.push(`*   **Appearance (Outfit/Hair/Body):** Use Image ${imageInputIndex}. Replicate the outfit exactly.`);
            }
            if (faceImageProcessed) {
                imageInputIndex++;
                inpaintingParts.push({ inlineData: { data: faceImageProcessed.base64, mimeType: faceImageProcessed.mimeType } });
                charDescription.push(`*   **Face:** Use Image ${imageInputIndex}. Replicate this face with 100% accuracy. This is the highest priority rule.`);
            }
            characterDetailsLines.push(charDescription.join('\n'));
        }

        const characterAssignments = characterDetailsLines.join('\n\n');

        const inpaintingPrompt = `
            **CRITICAL MISSION: Character Inpainting**

            **PRIMARY OBJECTIVE:** Your task is to edit Image 1 (the scene with gray mannequins). You must replace each mannequin with a detailed character based on the provided source images. Adherence to the source images is the most important rule.

            **NON-NEGOTIABLE RULES:**
            1.  **START WITH IMAGE 1.** Do not change the background, lighting, or any part of the scene that isn't a mannequin.
            2.  **REPLACE, DO NOT ADD.** For each mannequin in Image 1, replace it with one of the characters defined below. The final image must have the same number of people as there are mannequins.
            3.  **100% VISUAL ACCURACY.** The outfit, hair, gender, and face for each character MUST be a perfect copy from their source images. Do not invent or alter details.
            4.  **LOGICAL MAPPING.** Intelligently map each Character described below to one of the mannequins in Image 1 based on pose and position.

            **SCENE & STYLE:**
            *   **Base Scene:** Use Image 1.
            *   **Final Style:** The final image should have a '${style}' aesthetic.
            *   **User Prompt:** Additionally, consider this request: "${prompt || 'Follow the reference image closely.'}"

            **CHARACTER ASSIGNMENTS:**
            This is your casting sheet. Replace the mannequins with these characters.
            ${characterAssignments}

            **FINAL CHECKLIST (MANDATORY SELF-CORRECTION):**
            1.  Did I start with Image 1 and only replace the mannequins? [YES/NO]
            2.  Is every character in the final image a perfect match to their source images (outfit AND face)? [YES/NO]
            3.  Is the background from Image 1 preserved? [YES/NO]
            **If any answer is NO, you MUST discard your attempt and start again correctly. Failure is not an option.**
        `.trim();

        inpaintingParts.unshift({ text: inpaintingPrompt });

        const finalResponse = await ai.models.generateContent({
            model,
            contents: { parts: inpaintingParts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const finalImagePart = finalResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!finalImagePart?.inlineData) throw new Error("AI failed to perform the final character inpainting step.");
        
        console.log(`[WORKER ${jobId}] Step 2: Inpainting successful.`);

        // ====================================================================
        // STEP 3: UPLOAD AND FINALIZE JOB
        // ====================================================================
        console.log(`[WORKER ${jobId}] Step 3: Finalizing...`);

        const finalImageBase64 = finalImagePart.inlineData.data;
        const finalImageMimeType = finalImagePart.inlineData.mimeType;

        const s3Client = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT!, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }});
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${userId}/group/${Date.now()}.${finalImageMimeType.split('/')[1] || 'png'}`;
        
        await (s3Client as any).send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: fileName, Body: imageBuffer, ContentType: finalImageMimeType }));
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
        
        const xpToAward = (characters.length || 0) * XP_PER_CHARACTER;

        const [updateJobResult, incrementXpResult] = await Promise.all([
             supabaseAdmin.from('generated_images').update({ image_url: publicUrl }).eq('id', jobId),
             supabaseAdmin.rpc('increment_user_xp', { user_id_param: userId, xp_amount: xpToAward })
        ]);

        if (updateJobResult.error) throw new Error(`Failed to update job status: ${updateJobResult.error.message}`);
        if (incrementXpResult.error) console.error(`[WORKER] Failed to award XP for job ${jobId}:`, incrementXpResult.error.message);

        await supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id });
        
        console.log(`[WORKER ${jobId}] Step 3: Job finalized successfully.`);
        return { statusCode: 200 };

    } catch (error: any) {
        // This will be caught by the outer try-catch and fail the job
        await failJob(jobId, error.message || 'Lỗi không xác định từ máy chủ.');
        // Always return 200 for background functions to prevent retries from Netlify
        return { statusCode: 200 };
    }
};

export { handler };
