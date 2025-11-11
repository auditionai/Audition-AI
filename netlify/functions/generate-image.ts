import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const COST_BASE = 1;
const COST_UPSCALE = 1;
const XP_PER_GENERATION = 10;
const DB_PROMPT_TRUNCATE_LENGTH = 1000; // Max length for prompt in DB

const handler: Handler = async (event: HandlerEvent) => {
    try {
        const { supabaseAdmin } = await import('./utils/supabaseClient');
        
        const requiredEnvVars = [
            'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 
            'R2_BUCKET_NAME', 'R2_PUBLIC_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL'
        ];
        const missingVars = requiredEnvVars.filter(v => !process.env[v]);
        if (missingVars.length > 0) {
            console.error(`[FATAL] Server configuration error. Missing environment variables: ${missingVars.join(', ')}`);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: `Lỗi cấu hình máy chủ. Thiếu: ${missingVars.join(', ')}` }),
            };
        }

        console.log("--- [START] /generate-image function execution ---");

        const s3Client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_ENDPOINT!,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            },
        });

        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }
        
        console.log("[STEP 1/10] Authenticating user...");
        const authHeader = event.headers['authorization'];
        if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        const token = authHeader.split(' ')[1];
        if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            console.error("[FAIL] Authentication failed:", authError);
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }
        console.log(`[OK] User authenticated: ${user.id}`);

        console.log("[STEP 2/10] Parsing request body...");
        const body = JSON.parse(event.body || '{}');
        
        // Defensive validation: ensure prompt is a string and trim it.
        const prompt = body.prompt ? String(body.prompt).trim() : '';
        const { 
            apiModel, characterImage, faceReferenceImage, styleImage, 
            aspectRatio, useUpscaler
        } = body;


        if (!prompt || !apiModel) {
            const missing = [];
            if (!prompt) missing.push('prompt');
            if (!apiModel) missing.push('apiModel');
            const errorMsg = `Yêu cầu thiếu các trường bắt buộc: ${missing.join(', ')}.`;
            console.error(`[FAIL] Validation failed. ${errorMsg}`);
            return { statusCode: 400, body: JSON.stringify({ error: errorMsg }) };
        }
        console.log(`[OK] Body parsed. Model: ${apiModel}, Upscaler: ${useUpscaler}`);
        
        console.log("[STEP 3/10] Checking user balance...");
        const totalCost = COST_BASE + (useUpscaler ? COST_UPSCALE : 0);
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('diamonds, xp').eq('id', user.id).single();
        if (userError || !userData) {
             console.error(`[FAIL] User not found in DB: ${user.id}`, userError);
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < totalCost) {
            console.error(`[FAIL] Insufficient balance for user ${user.id}. Needed: ${totalCost}, Has: ${userData.diamonds}`);
            return { statusCode: 402, body: JSON.stringify({ error: `Không đủ kim cương. Cần ${totalCost}, bạn có ${userData.diamonds}.` }) };
        }
        console.log(`[OK] User ${user.id} has sufficient balance. Cost: ${totalCost}, Balance: ${userData.diamonds}`);
        
        console.log("[STEP 4/10] Fetching available AI API key...");
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) {
            console.error("[FAIL] No active API keys available.", apiKeyError);
            return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        }
        console.log(`[OK] Fetched API key ID: ${apiKeyData.id}`);
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        let finalImageBase64: string;
        let finalImageMimeType: string;
        
        console.log("[STEP 5/10] Preparing AI payload...");
        const randomSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        
        console.log(`[STEP 6/10] Calling AI model: ${apiModel}...`);
        if (apiModel.startsWith('imagen')) {
            const response = await ai.models.generateImages({
                model: apiModel,
                prompt: prompt,
                config: { 
                    numberOfImages: 1, 
                    outputMimeType: 'image/png',
                    aspectRatio: aspectRatio,
                    seed: randomSeed,
                },
            });
            finalImageBase64 = response.generatedImages[0].image.imageBytes;
            finalImageMimeType = 'image/png';
        } else {
            const parts: any[] = [];
            const uniqueImages = new Set<string>(); // Use a Set to track unique base64 strings

            const addImagePart = (imageDataUrl: string | null) => {
                if (!imageDataUrl) return;
                const [header, base64] = imageDataUrl.split(',');
                if (!base64) {
                     console.warn("Skipping malformed image data URL.");
                     return;
                }
            
                // De-duplication logic
                if (uniqueImages.has(base64)) {
                    console.log("[INFO] Duplicate image detected. Skipping.");
                    return;
                }
                uniqueImages.add(base64);
            
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
                parts.push({ inlineData: { data: base64, mimeType } });
            };
            
            parts.push({ text: prompt });
            addImagePart(characterImage);
            addImagePart(styleImage);
            addImagePart(faceReferenceImage);
            
            console.log(`[INFO] Calling Gemini Vision with ${parts.length} parts. Text length: ${prompt.length}`);
            const response = await ai.models.generateContent({
                model: apiModel,
                contents: { parts: parts },
                config: { 
                    responseModalities: [Modality.IMAGE],
                    seed: randomSeed,
                },
            });

            console.log("[STEP 7/10] AI response received. Processing image part...");
            const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePartResponse?.inlineData) {
                console.error("[FAIL] AI response did not contain an image part. Response:", JSON.stringify(response, null, 2));
                throw new Error("AI không thể tạo hình ảnh từ mô tả này. Hãy thử thay đổi prompt hoặc ảnh tham chiếu.");
            }
            console.log("[OK] Image part found in AI response.");

            finalImageBase64 = imagePartResponse.inlineData.data;
            finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        }
        console.log("[OK] AI model call successful.");

        if (useUpscaler) {
            console.log(`[INFO] Upscaler requested for user ${user.id}. (DEMO)`);
        }

        console.log("[STEP 8/10] Uploading generated image to R2 storage...");
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
        console.log(`[OK] Image uploaded to R2: ${publicUrl}`);

        console.log("[STEP 9/10] Updating user data and transaction logs...");
        const newDiamondCount = userData.diamonds - totalCost;
        const newXp = userData.xp + XP_PER_GENERATION;
        
        const promptForDb = prompt.substring(0, DB_PROMPT_TRUNCATE_LENGTH);
        let logDescription = `Tạo ảnh: ${promptForDb.substring(0, 50)}...`;
        if (useUpscaler) logDescription += " (Nâng cấp)";
        
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount, xp: newXp }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }),
            supabaseAdmin.from('generated_images').insert({
                user_id: user.id,
                prompt: promptForDb,
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
        console.log(`[OK] Database updated for user ${user.id}. New balance: ${newDiamondCount} diamonds, ${newXp} XP.`);

        console.log("[STEP 10/10] Generation complete. Sending response to client.");
        return {
            statusCode: 200,
            body: JSON.stringify({ imageUrl: publicUrl, newDiamondCount, newXp }),
        };

    } catch (error: any) {
        console.error("--- [FATAL] /generate-image function error ---");
        console.error("Error object:", error); 
        
        let clientFriendlyError = 'Lỗi không xác định từ máy chủ.';
        if (error?.message) {
            if (error.message.includes('INVALID_ARGUMENT')) {
                 clientFriendlyError = 'Lỗi từ AI: Không thể xử lý dữ liệu hình ảnh đầu vào. Hãy thử lại hoặc thay đổi ảnh đầu vào.';
            } else {
                clientFriendlyError = error.message;
            }
        }
            
        return { statusCode: 500, body: JSON.stringify({ error: clientFriendlyError }) };
    }
};

export { handler };