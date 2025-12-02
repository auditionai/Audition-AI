
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const BASE_COST = 10; 

const processDataUrl = (dataUrl: string | null) => {
    if (!dataUrl) return null;
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return { base64, mimeType };
};

const failJob = async (jobId: string, userId: string, reason: string, totalCost: number) => {
    console.error(`[COMIC WORKER] Failing job ${jobId}: ${reason}`);
    try {
        await Promise.all([
            supabaseAdmin.from('generated_images').delete().eq('id', jobId),
            supabaseAdmin.from('users').update({ diamonds: undefined }), // Cannot invoke increment_user_diamonds simply here
            // Manually fetch and update since RPC might be missing or limited
            supabaseAdmin.rpc('increment_user_diamonds', { user_id_param: userId, diamond_amount: totalCost }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: userId,
                amount: totalCost,
                transaction_type: 'REFUND',
                description: `Hoàn tiền vẽ truyện thất bại (Lỗi: ${reason.substring(0, 50)})`,
            })
        ]);
    } catch (e) {
        console.error("Critical failure during refund:", e);
    }
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) return { statusCode: 400, body: "Missing Job ID" };

    let userId = "";
    let totalCost = BASE_COST;

    try {
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData) throw new Error("Job not found");
        
        userId = jobData.user_id;
        const jobConfig = JSON.parse(jobData.prompt);
        const { panel, characters, style, aspectRatio, colorFormat, visualEffect, premise, imageQuality = '1K', previousPageUrl } = jobConfig.payload;
        
        if (imageQuality === '2K') totalCost += 10;
        if (imageQuality === '4K') totalCost += 15;

        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('key_value, id').eq('status', 'active').limit(1).single();
        if (!apiKeyData) throw new Error('Hết tài nguyên AI.');

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        const parts: any[] = [];
        
        // --- PARSE SCRIPT ---
        let scriptData;
        let visualDirectives = "";
        let dialogueListText = "";

        try {
            scriptData = JSON.parse(panel.visual_description);
            visualDirectives = `**PAGE LAYOUT:** ${scriptData.layout_note || "Standard Comic Grid"}\n`;
            
            const panelsList = Array.isArray(scriptData.panels) ? scriptData.panels : (scriptData.panels ? [scriptData.panels] : []);
            if (panelsList.length > 0) {
                panelsList.forEach((p: any) => {
                    visualDirectives += `[PANEL ${p.panel_id}]: ${p.description}\n`;
                    if (p.dialogues) {
                        p.dialogues.forEach((d: any) => {
                            if (d.text && d.text.trim().length > 1) {
                                dialogueListText += `Panel ${p.panel_id} - ${d.speaker}: "${d.text}"\n`;
                            }
                        });
                    }
                });
            }
        } catch (e) {
            visualDirectives = panel.visual_description;
        }

        // --- PROMPT ---
        let systemPrompt = `You are a legendary Comic Book Artist (Gemini 3 Pro Vision).`;
        const hasInputImages = !!previousPageUrl || (characters && characters.length > 0);
        
        if (hasInputImages) {
            systemPrompt += `
            *** SUPREME SYSTEM COMMAND: PRESERVE CANVAS ***
            If a canvas with GRAY PADDING is provided (e.g., 'Previous Page Context'):
            1. [BOUNDARIES]: Respect the corners. DO NOT CROP.
            2. [OUTPAINTING]: Fill gray areas with comic panel content.
            3. [LOGIC]: Ignore aspect ratio config, use input canvas pixels.
            `;
        } else {
            systemPrompt += `
            **OUTPUT REQUIREMENT:** Create a new image with aspect ratio ${aspectRatio}.
            `;
        }

        systemPrompt += `
            **CONTEXT:**
            "${premise}"
            
            **STYLE:** ${style}. ${colorFormat}. ${visualEffect !== 'none' ? `Effect: ${visualEffect}` : ''}.
            Resolution: ${imageQuality}.
            
            **VISUAL SCRIPT:**
            ${visualDirectives}
            
            **DIALOGUE:**
            Render speech bubbles with legible text:
            ${dialogueListText}
        `;

        parts.push({ text: systemPrompt });

        // 1. Inject Previous Page
        if (previousPageUrl) {
            try {
                const response = await fetch(previousPageUrl);
                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                parts.push({ text: "**PREVIOUS PAGE CONTEXT (DO NOT CROP THIS CANVAS):**" });
                parts.push({ inlineData: { data: base64, mimeType: 'image/png' } });
            } catch (e) {
                console.error("[WORKER] Failed to fetch previous page image.", e);
            }
        }

        // 2. Inject Character References
        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        parts.push({ text: `Reference for ${char.name}:` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

        // CONFIG HANDLING:
        const config: any = {
            responseModalities: [Modality.IMAGE],
        };

        if (!hasInputImages) {
             config.imageConfig = { aspectRatio: aspectRatio, imageSize: imageQuality };
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: config
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart?.inlineData) throw new Error("AI failed to render.");

        const s3Client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_ENDPOINT!,
            credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
        });

        const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
        const fileName = `${userId}/comic/${Date.now()}_page_${panel.panel_number}.png`;
        
        await (s3Client as any).send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: buffer,
            ContentType: 'image/png'
        }));

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        await Promise.all([
            supabaseAdmin.from('generated_images').update({ 
                image_url: publicUrl,
                prompt: panel.visual_description 
            }).eq('id', jobId),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

    } catch (error: any) {
        if (userId) await failJob(jobId, userId, error.message, totalCost);
    }

    return { statusCode: 200 };
};

export { handler };
