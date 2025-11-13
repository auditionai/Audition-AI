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
        // CONSTRUCT THE "SUPER PROMPT"
        // ====================================================================
        console.log(`[WORKER ${jobId}] Constructing the Super Prompt...`);

        const maleCount = characters.filter((c: any) => c.gender === 'male').length;
        const femaleCount = characters.filter((c: any) => c.gender === 'female').length;

        const promptParts: string[] = [
            `**CRITICAL MISSION: Group Photo Generation**`,
            `**Primary Objective:** Your task is to analyze the provided Reference Scene (Image 1) and create a new image featuring a group of characters. You must adhere to the following rules with 100% accuracy.`,
            ``,
            `**--- OVERALL SCENE REQUIREMENTS ---**`,
            `1.  **Character Count:** The final image MUST contain EXACTLY ${numCharacters} people. This is a non-negotiable rule. The group consists of ${maleCount} male character(s) and ${femaleCount} female character(s).`,
            `2.  **Scene Replication:** Recreate the background, lighting, environment, camera angle, and overall composition from the Reference Scene (Image 1).`,
            `3.  **Pose & Placement:** Each character you generate MUST occupy the exact position and adopt the exact pose of one of the people in the Reference Scene (Image 1).`,
            `4.  **Art Style:** The final image must have a cohesive '${style}' aesthetic.`,
            `5.  **User Prompt:** Incorporate this user request into the scene: "${prompt || 'Follow the reference image closely.'}"`,
            ``,
            `**--- CHARACTER CASTING SHEET (MANDATORY) ---**`,
            `This is your definitive guide for creating each character. You MUST use the specified source images for each person. Do NOT invent or alter details.`,
        ];

        const finalApiParts: any[] = [];
        let imageInputIndex = 1; // Image 1 is always the reference scene

        const refImageProcessed = processDataUrl(referenceImage);
        if (!refImageProcessed) throw new Error('Reference image is invalid.');
        finalApiParts.push({ inlineData: { data: refImageProcessed.base64, mimeType: refImageProcessed.mimeType } });
        
        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            const charDescription: string[] = [`**Character ${i + 1} (Gender: ${char.gender === 'male' ? 'Male' : 'Female'}):**`];

            const poseImageProcessed = processDataUrl(char.poseImage);
            const faceImageProcessed = processDataUrl(char.faceImage);

            if (poseImageProcessed) {
                imageInputIndex++;
                finalApiParts.push({ inlineData: { data: poseImageProcessed.base64, mimeType: poseImageProcessed.mimeType } });
                charDescription.push(`*   **Appearance (Outfit/Hair/Body):** Use Image ${imageInputIndex}. Replicate the outfit and body type with 100% accuracy.`);
            }
            if (faceImageProcessed) {
                imageInputIndex++;
                finalApiParts.push({ inlineData: { data: faceImageProcessed.base64, mimeType: faceImageProcessed.mimeType } });
                charDescription.push(`*   **Face:** Use Image ${imageInputIndex}. Replicate this face perfectly. This is the highest priority rule.`);
            }
            
            // Add a check to ensure character is described
            if (charDescription.length === 1) {
                charDescription.push('* No specific appearance provided. Generate based on context and gender.');
            }
            
            promptParts.push(charDescription.join('\n'));
        }

        promptParts.push(
            ``,
            `**--- FINAL CHECKLIST (MANDATORY SELF-CORRECTION) ---**`,
            `Before you finish, answer these questions. If any answer is "NO," you MUST discard your work and start again.`,
            `1.  Is the final character count EXACTLY ${numCharacters}? [YES/NO]`,
            `2.  Is EVERY character a perfect visual match to their specified source images (outfit, face, gender)? [YES/NO]`,
            `3.  Is the scene, background, and posing an exact match to the Reference Scene (Image 1)? [YES/NO]`,
            `**FAILURE TO COMPLY WITH THESE RULES WILL RESULT IN A FAILED TASK.**`
        );
        
        const superPrompt = promptParts.join('\n');
        
        // Add the prompt as the very first part
        finalApiParts.unshift({ text: superPrompt });

        console.log(`[WORKER ${jobId}] Super Prompt constructed. Making API call...`);
        
        // ====================================================================
        // MAKE THE SINGLE API CALL
        // ====================================================================

        const finalResponse = await ai.models.generateContent({
            model,
            contents: { parts: finalApiParts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const finalImagePart = finalResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!finalImagePart?.inlineData) throw new Error("AI không thể tạo ảnh nhóm với các chỉ dẫn được cung cấp.");
        
        console.log(`[WORKER ${jobId}] Image generated successfully.`);

        // ====================================================================
        // UPLOAD AND FINALIZE JOB
        // ====================================================================
        console.log(`[WORKER ${jobId}] Finalizing...`);

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
        
        console.log(`[WORKER ${jobId}] Job finalized successfully.`);
        return { statusCode: 200 };

    } catch (error: any) {
        await failJob(jobId, error.message || 'Lỗi không xác định từ máy chủ.');
        return { statusCode: 200 };
    }
};

export { handler };