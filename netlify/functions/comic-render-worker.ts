
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
        // Refund and Delete Job
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
        const { panel, characters, storyTitle, style, aspectRatio, colorFormat, visualEffect, isCover } = jobConfig.payload;

        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('key_value, id').eq('status', 'active').limit(1).single();
        if (!apiKeyData) throw new Error('Hết tài nguyên AI.');

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        const parts: any[] = [];
        
        // --- LAYOUT LOGIC DETERMINATION ---
        const lowerStyle = style.toLowerCase();
        const isWebtoon = lowerStyle.includes('webtoon') || lowerStyle.includes('manhwa');
        const lowerColor = colorFormat.toLowerCase();
        const wantsColor = lowerColor.includes('color') || lowerColor.includes('màu');

        let layoutInstruction = "";
        if (isWebtoon) {
            layoutInstruction = `
            **MODE: WEBTOON / MANHWA**
            - Draw a SINGLE, seamless vertical scroll composition.
            - If the Visual Description mentions multiple 'PANELS', stack them vertically with smooth transitions or white gutters.
            - Focus on cinematic flow.
            `;
        } else {
            layoutInstruction = `
            **MODE: COMIC PAGE (MULTIPLE PANELS)**
            - Draw a COMPLETE COMIC PAGE containing multiple panels as described in the Visual Description.
            - The image MUST contain a GRID of panels separated by white gutters/lines.
            - Strictly follow the 'PANEL 1', 'PANEL 2'... structure in the prompt.
            `;
        }

        // --- DIALOGUE CONSTRUCTION ---
        let dialogueInstruction = "";
        if (panel.dialogue && Array.isArray(panel.dialogue) && panel.dialogue.length > 0) {
            const dialogueList = panel.dialogue.map((d: any) => {
                const speaker = d.speaker || "Character";
                return `- Speaker (${speaker}): "${d.text}"`;
            }).join('\n');
            
            dialogueInstruction = `
            **TEXT RENDERING TASK:**
            You MUST render speech bubbles containing the following Vietnamese text EXACTLY.
            Place the bubbles correctly in the corresponding panels (Panel 1, Panel 2, etc).
            
            DIALOGUE LIST:
            ${dialogueList}
            `;
        } else {
            dialogueInstruction = "No dialogue. Focus on visual storytelling.";
        }

        // --- NORMAL PAGE MODE ---
        let systemPrompt = "";
        
        if (isCover) {
            systemPrompt = `
                You are a world-class Illustrator using Gemini 3 Pro Vision.
                Task: Create a Comic Cover.
                Title: "${storyTitle}" (Render title clearly).
                Visuals: ${panel.visual_description}
                Style: ${style}, ${colorFormat}.
            `;
        } else {
            // Characters Context
            const characterRefText = characters.map((c: any) => 
                `[${c.name}]: ${c.description}`
            ).join('\n');

            systemPrompt = `
                You are a master comic artist (Gemini 3 Pro).
                
                ${layoutInstruction}
                
                **SCENE SCRIPT (Read Carefully):**
                ${panel.visual_description}
                
                ${dialogueInstruction}
                
                **CHARACTERS:**
                ${characterRefText}
                (Use reference images for visual consistency).
                
                **STYLE:**
                - Art Style: ${style}
                - Color: ${colorFormat}
                - Effect: ${visualEffect}
                - High resolution, 8k, crisp lines.
            `;
        }

        parts.push({ text: systemPrompt });

        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        parts.push({ text: `Ref for ${char.name}:` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

        // USE GEMINI 3 PRO IMAGE PREVIEW FOR RENDERING
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

        const baseUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
        const publicUrl = `${baseUrl}/${fileName}`;

        await new Promise(resolve => setTimeout(resolve, 1000));

        await Promise.all([
            supabaseAdmin.from('generated_images').update({ 
                image_url: publicUrl,
                prompt: panel.visual_description || "Comic Page" 
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
