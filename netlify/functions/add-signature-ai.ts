
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import Jimp from 'jimp';
import { Buffer } from 'buffer';

const handler: Handler = async (event: HandlerEvent) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }

        const authHeader = event.headers['authorization'];
        if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        const token = authHeader.split(' ')[1];
        if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

        const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

        const { 
            image: imageDataUrl, text, aiStyle, aiColor, signaturePosition, 
            aiFont, aiSize, aiIsBold, aiIsItalic, aiCustomColor, model 
        } = JSON.parse(event.body || '{}');

        // 1. Cost Config
        const cost = (model === 'gemini-3-pro-image-preview') ? 10 : 1;

        if (!imageDataUrl || !text || !aiStyle) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing parameters.' }) };
        }
        
        // 2. Check Balance (Read Only)
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < cost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${cost}, bạn có ${userData.diamonds}.` }) };
        
        // 3. Prepare Image with MARKER
        console.log("[Signature] Applying Marker Strategy...");
        let markedBase64 = '';
        
        try {
            const [header, base64] = imageDataUrl.split(',');
            const imageBuffer = Buffer.from(base64, 'base64');
            
            // Load image into Jimp
            const image = await (Jimp as any).read(imageBuffer);
            const width = image.getWidth();
            const height = image.getHeight();
            
            // Draw a GREEN BOX at the target position
            // The model will be instructed to replace this green box
            const boxWidth = Math.max(150, Math.floor(width * 0.3)); // 30% width
            const boxHeight = Math.max(80, Math.floor(height * 0.15)); // 15% height
            
            const targetX = Math.floor(width * signaturePosition.x - boxWidth / 2);
            const targetY = Math.floor(height * signaturePosition.y - boxHeight / 2);
            
            // Ensure within bounds
            const safeX = Math.max(0, Math.min(width - boxWidth, targetX));
            const safeY = Math.max(0, Math.min(height - boxHeight, targetY));

            // Create Green Box Image
            // Note: Jimp v0.22 constructor usage: new Jimp(w, h, color)
            const greenBox = new (Jimp as any)(boxWidth, boxHeight, '#00FF00'); // Bright Green
            
            // Composite Green Box
            image.composite(greenBox, safeX, safeY);
            
            // Get Modified Image as Base64
            const markedImageBuffer = await image.getBufferAsync((Jimp as any).MIME_JPEG);
            markedBase64 = markedImageBuffer.toString('base64');

        } catch (jimpError: any) {
             console.error("Jimp processing failed:", jimpError);
             return { statusCode: 500, body: JSON.stringify({ error: `Lỗi xử lý ảnh nền (Jimp): ${jimpError.message}` }) };
        }

        // 4. AI Generation
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const selectedModel = model === 'gemini-3-pro-image-preview' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

        // Marker-based Prompt
        const aiPrompt = `
        **TASK:** IMAGE EDITING & INPAINTING
        
        1. [TARGET]: Locate the SOLID GREEN RECTANGLE (#00FF00) in the image.
        2. [ACTION]: REPLACE the green rectangle with the stylized text: "${text}".
        3. [STYLE]: ${aiStyle} style (e.g. Neon, Fire, Metal). Font: ${aiFont}. Color: ${aiColor === 'custom' ? aiCustomColor : aiColor}.
        4. [INTEGRATION]: The text must fit perfectly where the green box was. Remove the green box completely.
        5. [PRESERVATION]: DO NOT CHANGE any other part of the image. Keep background, characters, and lighting exactly as is.
        `;

        const parts: any[] = [];
        parts.push({ inlineData: { data: markedBase64, mimeType: 'image/jpeg' } });
        parts.push({ text: aiPrompt });

        console.log("[Signature] Sending to AI...");
        const response = await ai.models.generateContent({
            model: selectedModel,
            contents: { parts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI Generation Failed.");

        const finalImageBase64 = imagePartResponse.inlineData.data;
        
        // 5. Transaction (Pay on Success)
        const { data: latestUser } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        const newDiamondCount = (latestUser?.diamonds || userData.diamonds) - cost;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -cost,
                transaction_type: 'TOOL_USE',
                description: `Chèn chữ ký AI (${selectedModel === 'gemini-3-pro-image-preview' ? 'Pro' : 'Flash'})`
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ imageBase64: finalImageBase64, newDiamondCount }),
        };

    } catch (error: any) {
        console.error("Signature Tool Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi xử lý.' }) };
    }
};

export { handler };
