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

        // --- NEW PROMPT ENGINEERING LOGIC ---
        const parts: any[] = [];
        const characterDetailsLines: string[] = [];
        let imageInputIndex = 1;

        const processedReferenceImage = await processImageForGemini(referenceImage, aspectRatio);

        if (processedReferenceImage) {
            const [h, b] = processedReferenceImage.split(',');
            parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
            imageInputIndex++;
        } else {
             throw new Error('Reference image is missing or failed to process.');
        }
        
        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            const charDescription = [
                `<character id="${i + 1}">`,
                `  <source_images>`
            ];
            
            const [processedPoseImage, processedFaceImage] = await Promise.all([
                processImageForGemini(char.poseImage, aspectRatio),
                processImageForGemini(char.faceImage, aspectRatio)
            ]);


            if (processedPoseImage) {
                const [h, b] = processedPoseImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription.push(`    <appearance_source image_index="${imageInputIndex}">This image defines the character's ENTIRE appearance: outfit, accessories, hair, and body. PRESERVE IT PERFECTLY.</appearance_source>`);
                imageInputIndex++;
            }
            if (processedFaceImage) {
                const [h, b] = processedFaceImage.split(',');
                parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                charDescription.push(`    <face_source image_index="${imageInputIndex}">This image defines the character's FACE. REPLICATE IT EXACTLY. This is a non-negotiable, high-priority rule.</face_source>`);
                imageInputIndex++;
            }
            charDescription.push(`  </source_images>`);
            charDescription.push(`</character>`);
            characterDetailsLines.push(charDescription.join('\n'));
        }

        const megaPrompt = [
            "<master_instructions>",
            "  <task_overview>",
            "    Your task is to generate a new group photo by perfectly recasting a scene from a reference image (Image 1) with a new set of characters. Adherence to character details is the highest and most critical priority.",
            "  </task_overview>",
            "",
            "  <critical_rules>",
            `    <rule id="1" priority="MAXIMUM">**CHARACTER COUNT:** The final image MUST contain EXACTLY ${characters.length} characters. Not more, not less. Before generating, you must count the characters to ensure 100% accuracy.</rule>`,
            `    <rule id="2" priority="MAXIMUM">**CHARACTER FIDELITY:** You are ABSOLUTELY FORBIDDEN from altering any character's appearance, gender, or attributes.`,
            "      - **DO NOT CHANGE GENDER.** If a character appears male, they MUST remain male. If female, they MUST remain female.",
            "      - **DO NOT CHANGE OUTFITS.** The clothing, including all layers, accessories, and shoes, must be an EXACT replica.",
            "      - **DO NOT CHANGE HAIRSTYLES or HAIR COLOR.**",
            "      - The appearance derived from each character's source images is absolute and must be preserved with perfect fidelity.",
            "    </rule>",
            "  </critical_rules>",
            "",
            "  <scene_blueprint>",
            "    Analyze **Image 1** for the overall scene:",
            "    - **Composition & Poses:** Replicate the exact poses and character positions. Map the new characters to the old poses logically.",
            "    - **Environment:** Recreate the background, setting, lighting, and mood.",
            "    - **Camera:** Match the camera angle and framing (e.g., full shot, medium shot) precisely.",
            "  </scene_blueprint>",
            "",
            "  <character_casting_sheet>",
            "    Replace the original people with these new characters. These instructions are non-negotiable and override any other interpretation.",
            ...characterDetailsLines,
            "  </character_casting_sheet>",
            "",
            "  <artistic_direction>",
            `    - **Art Style:** The final image must have a '${style}' aesthetic.`,
            `    - **User Notes:** Incorporate these details into the scene: "${prompt || 'Follow the reference image closely.'}"`,
            "  </artistic_direction>",
            "",
            "  <final_quality_check>",
            "    Before finalizing, you MUST perform this checklist:",
            `    1.  Is the character count in the generated image EXACTLY ${characters.length}? [YES/NO]`,
            "    2.  Is every character's gender, outfit, hair, and face an EXACT replica from their source images? [YES/NO]",
            "    3.  Are the poses and composition from Image 1 perfectly recreated? [YES/NO]",
            "    **If any answer is NO, you MUST discard the result and start over to correct the mistake. Failure to follow these rules is a critical error.**",
            "  </final_quality_check>",
            "</master_instructions>"
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
