import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }

        const authHeader = event.headers['authorization'];
        if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        const token = authHeader.split(' ')[1];
        if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

        const { 
            image: imageDataUrl, text, aiStyle, aiColor, signaturePosition, cost,
            aiFont, aiSize, aiIsBold, aiIsItalic, aiCustomColor 
        } = JSON.parse(event.body || '{}');

        if (!imageDataUrl || !text || !aiStyle || !aiColor || !signaturePosition || typeof cost !== 'number' || cost <= 0 || !aiFont || !aiSize || aiIsBold === undefined || aiIsItalic === undefined || !aiCustomColor) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameters for AI signature.' }) };
        }
        
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < cost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${cost}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const model = 'gemini-2.5-flash-image';

        // --- SERVER-SIDE PROMPT CONSTRUCTION ---
         let promptParts = [
            "Your task is to add text to the provided image with precision. Follow these rules strictly:",
            `1.  **Text Content:** Add the exact text: "${text}"`,
            `2.  **Placement:** The text block's absolute center must be at this location: ${Math.round(signaturePosition.x * 100)}% from the left and ${Math.round(signaturePosition.y * 100)}% from the top. This is a critical placement requirement.`,
            "3.  **Visual Style:",
            `    *   **Overall Style:** Create a legible text with a style described as '${aiStyle}'.`,
            `    *   **Font Family:** Use a font that visually resembles "${aiFont}".`,
            `    *   **Font Attributes:** ${aiIsBold ? 'Bold weight' : 'Normal weight'}. ${aiIsItalic ? 'Italic style' : 'Upright style'}.`,
            `    *   **Font Size:** The text height should be approximately ${aiSize} pixels relative to a 1024px tall image. Adjust size proportionally if the image is a different height.`,
        ];

        if (aiColor === 'custom') {
            promptParts.push(`    *   **Coloring:** The text color MUST be this exact hex code: ${aiCustomColor}. Do not use any other colors or gradients.`);
        } else {
            promptParts.push(`    *   **Coloring:** The text must have a vibrant ${aiColor} color palette.`);
        }

        promptParts.push("4.  **Final Output:** Do not alter, crop, or change any other part of the original image. The output must be the original image with only the specified text added according to these rules.");

        const aiPrompt = promptParts.join('\n');
        // --- END ---

        const parts: any[] = [];
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        parts.push({ inlineData: { data: base64, mimeType } });
        parts.push({ text: aiPrompt });

        const response = await ai.models.generateContent({
            model,
            contents: { parts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI không thể chèn chữ ký vào ảnh này. Hãy thử lại.");

        const finalImageBase64 = imagePartResponse.inlineData.data;
        
        // No need to upload to S3 for this tool, just return the base64
        const newDiamondCount = userData.diamonds - cost;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -cost,
                transaction_type: 'TOOL_USE',
                description: 'Chèn chữ ký bằng AI'
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ imageBase64: finalImageBase64, newDiamondCount }),
        };

    } catch (error: any) {
        console.error("Add signature AI function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi không xác định từ máy chủ.' }) };
    }
};

export { handler };
