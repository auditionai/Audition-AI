
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
        const { panel, characters, storyTitle, style, aspectRatio, colorFormat, visualEffect, isCover } = jobConfig.payload;

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
            scriptData = JSON.parse(panel.visual_description);
            
            // Build a very explicit visual prompt
            // IGNORE generic plot summary, focus on specific visual descriptions.
            visualDirectives = `**STRICT VISUAL INSTRUCTIONS (Follow Exactly):**\n`;
            visualDirectives += `- Layout Mode: ${scriptData.layout_note || "Standard Grid"}\n`;
            
            if (scriptData.panels && Array.isArray(scriptData.panels)) {
                scriptData.panels.forEach((p: any) => {
                    visualDirectives += `\n[PANEL ${p.panel_id}]:\n`;
                    visualDirectives += `  - Visual Action: ${p.description}\n`;
                    
                    // Extract Dialogue for this panel to ensure text placement
                    if (p.dialogues && Array.isArray(p.dialogues)) {
                        p.dialogues.forEach((d: any) => {
                            // Ensure the text is sanitized
                            if (d.text && d.text.trim() !== "..." && d.text.trim() !== "") {
                                dialogueListText += `Panel ${p.panel_id} bubble: "${d.text}" (Speaker: ${d.speaker})\n`;
                            }
                        });
                    }
                });
            }
        } catch (e) {
            // Fallback
            visualDirectives = panel.visual_description;
            dialogueListText = "No dialogue.";
        }

        const lowerStyle = style.toLowerCase();
        const isWebtoon = lowerStyle.includes('webtoon') || lowerStyle.includes('manhwa');
        
        let layoutInstruction = isWebtoon 
            ? `**FORMAT: VERTICAL SCROLLING STRIP (WEBTOON)**.`
            : `**FORMAT: COMIC PAGE**. A single page layout with distinct panels separated by white gutters.`;

        const systemPrompt = `
            You are a master comic artist (Gemini 3 Pro Vision).
            
            **GOAL:** Draw a high-quality comic page based EXACTLY on the visual directives below.
            
            ${layoutInstruction}
            **ART STYLE:** ${style}. (Detailed lineart, 8k resolution).
            - Color Palette: ${colorFormat}
            ${visualEffect !== 'none' ? `- Visual Effect: ${visualEffect}` : ''}
            
            ${visualDirectives}
            
            **TEXT RENDERING (MANDATORY):**
            Add speech bubbles containing the following text. Ensure text is legible and placed correctly in the corresponding panels.
            ${dialogueListText}
            
            **CHARACTERS:**
            Refer to the provided images. Maintain consistency in appearance (hair, clothes, face).
        `;

        parts.push({ text: systemPrompt });

        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        parts.push({ text: `Reference Character: ${char.name}` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

        // Use Gemini 3 Pro for rendering
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
