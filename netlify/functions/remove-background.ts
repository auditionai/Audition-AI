import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';

const COST_PER_REMOVAL = 1;

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
    }

    const { image: imageDataUrl } = JSON.parse(event.body || '{}');

    // 1. Validate user and balance
    const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('diamonds')
        .eq('id', user.id)
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
        const model = 'gemini-2.5-flash-image'; 

        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)[1];
        const imagePart = { inlineData: { data: base64, mimeType } };
        const textPart = { text: "isolate the main subject with a transparent background" };

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
        const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';

        // 4. Upload result to the NEW 'temp_images' Supabase Storage bucket
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${user.id}/bg_removed_${Date.now()}.png`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from('temp_images') // Use the new temporary bucket
            .upload(fileName, imageBuffer, { contentType: finalImageMimeType });
            
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseAdmin.storage.from('temp_images').getPublicUrl(fileName);

        // 5. Update user diamonds and API key usage
        const newDiamondCount = userData.diamonds - COST_PER_REMOVAL;
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl: publicUrl,
                newDiamondCount,
            }),
        };

    } catch (error: any) {
        console.error('Background Removal Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi từ máy chủ AI khi tách nền.' }) };
    }
};

export { handler };