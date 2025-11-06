import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';

// Fix: Create the `generate-image` Netlify function to serve as the backend endpoint.
// This resolves the missing function error and implements the core AI image generation logic.
const COST_PER_IMAGE = 1;

const handler: Handler = async (event: HandlerEvent) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }

        // 1. Authenticate user
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

        // 2. Parse request body
        const { prompt, characterImage, styleImage, model, style, aspectRatio } = JSON.parse(event.body || '{}');

        // 3. Check user's diamonds
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

        // 4. Get available API key
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

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        const fullPrompt = style.id !== 'none' ? `${prompt}, in the style of ${style.name}` : prompt;

        // 5. Call Google GenAI API based on model type
        if (model.apiModel === 'imagen-4.0-generate-001') {
            const response = await ai.models.generateImages({
                model: model.apiModel,
                prompt: fullPrompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio,
                    outputMimeType: 'image/jpeg'
                },
            });
            const imageResponse = response.generatedImages[0];
            if (!imageResponse?.image?.imageBytes) {
                throw new Error("AI không thể tạo hình ảnh này (Imagen).");
            }
            finalImageBase64 = imageResponse.image.imageBytes;
            finalImageMimeType = 'image/jpeg';
        } else { // gemini-2.5-flash-image
            const parts: any[] = [];
            if (characterImage) {
                parts.push({ inlineData: characterImage });
            }
            if (styleImage) {
                parts.push({ inlineData: styleImage });
            }
            if (prompt) {
                parts.push({ text: fullPrompt });
            }

            const response = await ai.models.generateContent({
                model: model.apiModel,
                contents: { parts: parts },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });

            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) {
                throw new Error("AI không thể tạo hình ảnh này (Gemini).");
            }
            finalImageBase64 = imagePartResponse.inlineData.data;
            finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        }

        // 6. Upload image to Supabase Storage
        const finalFileExtension = finalImageMimeType.split('/')[1] || 'png';
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${user.id}/${Date.now()}.${finalFileExtension}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from('generated_images')
            .upload(fileName, imageBuffer, { contentType: finalImageMimeType });
            
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('generated_images')
            .getPublicUrl(fileName);

        // 7. Update user profile and API key usage in parallel
        const newDiamondCount = userData.diamonds - COST_PER_IMAGE;
        const newXp = userData.xp + 10; // Grant 10 XP per creation
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: fullPrompt,
                image_url: publicUrl,
                model_used: model.name,
            }),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);
        
        // 8. Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl: publicUrl,
                newDiamondCount,
                newXp
            }),
        };

    } catch (error: any) {
        console.error("Image Generation Function Error:", error);
        const errorMessage = error.message || 'Unknown server error.';
        return { statusCode: 500, body: JSON.stringify({ error: `Lỗi khi tạo ảnh: ${errorMessage}` }) };
    }
};

export { handler };
