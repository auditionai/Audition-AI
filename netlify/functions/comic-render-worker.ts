
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
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) return { statusCode: 400, body: "Missing Job ID" };

    let userId = "";

    try {
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData) throw new Error("Job not found");
        
        userId = jobData.user_id;
        const jobConfig = JSON.parse(jobData.prompt);
        const { panel, characters, storyTitle, style, aspectRatio, colorFormat, isCover } = jobConfig.payload;

        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('key_value, id').eq('status', 'active').limit(1).single();
        if (!apiKeyData) throw new Error('Hết tài nguyên AI.');

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        const parts: any[] = [];
        
        // --- PARSE SCRIPT DATA ---
        let scriptData;
        let visualPromptContent = "";
        
        try {
            // The 'visual_description' is now a JSON string of { layout_description, panels: [...] }
            scriptData = JSON.parse(panel.visual_description);
        } catch (e) {
            // Fallback for legacy/error cases (treat as simple string)
            scriptData = { layout_description: "Standard Grid", panels: [{ id: 1, visual: panel.visual_description, dialogue: [] }] };
        }

        // --- CONSTRUCT SYSTEM PROMPT ---
        
        if (isCover) {
            visualPromptContent = `
                **TASK: DRAW A COMIC COVER**
                - Title: "${storyTitle}" (Render the text clearly and artistically).
                - Visuals: ${scriptData.panels[0]?.visual || scriptData.layout_description || "Epic cover art"}.
                - Style: ${style}, ${colorFormat}.
                - Make it eye-catching and high resolution.
            `;
        } else {
            // Construct Panel Instructions
            let panelsInstruction = "";
            let dialogueList = "";

            scriptData.panels.forEach((p: any) => {
                panelsInstruction += `\n- **PANEL ${p.id}**: ${p.visual}`;
                
                if (p.dialogue && p.dialogue.length > 0) {
                    p.dialogue.forEach((d: any) => {
                        dialogueList += `\n  - Panel ${p.id} Bubble: Speaker "${d.speaker}" says: "${d.text}"`;
                    });
                }
            });

            visualPromptContent = `
                You are a master comic artist using Gemini 3 Pro Vision.
                
                **TASK: DRAW A COMPLETE COMIC PAGE**
                
                **LAYOUT INSTRUCTION:**
                - Layout Style: ${scriptData.layout_description}
                - The image MUST contain **${scriptData.panels.length} DISTINCT PANELS** separated by white gutters/borders.
                - Draw the panels in a logical reading order (Left to Right, Top to Bottom).
                
                **PANEL DETAILS:**
                ${panelsInstruction}
                
                **DIALOGUE & TEXT (CRITICAL):**
                - You MUST render speech bubbles with the exact text provided below.
                - Ensure the text is legible and placed correctly within the corresponding panels.
                - Language: Vietnamese.
                
                **DIALOGUE TO RENDER:**
                ${dialogueList || "No dialogue."}
                
                **ART STYLE:**
                - Style: ${style}
                - Format: ${colorFormat}
                - Quality: 8k resolution, highly detailed, professional linework.
            `;
        }

        // Characters Context
        const characterRefText = characters.map((c: any) => 
            `[${c.name}]: ${c.description}`
        ).join('\n');

        const finalPrompt = `
            ${visualPromptContent}
            
            **CHARACTER REFERENCES:**
            ${characterRefText}
            (Use provided reference images for visual consistency of characters).
        `;

        parts.push({ text: finalPrompt });

        // Attach Character Images as References
        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        parts.push({ text: `Reference Image for ${char.name}:` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

        // USE GEMINI 3 PRO IMAGE PREVIEW
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: {
                    aspectRatio: aspectRatio || '3:4',
                    imageSize: '2K' 
                }
            }
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart?.inlineData) throw new Error("AI failed to render image.");

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

        const baseUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
        const publicUrl = `${baseUrl}/${fileName}`;

        // Slight delay to ensure propagation
        await new Promise(resolve => setTimeout(resolve, 1000));

        await Promise.all([
            // Store the structured JSON in 'prompt' column for future reference/editing if needed, 
            // although typically 'prompt' stores the input prompt. 
            // We keep it consistent with the input payload.
            supabaseAdmin.from('generated_images').update({ 
                image_url: publicUrl,
                prompt: panel.visual_description // Store the JSON string
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
