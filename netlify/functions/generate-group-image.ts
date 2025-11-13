// IMPORTANT: This file must be named with a "-background" suffix for Netlify to treat it as a background function.
// e.g., generate-group-image-background.ts
// The client will still call the endpoint without the suffix: /.netlify/functions/generate-group-image

import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from 'jimp';

const XP_PER_CHARACTER = 5;

// Helper to pre-process images for Gemini, adding letter/pillarboxing to match a target aspect ratio.
const processImageForGemini = async (imageDataUrl: string | null, targetAspectRatio: string): Promise<string | null> => {
    if (!imageDataUrl) return null;
    try {
        const [header, base64] = imageDataUrl.split(',');
        if (!base64) return null;

        const imageBuffer = Buffer.from(base64, 'base64');
        const image = await (Jimp as any).read(imageBuffer);
        const [aspectW, aspectH] = targetAspectRatio.split(':').map(Number);
        const targetRatio = aspectW / aspectH;
        const originalRatio = image.getWidth() / image.getHeight();

        let newCanvasWidth: number, newCanvasHeight: number;
        if (targetRatio > originalRatio) {
            newCanvasHeight = image.getHeight();
            newCanvasWidth = Math.round(newCanvasHeight * targetRatio);
        } else {
            newCanvasWidth = image.getWidth();
            newCanvasHeight = Math.round(newCanvasWidth / targetRatio);
        }
        
        const newCanvas = new (Jimp as any)(newCanvasWidth, newCanvasHeight, '#000000');
        const x = (newCanvasWidth - image.getWidth()) / 2;
        const y = (newCanvasHeight - image.getHeight()) / 2;
        newCanvas.composite(image, x, y);

        const mime = header.match(/:(.*?);/)?.[1] || (Jimp as any).MIME_PNG;
        return newCanvas.getBase64Async(mime as any);
    } catch (error) {
        console.error("Error pre-processing image for Gemini:", error);
        return imageDataUrl; // Return original on failure
    }
};

// FIX: Removed ': Handler' type to resolve a type conflict, as Netlify functions do not require it for execution.
const handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return; // Background functions don't return to client, but good practice.

    const { jobId, characters, layout, layoutPrompt, background, backgroundPrompt, style, stylePrompt, aspectRatio, useUpscaler } = JSON.parse(event.body || '{}');
    
    // --- AUTHENTICATION & VALIDATION ---
    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    const failJob = async (reason: string) => {
        await supabaseAdmin.from('generated_images').update({ status: 'failed', error_message: reason }).eq('job_id', jobId);
    };

    if (!jobId) { console.error("Job ID is missing."); return; }
    if (!token) { await failJob('Unauthorized.'); return; }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) { await failJob('Invalid token.'); return; }
    if (!characters || characters.length === 0) { await failJob('Character data missing.'); return; }

    try {
        const totalCost = characters.length + (useUpscaler ? 1 : 0);
        // FIX: Add logic to deduct cost and log transaction, which was missing.
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) { await failJob('User not found.'); return; }
        if (userData.diamonds < totalCost) { await failJob(`Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.`); return; }

        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = (userData.xp || 0) + (characters.length * XP_PER_CHARACTER);

        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'GROUP_IMAGE_GENERATION',
                description: `Tạo ảnh nhóm ${characters.length} người`,
            }),
        ]);

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) { await failJob('Hết tài nguyên AI. Vui lòng thử lại sau.'); return; }
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // --- INTELLIGENT PROMPT & ASSET CONSTRUCTION ---
        const parts: any[] = [];
        const characterDetailsLines: string[] = [];
        let imageInputIndex = 1;

        const finalPromptPlaceholder = "PROMPT_PLACEHOLDER";
        parts.push({ text: finalPromptPlaceholder });

        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            let charDescription = `- Character ${i + 1}:`;

            if (char.poseImage) {
                const processed = await processImageForGemini(char.poseImage, aspectRatio);
                if (processed) {
                    const [h, b] = processed.split(',');
                    parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                    charDescription += `\n  - Appearance (OUTFIT, POSE, GENDER, HAIRSTYLE) is defined by Image ${imageInputIndex}.`;
                    imageInputIndex++;
                }
            }
            if (char.faceImage) {
                const processed = await processImageForGemini(char.faceImage, '1:1');
                if (processed) {
                    const [h, b] = processed.split(',');
                    parts.push({ inlineData: { data: b, mimeType: h.match(/:(.*?);/)?.[1] || 'image/png' } });
                    charDescription += `\n  - **CRITICAL**: The FACE must be an EXACT replica from Image ${imageInputIndex}.`;
                    imageInputIndex++;
                }
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
        
        // --- AI GENERATION ---
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh nhóm. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");

        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType;

        // --- UPLOAD & DB UPDATE ---
        const s3Client = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT!, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }});
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${user.id}/group/${Date.now()}.${finalImageMimeType.split('/')[1] || 'png'}`;
        
        await s3Client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: fileName, Body: imageBuffer, ContentType: finalImageMimeType }));
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        // --- FINAL DB UPDATE ON SUCCESS ---
        await supabaseAdmin.from('generated_images').update({
            image_url: publicUrl,
            status: 'completed',
            model_used: 'Group Studio v2'
        }).eq('job_id', jobId);

        // Increment API key usage
        await supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id });

    } catch (error: any) {
        console.error("Group image background function error:", error);
        await failJob(error.message || 'Lỗi không xác định từ máy chủ.');
    }
};

export { handler };