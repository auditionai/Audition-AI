
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST = 10; // 10 Diamonds per panel

const processDataUrl = (dataUrl: string | null) => {
    if (!dataUrl) return null;
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return { base64, mimeType };
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    try {
        const { panel, characters, style, aspectRatio } = JSON.parse(event.body || '{}');
        
        if (!panel || !panel.visual_description) return { statusCode: 400, body: JSON.stringify({ error: 'Missing panel data.' }) };

        // 1. Check Balance
        const { data: userData } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        if (!userData || userData.diamonds < COST) {
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${COST} Kim Cương.` }) };
        }

        // 2. Get API Key
        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('key_value, id').eq('status', 'active').limit(1).single();
        if (!apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Service busy.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // 3. Prepare Prompt & References
        const parts: any[] = [];
        
        // System Prompt for Comic Generation
        const systemPrompt = `
            You are a master comic artist specialized in ${style} style.
            Generate a single high-quality comic panel based on the description.
            
            **Visual Description:**
            ${panel.visual_description}
            
            **Style Constraints:**
            - Art Style: ${style}
            - High contrast, expressive lines.
            - Cinematic lighting.
            - Do NOT include speech bubbles or text in the image (they will be added later).
        `;
        parts.push({ text: systemPrompt });

        // Add Character References (Visual Consistency)
        // We only add characters that are mentioned in the visual description to save tokens/context, 
        // or add all if unsure. Here we add all provided characters.
        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                if (char.image_url) {
                    const imgData = processDataUrl(char.image_url);
                    if (imgData) {
                        parts.push({ text: `Reference for character "${char.name}":` });
                        parts.push({ inlineData: { data: imgData.base64, mimeType: imgData.mimeType } });
                    }
                }
            }
        }

        // 4. Call Gemini 3 Pro
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: {
                    aspectRatio: aspectRatio || '16:9', // Map specific aspect ratios if needed
                    imageSize: '2K' // High quality for comics
                }
            }
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart?.inlineData) throw new Error("AI failed to render the panel.");

        // 5. Upload to R2
        const s3Client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_ENDPOINT!,
            credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
        });

        const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
        const fileName = `${user.id}/comic/${Date.now()}_panel_${panel.panel_number}.png`;
        
        await (s3Client as any).send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: buffer,
            ContentType: 'image/png'
        }));

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        // 6. Deduct Gems
        await supabaseAdmin.rpc('increment_user_diamonds', { user_id_param: user.id, diamond_amount: -COST });
        await supabaseAdmin.from('diamond_transactions_log').insert({
            user_id: user.id,
            amount: -COST,
            transaction_type: 'COMIC_RENDER',
            description: `Vẽ khung tranh #${panel.panel_number}`
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount: userData.diamonds - COST }),
        };

    } catch (error: any) {
        console.error("Render panel failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
