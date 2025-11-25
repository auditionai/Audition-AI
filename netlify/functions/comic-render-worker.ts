
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST = 10; 

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
        const { panel, characters, storyTitle, style, aspectRatio, colorFormat, visualEffect, isCover, premise } = jobConfig.payload;

        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('key_value, id').eq('status', 'active').limit(1).single();
        if (!apiKeyData) throw new Error('Hết tài nguyên AI.');

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        const parts: any[] = [];
        
        // --- PARSE STRUCTURED SCRIPT ---
        let scriptData;
        let visualDirectives = "";
        let dialogueListText = "";

        try {
            // The 'visual_description' field contains the FULL JSON structure of the page (layout, panels, dialogues)
            // We need to parse this to extract the visual descriptions for the AI.
            scriptData = JSON.parse(panel.visual_description);
            
            // Build a very explicit visual prompt from the parsed JSON
            // IGNORE generic plot summary, focus on specific visual descriptions from the panels.
            visualDirectives = `**PAGE LAYOUT INSTRUCTION:** ${scriptData.layout_note || "Standard Comic Grid"}\n\n`;
            
            // Handle potential structure variation (panels array or single object)
            const panelsList = Array.isArray(scriptData.panels) ? scriptData.panels : (scriptData.panels ? [scriptData.panels] : []);

            if (panelsList.length > 0) {
                panelsList.forEach((p: any) => {
                    const pid = p.panel_id || 1;
                    visualDirectives += `[PANEL ${pid} ACTION]: ${p.description}\n`;
                    
                    // Extract Dialogue for this panel to ensure text placement
                    if (p.dialogues && Array.isArray(p.dialogues)) {
                        p.dialogues.forEach((d: any) => {
                            // Ensure the text is sanitized
                            if (d.text && d.text.trim() !== "..." && d.text.trim() !== "") {
                                dialogueListText += `Panel ${pid} bubble: "${d.text}" (Speaker: ${d.speaker})\n`;
                            }
                        });
                    }
                });
            } else {
                // Fallback if JSON valid but empty panels
                visualDirectives = "Create a comic page based on the story context.";
            }
        } catch (e) {
            // Fallback for legacy or raw text format (if user manually edited it to be non-JSON)
            visualDirectives = panel.visual_description;
            dialogueListText = "No dialogue specified.";
        }

        const lowerStyle = style.toLowerCase();
        const isWebtoon = lowerStyle.includes('webtoon') || lowerStyle.includes('manhwa');
        
        let layoutInstruction = isWebtoon 
            ? `**FORMAT: VERTICAL SCROLLING STRIP (WEBTOON)**.`
            : `**FORMAT: COMIC PAGE**.`;

        let characterContext = "No specific characters.";
        if (characters && Array.isArray(characters)) {
            characterContext = characters.map((c: any) => c.name).join(", ");
        }

        // --- THE MASTER PROMPT (DIRECTOR MODE) ---
        const systemPrompt = `
            You are a legendary Comic Book Artist and Director (Gemini 3 Pro Vision).
            
            **CORE DIRECTIVE: CONSISTENCY IS KING.**
            You are drawing ONE page of a larger story. It is VITAL that characters and settings match the Global Story Context.
            
            **1. GLOBAL STORY CONTEXT (THE TRUTH):**
            "${premise}"
            *Use this context to determine the setting (background), atmosphere, and character relationships. Unless the Page Script explicitly says otherwise, the setting must match this premise.*
            
            **2. ARTISTIC DIRECTION:**
            - Style: ${style} (High quality, 8k resolution, detailed lineart).
            - Palette: ${colorFormat}
            ${visualEffect !== 'none' ? `- Special Effect: ${visualEffect}` : ''}
            - ${layoutInstruction}
            
            **3. CHARACTER CONSISTENCY:**
            - Characters present: ${characterContext}.
            - **CRITICAL:** You have been provided with reference images for these characters. You MUST adhere strictly to their hair color, hairstyle, facial features, and OUTFIT from the reference images. Do not hallucinate new clothes unless the script demands it.
            
            **4. CURRENT PAGE SCRIPT (YOUR TASK):**
            ${visualDirectives}
            
            **5. TEXT RENDERING (MANDATORY):**
            Add speech bubbles containing the following text. Ensure text is legible, clear, and correctly placed in the corresponding panels.
            ${dialogueListText}
        `;

        parts.push({ text: systemPrompt });

        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        // Explicitly label the reference image for the model
                        parts.push({ text: `REFERENCE IMAGE FOR CHARACTER: ${char.name} (Use this exact look)` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

        // Use Gemini 3 Pro for rendering
        console.log(`[WORKER] Calling Gemini 3 Pro for job ${jobId}...`);
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
                // Keep the JSON prompt structure in DB for future reference
                prompt: panel.visual_description 
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