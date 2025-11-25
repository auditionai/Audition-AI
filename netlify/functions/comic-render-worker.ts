
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
    // Background functions respond with 202 immediately, but we still return 200 for good measure in logic
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
        const { panel, characters, storyTitle, style, aspectRatio, colorFormat, visualEffect, isCover, premise, globalContext, imageQuality = '1K' } = jobConfig.payload;
        
        // Recalculate cost for refund handling
        if (imageQuality === '2K') totalCost += 10;
        if (imageQuality === '4K') totalCost += 15;

        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('key_value, id').eq('status', 'active').limit(1).single();
        if (!apiKeyData) throw new Error('Hết tài nguyên AI.');

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        const parts: any[] = [];
        
        // --- PARSE STRUCTURED SCRIPT ---
        let scriptData;
        let visualDirectives = "";
        let dialogueListText = "";

        try {
            scriptData = JSON.parse(panel.visual_description);
            visualDirectives = `**PAGE LAYOUT INSTRUCTION:** ${scriptData.layout_note || "Standard Comic Grid"}\n\n`;
            
            const panelsList = Array.isArray(scriptData.panels) ? scriptData.panels : (scriptData.panels ? [scriptData.panels] : []);

            if (panelsList.length > 0) {
                panelsList.forEach((p: any) => {
                    const pid = p.panel_id || 1;
                    visualDirectives += `[PANEL ${pid} ACTION]: ${p.description}\n`;
                    
                    if (p.dialogues && Array.isArray(p.dialogues)) {
                        p.dialogues.forEach((d: any) => {
                            if (d.text && d.text.trim() !== "..." && d.text.trim() !== "") {
                                dialogueListText += `Panel ${pid} bubble: "${d.text}" (Speaker: ${d.speaker})\n`;
                            }
                        });
                    }
                });
            } else {
                visualDirectives = "Create a comic page based on the story context.";
            }
        } catch (e) {
            visualDirectives = panel.visual_description;
            dialogueListText = "No dialogue specified.";
        }

        const lowerStyle = style.toLowerCase();
        const isWebtoon = lowerStyle.includes('webtoon') || lowerStyle.includes('manhwa');
        
        let layoutInstruction = isWebtoon 
            ? `**MODE: WEBTOON (Vertical)**. Draw one high-quality vertical strip composition containing the described panels.`
            : `**MODE: COMIC PAGE**. Draw a full page with distinct panels separated by white gutters.`;

        let colorInstruction = `- Palette: ${colorFormat}`;
        
        // Global Context Injection
        const contextString = globalContext ? `\n**FULL STORY CONTEXT (REFERENCE ONLY):**\n${globalContext.substring(0, 2000)}\n` : '';

        // --- CRITICAL: CONSISTENCY ENFORCEMENT ---
        const systemPrompt = `
            You are a legendary Comic Book Artist and Director (Gemini 3 Pro Vision).
            
            **CORE DIRECTIVE: MAXIMUM VISUAL CONSISTENCY.**
            This is one page of a continuous story. The characters and background MUST remain consistent with the provided Reference Images and Global Context.
            
            **1. GLOBAL CONTEXT (THE SETTING):**
            "${premise}"
            ${contextString}
            *You MUST use this context to determine the static background environment. Do NOT change the setting randomly between panels unless the script says "Change Scene".*
            
            **2. ARTISTIC DIRECTION:**
            - Style: ${style} (High quality, ${imageQuality} resolution, consistent lineart).
            - Palette: ${colorFormat}
            ${visualEffect !== 'none' ? `- Effect: ${visualEffect}` : ''}
            - ${layoutInstruction}
            
            **3. CHARACTER CONSISTENCY (STRICT ENFORCEMENT):**
            - **OUTFIT RULE:** The characters MUST wear the **EXACT SAME OUTFIT** as shown in their Reference Images. Do not hallucinate new jackets, colors, or accessories. Copy the reference outfit details precisely.
            - **FACE RULE:** Maintain facial structure identity across all panels and angles.
            - **BODY RULE:** Maintain character body type and height relative to others.
            
            **4. CURRENT PAGE SCRIPT:**
            ${visualDirectives}
            
            **5. TEXT RENDERING:**
            Add speech bubbles. Text MUST be legible Vietnamese.
            ${dialogueListText}
        `;

        parts.push({ text: systemPrompt });

        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        parts.push({ text: `[REFERENCE] CHARACTER: ${char.name} (LOCK THIS OUTFIT & FACE)` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

        // Use Gemini 3 Pro for rendering (High Quality)
        console.log(`[WORKER] Calling Gemini 3 Pro for job ${jobId} (Quality: ${imageQuality})...`);
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: {
                    aspectRatio: aspectRatio || '3:4',
                    imageSize: imageQuality // Dynamic Quality
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
                // Keep the JSON prompt structure in DB for future reference
                prompt: panel.visual_description 
            }).eq('id', jobId),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

        console.log(`[WORKER] Job ${jobId} completed successfully.`);

    } catch (error: any) {
        if (userId) {
            await failJob(jobId, userId, error.message, totalCost);
        }
    }

    return { statusCode: 200 };
};

export { handler };
