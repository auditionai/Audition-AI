import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// This is a placeholder for a Face Restore/Swap API. 
// In a real application, you would call a service like Replicate, an external API,
// or another Google model specialized for this task.
// For this demo, we will simulate it by simply returning the original generated image.
const callFaceEnhancerApi = async (baseImage: string, faceReferenceImage: string): Promise<string> => {
    console.log("SIMULATING: Calling Face Enhancer API.");
    // In a real scenario, this function would:
    // 1. Send `baseImage` and `faceReferenceImage` to a specialized AI service.
    // 2. The service would return a new image with the face swapped/restored.
    // 3. Return the base64 of the new, enhanced image.
    await new Promise(res => setTimeout(res, 3000)); // Simulate network latency
    console.log("SIMULATING: Face Enhancer API returned result.");
    return baseImage; // For demo, just return the original.
};


const handler: Handler = async (event: HandlerEvent) => {
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

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

        const { prompt, poseImage, styleImage, faceReferenceImage, model, style, aspectRatio, useFaceEnhancer } = JSON.parse(event.body || '{}');

        // DYNAMIC COST CALCULATION
        const cost = 1 + (useFaceEnhancer && faceReferenceImage ? 1 : 0);
        const xp_reward = 10 + (useFaceEnhancer && faceReferenceImage ? 10 : 0); // More XP for advanced feature

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < cost) return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương.' }) };

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        let finalImageBase64: string;
        let finalImageMimeType: string;

        let creativeBrief = prompt;
        if (style.id !== 'none' && creativeBrief) {
            creativeBrief = `${prompt}, in the style of ${style.name}`;
        }

        // --- Start of Image Generation Logic ---
        const parts: any[] = [];
        if (poseImage) parts.push({ inlineData: poseImage });
        if (styleImage) parts.push({ inlineData: styleImage });
        
        // IMPORTANT: Add Face Reference image to parts if NOT using the enhancer
        // If the enhancer is used, the face image is sent to the second API call, not the first.
        if (faceReferenceImage && !useFaceEnhancer) {
            parts.push({ inlineData: faceReferenceImage });
        }

        if (creativeBrief) parts.push({ text: creativeBrief });

        const response = await ai.models.generateContent({
            model: model.apiModel,
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE] },
        });
        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh này (Gemini).");
        
        let generatedImageBase64 = imagePartResponse.inlineData.data;
        finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        // --- End of Image Generation Logic ---
        
        // --- Start of Face Enhancement Logic ---
        if (useFaceEnhancer && faceReferenceImage) {
            finalImageBase64 = await callFaceEnhancerApi(generatedImageBase64, faceReferenceImage.data);
        } else {
            finalImageBase64 = generatedImageBase64;
        }
        // --- End of Face Enhancement Logic ---


        // --- START OF R2 UPLOAD LOGIC ---
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const finalFileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/${Date.now()}.${finalFileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        });
        
        // FIX: Cast s3Client to 'any' to bypass a likely environment-specific TypeScript type resolution error.
        await (s3Client as any).send(putCommand);
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
        // --- END OF R2 UPLOAD LOGIC ---

        const newDiamondCount = userData.diamonds - cost;
        const newXp = userData.xp + xp_reward;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.from('generated_images').insert({ user_id: user.id, prompt: prompt, image_url: publicUrl, model_used: model.name }),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -cost,
                transaction_type: useFaceEnhancer ? 'IMAGE_GENERATION_ENHANCED' : 'IMAGE_GENERATION',
                description: `Tạo ảnh${useFaceEnhancer ? ' (Face ID)' : ''}: ${model.name}`
            })
        ]);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount, newXp }),
        };

    } catch (error: any) {
        console.error("Image Generation Function Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: `Lỗi khi tạo ảnh: ${error.message || 'Unknown server error.'}` }) };
    }
};

export { handler };