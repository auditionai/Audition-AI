import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';

const COST_PER_IMAGE = 1;

// This function will handle the actual image generation with a given API key.
const performImageGeneration = async (
    apiKey: string,
    modelApi: string,
    prompt: string,
    characterImageBase64: string | null,
    styleImageBase64: string | null,
    styleId: string,
    aspectRatio: string
) => {
    const ai = new GoogleGenAI({ apiKey });
    let finalPrompt = prompt;
    if (styleId !== 'none') {
        const styleName = styleId.replace(/_/g, ' ');
        finalPrompt = `${prompt}, in ${styleName} style`;
    }
    
    // Imagen models use a dedicated endpoint
    if (modelApi.startsWith('imagen')) {
        const response = await ai.models.generateImages({
            model: modelApi,
            prompt: finalPrompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
                aspectRatio,
            },
        });
        
        if (!response.generatedImages || response.generatedImages.length === 0) {
            throw new Error('AI failed to generate an image with Imagen.');
        }
        return response.generatedImages[0].image.imageBytes; // This is base64
    }

    // Gemini models use the generateContent endpoint
    if (modelApi.startsWith('gemini')) {
        const parts: any[] = [];
        if (characterImageBase64) {
            const [header, base64] = characterImageBase64.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1];
            if (mimeType && base64) {
                parts.push({ inlineData: { data: base64, mimeType } });
            }
        }
        if (styleImageBase64) {
             const [header, base64] = styleImageBase64.split(',');
             const mimeType = header.match(/:(.*?);/)?.[1];
             if (mimeType && base64) {
                parts.push({ inlineData: { data: base64, mimeType } });
            }
        }
        parts.push({ text: finalPrompt });

        const response = await ai.models.generateContent({
            model: modelApi,
            contents: { parts: parts },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart || !imagePart.inlineData) {
            throw new Error('AI failed to generate an image with Gemini.');
        }
        return imagePart.inlineData.data; // This is base64
    }

    throw new Error(`Unsupported model API: ${modelApi}`);
};


const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // 1. Authenticate user
        const authHeader = event.headers['authorization'];
        const token = authHeader?.split(' ')[1];
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
        }
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };
        }

        // 2. Parse body and check user's diamonds
        const { prompt, characterImage, styleImage, modelApi, styleId, aspectRatio } = JSON.parse(event.body || '{}');
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
            .order('usage_count', { ascending: true }) // Use the least used key
            .limit(1)
            .single();

        if (apiKeyError || !apiKeyData) {
            return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        }
        
        // 4. Generate the image
        const generatedImageBase64 = await performImageGeneration(
            apiKeyData.key_value,
            modelApi,
            prompt,
            characterImage,
            styleImage,
            styleId,
            aspectRatio
        );
        
        // 5. Upload image to storage
        const imageBuffer = Buffer.from(generatedImageBase64, 'base64');
        const fileName = `${user.id}/generated_${Date.now()}.png`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from('generated_images')
            .upload(fileName, imageBuffer, { contentType: 'image/png' });

        if (uploadError) {
            console.error('Storage Upload Error:', uploadError);
            throw new Error('Không thể lưu ảnh đã tạo.');
        }
        
        // 6. Get public URL (we use this instead of signed URL for gallery)
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('generated_images')
            .getPublicUrl(fileName);

        if (!publicUrl) {
            throw new Error('Không thể lấy URL của ảnh.');
        }

        // 7. Update user profile and log transaction in one go
        const newDiamondCount = userData.diamonds - COST_PER_IMAGE;
        const newXp = (userData.xp || 0) + 10; // Grant 10 XP per creation
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: prompt,
                image_url: publicUrl,
                model_used: modelApi,
            })
        ]);
        
        // 8. Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl: publicUrl,
                newDiamondCount: newDiamondCount,
            }),
        };

    } catch (error: any) {
        console.error("Generate Image Function Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi máy chủ không xác định.' }) };
    }
};

export { handler };
