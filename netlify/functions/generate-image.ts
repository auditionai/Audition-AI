import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';

const COST_PER_IMAGE = 1;
const XP_GAINED = 10;

// Helper to decode data URL
const dataUrlToBuffer = (dataUrl: string) => {
    const base64 = dataUrl.split(',')[1];
    return Buffer.from(base64, 'base64');
};

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

    const { prompt, characterImage, styleImage, model, style, aspectRatio } = JSON.parse(event.body || '{}');

    // 1. Validate user and balance
    const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('diamonds, xp')
        .eq('id', user.id)
        .single();
    
    if (userError || !userData) {
        return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
    }
    if (userData.diamonds < COST_PER_IMAGE) {
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
        // 3. Call Gemini API
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        let finalImageBase64: string;
        let finalImageMimeType: string = 'image/jpeg';

        let fullPrompt = prompt;
        if (style && style !== 'none') {
            fullPrompt = `${prompt}, theo phong cách ${style}.`;
        }
        
        // Logic for different model families
        if (model.startsWith('imagen')) {
            const response = await ai.models.generateImages({
                model: model,
                prompt: fullPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: aspectRatio,
                },
            });
            finalImageBase64 = response.generatedImages[0].image.imageBytes;
        } else { // Gemini family
            const parts: any[] = [];
            if (characterImage) {
                const [header, base64] = characterImage.split(',');
                const mimeType = header.match(/:(.*?);/)[1];
                parts.push({ inlineData: { data: base64, mimeType } });
            }
             if (styleImage) {
                const [header, base64] = styleImage.split(',');
                const mimeType = header.match(/:(.*?);/)[1];
                parts.push({ inlineData: { data: base64, mimeType } });
            }
            parts.push({ text: fullPrompt });
            
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts: parts },
                config: { responseModalities: [Modality.IMAGE] },
            });
            
            const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePart?.inlineData) throw new Error("AI không trả về hình ảnh.");
            
            finalImageBase64 = imagePart.inlineData.data;
            finalImageMimeType = imagePart.inlineData.mimeType;
        }
        
        // 4. Upload result to Supabase Storage
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${user.id}/${Date.now()}.jpg`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('generated_images')
            .upload(fileName, imageBuffer, { contentType: finalImageMimeType });
            
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseAdmin.storage.from('generated_images').getPublicUrl(fileName);

        // 5. Update database in a transaction
        const newDiamondCount = userData.diamonds - COST_PER_IMAGE;
        const newXp = userData.xp + XP_GAINED;

        // Using Promise.all to run updates concurrently
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.from('generated_images').insert({ user_id: user.id, prompt: prompt, image_url: publicUrl, model_used: model }),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl: publicUrl,
                newDiamondCount,
                newXp,
                xpGained: XP_GAINED
            }),
        };

    } catch (error: any) {
        console.error('Gemini API or DB Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi từ máy chủ AI.' }) };
    }
};

export { handler };