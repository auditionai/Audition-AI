
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
        const isWebtoon = lowerStyle.includes('webtoon') || lowerStyle.includes('manhwa') || lowerStyle.includes('scrolling');
        const lowerColor = colorFormat.toLowerCase();
        const wantsColor = lowerColor.includes('color') || lowerColor.includes('màu');

        let layoutInstruction = "";
        if (isWebtoon) {
            // WEBTOON MODE: Single large vertical panel
            layoutInstruction = `
            **LAYOUT MODE: WEBTOON / MANHWA (Vertical Scroll)**
            - Draw a SINGLE, large, high-quality vertical image.
            - Do NOT create a grid. Do NOT create multiple small sub-panels.
            - Focus on a single dramatic moment or a cinematic wide shot suitable for vertical scrolling.
            - The composition should fill the entire canvas effectively.
            `;
        } else {
            // MANGA / COMIC MODE: Traditional Page Layout with 3-5 panels
            layoutInstruction = `
            **LAYOUT MODE: TRADITIONAL COMIC PAGE**
            - Draw a FULL COMIC PAGE consisting of 3 to 6 distinct panels (frames).
            - Separate panels using clear white gutters (grid lines).
            - Vary the panel sizes (e.g., one large establishing shot, smaller reaction shots).
            - Arrange them logically from top-left to bottom-right.
            `;
        }

        // --- COLOR LOGIC OVERRIDE ---
        // If user wants color (colorFormat) but style says B&W (Manga), force color.
        let colorInstruction = `- Color Palette: ${colorFormat || 'Full Color'}`;
        if (wantsColor && lowerStyle.includes('black and white')) {
            colorInstruction = `- Color Palette: **FULL COLOR** (Override B&W style). Use vibrant colors suitable for Manhwa/Webtoon.`;
        }

        const qualityKeywords = "masterpiece, best quality, high resolution, incredibly detailed, 8k, cinematic lighting, sharp focus, professional composition";
        
        // --- DIALOGUE CONSTRUCTION ---
        let dialogueInstruction = "";
        if (panel.dialogue && Array.isArray(panel.dialogue) && panel.dialogue.length > 0) {
            const dialogueList = panel.dialogue.map((d: any) => {
                const speaker = d.speaker === "Lời dẫn" ? "NARRATION BOX" : `Character ${d.speaker}`;
                return `- ${speaker}: "${d.text}"`;
            }).join('\n');
            
            dialogueInstruction = `
            **MANDATORY TEXT RENDERING:**
            You MUST render speech bubbles or narration boxes directly into the image.
            The text inside the bubbles MUST be EXACTLY:
            ${dialogueList}
            
            *   **LANGUAGE RULE:** The text MUST be in **VIETNAMESE** as provided. Spelling must be perfect.
            *   **PLACEMENT:** Place bubbles intelligently inside their respective panels or space.
            *   **STYLE:** Use professional comic fonts. White bubbles with black text.
            `;
        } else {
            dialogueInstruction = "This page has no dialogue. Focus on visual storytelling.";
        }

        // --- SPECIAL MODE: COVER PAGE ---
        let systemPrompt = "";
        
        if (isCover) {
            systemPrompt = `
                You are a world-class Graphic Designer and Comic Artist.
                **TASK:** Create a professional Movie-Poster style Comic Book Cover for a story titled: "${storyTitle}".
                
                **REQUIREMENTS:**
                1.  **TITLE:** Render the title "${storyTitle}" clearly and artistically at the top or bottom. Large, bold, stylized typography.
                2.  **VISUAL:** ${panel.visual_description}
                3.  **STYLE:** ${style}. ${qualityKeywords}.
                4.  **COMPOSITION:** Eye-catching, dynamic, poster-quality.
                5.  **LANGUAGE:** All text MUST be VIETNAMESE.
            `;
        } else {
            // --- NORMAL PAGE MODE ---
            let effectInstruction = "";
            if (visualEffect && visualEffect !== 'none') {
                effectInstruction = `- Apply visual effect: ${visualEffect}`;
            }

            const characterRefText = characters.map((c: any) => 
                `Character "${c.name}": ${c.description}`
            ).join('\n');

            systemPrompt = `
                You are a master comic artist specialized in ${style}.
                
                ${layoutInstruction}
                
                **VISUAL SCENE DESCRIPTION (FULL PAGE):**
                ${panel.visual_description}
                
                ${dialogueInstruction}
                
                **ENVIRONMENTAL TEXT RULE:**
                If there are any background signs, books, posters, or sound effects (SFX) in the scene, they MUST be written in **VIETNAMESE**.
                
                **CHARACTER REFERENCES:**
                ${characterRefText}
                (Use reference images provided for visual consistency).
                
                **STYLE CONSTRAINTS:**
                - Art Style: ${style}
                ${colorInstruction}
                - ${qualityKeywords}
                ${effectInstruction}
            `;
        }

        parts.push({ text: systemPrompt });

        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        parts.push({ text: `Reference Image for: ${char.name}` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

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
