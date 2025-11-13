import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const XP_PER_CHARACTER = 5;

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

        const { 
            characters, layout, layoutPrompt, background, backgroundPrompt, style, stylePrompt, aspectRatio
        } = JSON.parse(event.body || '{}');

        if (!characters || characters.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Character information is required.' }) };
        }
        
        const totalCost = characters.length; // 1 diamond per character
        const totalXpGain = characters.length * XP_PER_CHARACTER;

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < totalCost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // --- CONSTRUCT MEGA PROMPT ---
        const promptLines = [
            `Create a single, high-quality image with the following detailed specifications. The final image must contain exactly ${characters.length} characters.`,
            "\n--- OVERALL SCENE ---",
            `- Style: A '${style}' look. ${stylePrompt}`,
            `- Background: The setting is '${background}'. ${backgroundPrompt}`,
            `- Composition: The group is arranged in a '${layout}' pose. ${layoutPrompt}`,
            "\n--- CHARACTER DETAILS ---",
            "Each character MUST be distinct and based ONLY on their corresponding reference images. Do NOT mix outfits or faces between characters.",
        ];

        const parts: any[] = [];
        characters.forEach((char: any, index: number) => {
            promptLines.push(`- Character ${index + 1}:`);
            let hasPose = false;
            let hasFace = false;

            if (char.poseImage) {
                promptLines.push("  - Wears the outfit and has the body shape from the provided reference image.");
                hasPose = true;
            }
            if (char.faceImage) {
                promptLines.push("  - Has the exact facial features, identity, and expression from the provided face reference image. This is a critical instruction.");
                hasFace = true;
            }
            if (!hasPose && !hasFace) {
                promptLines.push("  - A character with a style matching the overall theme.");
            }
        });

        promptLines.push("\n--- FINAL INSTRUCTIONS ---",
            "- Ensure all characters are fully visible and anatomically correct.",
            "- The lighting on all characters must be consistent and match the background.",
            "- The final image must be cohesive and look like a single photograph or artwork."
        );
        
        const finalPrompt = promptLines.join('\n');
        parts.push({ text: finalPrompt });

        // Add all images to parts array
        characters.forEach((char: any) => {
            if (char.poseImage) {
                const [header, base64] = char.poseImage.split(',');
                parts.push({ inlineData: { data: base64, mimeType: header.match(/:(.*?);/)?.[1] || 'image/png' } });
            }
             if (char.faceImage) {
                const [header, base64] = char.faceImage.split(',');
                parts.push({ inlineData: { data: base64, mimeType: header.match(/:(.*?);/)?.[1] || 'image/png' } });
            }
        });
        
        const apiModel = 'gemini-2.5-flash-image';
        const response = await ai.models.generateContent({
            model: apiModel,
            contents: { parts: parts },
            config: { 
                responseModalities: [Modality.IMAGE],
            },
        });

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh nhóm từ mô tả này. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");

        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/group/${Date.now()}.${fileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        });
        await (s3Client as any).send(putCommand);
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = userData.xp + totalXpGain;
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: `[Group Photo]: ${layout}, ${background}, ${style}`,
                image_url: publicUrl,
                model_used: apiModel,
            }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'GROUP_IMAGE_GENERATION',
                description: `Tạo ảnh nhóm ${characters.length} người`
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount }),
        };

    } catch (error: any) {
        console.error("Generate group image function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Lỗi không xác định từ máy chủ.' }) };
    }
};

export { handler };