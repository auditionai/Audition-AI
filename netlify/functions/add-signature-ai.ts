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

        const { image: imageDataUrl, text, aiStyle, aiColor, signaturePosition, cost } = JSON.parse(event.body || '{}');

        if (!imageDataUrl || !text || !aiStyle || !aiColor || !signaturePosition || typeof cost !== 'number' || cost <= 0) {
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
        const aiPrompt = `Add the text "${text}" to the image. The text MUST be placed centered at the approximate coordinates (left: ${Math.round(signaturePosition.x * 100)}%, top: ${Math.round(signaturePosition.y * 100)}%). Style the text as ${aiStyle} with a ${aiColor} color scheme. It is crucial that the text is spelled correctly and is legible. Do not alter any other part of the original image.`;
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
