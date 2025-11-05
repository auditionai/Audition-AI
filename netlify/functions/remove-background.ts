import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';

const COST_PER_REMOVAL = 1;

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const { user } = context.clientContext as any;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const { image: imageDataUrl } = JSON.parse(event.body || '{}');

    // 1. Validate user and balance
    const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('diamonds')
        .eq('id', user.sub)
        .single();
    
    if (userError || !userData) {
        return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
    }
    if (userData.diamonds < COST_PER_REMOVAL) {
        return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương.' }) };
    }

    // 2. Get a rotating API key
    const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
        .from('api_keys')
        .select('id, key_value')
        .eq('status', 'active')
        .order('usage_count', { ascending: true })
        .limit(1)
        .single();

    if (apiKeyError || !apiKeyData) {
        return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
    }

    try {
        // 3. Call Gemini API to remove background
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const model = 'gemini-2.5-flash-image'; // Use a model that supports image editing

        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)[1];
        const imagePart = { inlineData: { data: base64, mimeType } };
        const textPart = { text: "remove the background from this image. make the background transparent." };

        const response = await ai.models.generateContent({
            model,
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) {
            throw new Error("AI không thể tách nền hình ảnh này.");
        }
        
        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType;
        const finalImageUrl = `data:${finalImageMimeType};base64,${finalImageBase64}`;

        // 4. Update database
        const newDiamondCount = userData.diamonds - COST_PER_REMOVAL;
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.sub),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl: finalImageUrl,
                newDiamondCount,
            }),
        };

    } catch (error: any) {
        console.error('Background Removal Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi từ máy chủ AI khi tách nền.' }) };
    }
};

export { handler };
