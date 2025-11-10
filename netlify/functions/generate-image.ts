import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_BASE = 1;
const COST_UPSCALE = 1;
const XP_PER_GENERATION = 10;

const buildSignaturePrompt = (
    text: string, style: string, position: string, 
    color: string, customColor: string, size: string
): string => {
    if (!text || text.trim() === '') return '';

    // A more descriptive, less imperative style for image models.
    let instruction = `The image should include a signature that says "${text.trim()}".`;
    
    const styleMap: { [key: string]: string } = {
        handwritten: 'a handwritten script style',
        sans_serif: 'a clean sans-serif font style',
        bold: 'a bold font style',
        vintage: 'a vintage retro font style',
        '3d': 'a 3D typography style',
        messy: 'a messy grunge font style',
        outline: 'an outline font style',
        teen_code: 'a playful teen-code font style',
        mixed: 'a creative mixed font style',
    };

    const sizeMap: { [key: string]: string } = {
        small: 'small and discreet',
        medium: 'medium-sized and noticeable',
        large: 'large and prominent',
    };
    
    const positionMap: { [key: string]: string } = {
        bottom_right: 'in the bottom-right corner',
        bottom_left: 'in the bottom-left corner',
        top_right: 'in the top-right corner',
        top_left: 'in the top-left corner',
        center: 'in the center',
        random: 'in a visually pleasing location',
    };
    
    let colorDesc = 'white or a contrasting color';
    if (color === 'rainbow') {
        colorDesc = 'a vibrant rainbow gradient color';
    } else if (color === 'custom' && customColor) {
        colorDesc = `the color ${customColor}`;
    } else if (color === 'random') {
        colorDesc = 'a random, complementary color';
    }

    // Combine into a more natural phrase.
    instruction += ` The signature is ${sizeMap[size] || 'medium-sized'}, in ${styleMap[style] || 'a clean font style'}, with ${colorDesc}, and placed ${positionMap[position] || 'in the bottom-right corner'}.`;

    return ' ' + instruction;
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

        const { 
            prompt, apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, useUpscaler, useSignature,
            signatureText, signatureStyle, signaturePosition, signatureColor, signatureCustomColor, signatureSize
        } = JSON.parse(event.body || '{}');

        if (!prompt || !apiModel) return { statusCode: 400, body: JSON.stringify({ error: 'Prompt and apiModel are required.' }) };
        
        const totalCost = COST_BASE + (useUpscaler ? COST_UPSCALE : 0);

        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        if (userData.diamonds < totalCost) return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        let fullPrompt = prompt;
        
        if (useSignature) {
            const signatureInstruction = buildSignaturePrompt(
                signatureText, signatureStyle, signaturePosition, signatureColor, signatureCustomColor, signatureSize
            );
            if (signatureInstruction) {
                fullPrompt += signatureInstruction;
            }
        }

        const randomSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        if (apiModel.startsWith('imagen')) {
            const response = await ai.models.generateImages({
                model: apiModel,
                prompt: fullPrompt,
                config: { 
                    numberOfImages: 1, 
                    outputMimeType: 'image/png',
                    aspectRatio: aspectRatio,
                    seed: randomSeed,
                },
            });
            finalImageBase64 = response.generatedImages[0].image.imageBytes;
            finalImageMimeType = 'image/png';
        } else { // Assuming gemini-flash-image
            const parts: any[] = [];
            
            // Add aspect ratio instruction to the prompt for Gemini Vision model
            fullPrompt += ` Please ensure the final image has a ${aspectRatio} aspect ratio.`;
            
            const addImagePart = (imageDataUrl: string | null) => {
                if (!imageDataUrl) return;
                const [header, base64] = imageDataUrl.split(',');
                if (!base64) {
                     console.warn("Skipping malformed image data URL.");
                     return;
                }
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
                parts.push({ inlineData: { data: base64, mimeType } });
            };
            
            // Send images first, then the prompt
            addImagePart(characterImage);
            addImagePart(styleImage);
            addImagePart(faceReferenceImage);
            parts.push({ text: fullPrompt });
            
            const response = await ai.models.generateContent({
                model: apiModel,
                contents: { parts: parts },
                config: { 
                    responseModalities: [Modality.IMAGE],
                    seed: randomSeed,
                },
            });

            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) throw new Error("AI không thể tạo hình ảnh từ mô tả này. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");

            finalImageBase64 = imagePartResponse.inlineData.data;
            finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        }

        if (useUpscaler) {
            console.log(`[UPSCALER] Upscaling image for user ${user.id}... (DEMO)`);
        }

        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileExtension = finalImageMimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/${Date.now()}.${fileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: finalImageMimeType,
        });
        await (s3Client as any).send(putCommand);
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = userData.xp + XP_PER_GENERATION;
        
        let logDescription = `Tạo ảnh: ${prompt.substring(0, 50)}...`;
        if (useUpscaler) {
            logDescription += " (Nâng cấp)";
        }
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: prompt,
                image_url: publicUrl,
                model_used: apiModel,
                used_face_enhancer: !!faceReferenceImage
            }),
            supabaseAdmin.from('diamond_transactions_log').insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'IMAGE_GENERATION',
                description: logDescription
            })
        ]);

        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount, newXp }),
        };

    } catch (error: any) {
        console.error("Generate image function error:", error);
        let clientFriendlyError = 'Lỗi không xác định từ máy chủ.';
        if (error?.message) {
            if (error.message.includes('INVALID_ARGUMENT')) {
                 clientFriendlyError = 'Lỗi từ AI: Không thể xử lý ảnh đầu vào. Hãy thử lại hoặc thay đổi ảnh đầu vào.';
            } else {
                clientFriendlyError = error.message;
            }
        }
            
        return { statusCode: 500, body: JSON.stringify({ error: clientFriendlyError }) };
    }
};

export { handler };