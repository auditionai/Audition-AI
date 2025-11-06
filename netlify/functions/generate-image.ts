import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality, Part } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';

const COST_PER_IMAGE = 1;
const XP_PER_IMAGE = 25;

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

        // 2. Parse body and check user balance
        const {
            prompt, characterImage, styleImage, model, style, aspectRatio, isOutpainting
        } = JSON.parse(event.body || '{}');

        if (!prompt || !model) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and model are required.' }) };
        }

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

        // 3. Get an active API key
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

        // 4. Call Google Gemini API
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        const fullPrompt = style.id !== 'none' ? `${prompt}, in the style of ${style.name}` : prompt;

        if (model.apiModel.startsWith('imagen')) {
             // --- Imagen 4 Logic (Text-to-Image) ---
            const response = await ai.models.generateImages({
                model: model.apiModel,
                prompt: fullPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: aspectRatio
                },
            });
            finalImageBase64 = response.generatedImages[0].image.imageBytes;
            finalImageMimeType = 'image/jpeg';

        } else if (model.apiModel.startsWith('gemini')) {
            // --- Gemini Flash Logic (Text-to-Image / Image-to-Image) ---
            const parts: Part[] = [];
            if (characterImage) {
                parts.push({ inlineData: characterImage });
            }
            if (styleImage) {
                parts.push({ inlineData: styleImage });
            }
            
            const textPrompt = isOutpainting 
                ? `${fullPrompt} (outpainting the gray background area to match the central subject)` 
                : fullPrompt;
            parts.push({ text: textPrompt });

            const response = await ai.models.generateContent({
                model: model.apiModel,
                contents: { parts: parts },
                config: { responseModalities: [Modality.IMAGE] },
            });

            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) {
                throw new Error("AI did not return a valid image.");
            }
            finalImageBase64 = imagePartResponse.inlineData.data;
            finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        } else {
            return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported AI model.' }) };
        }

        // 5. Upload result to storage
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/${Date.now()}.${fileExtension}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from('generated_images')
            .upload(fileName, imageBuffer, { contentType: finalImageMimeType });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('generated_images')
            .getPublicUrl(fileName);

        // 6. Update user stats and log the generation
        const newDiamondCount = userData.diamonds - COST_PER_IMAGE;
        const newXp = userData.xp + XP_PER_IMAGE;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: prompt,
                image_url: publicUrl,
                model_used: model.name,
                style_used: style.name
            })
        ]);

        // 7. Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl: publicUrl,
                newDiamondCount: newDiamondCount,
                newXp: newXp
            }),
        };

    } catch (error: any) {
        console.error("Generate Image Function Error:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) 
        };
    }
};

export { handler };
