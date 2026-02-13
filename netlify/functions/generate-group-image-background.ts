
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { addSmartWatermark } from './watermark-service'; 

const XP_PER_CHARACTER = 5;

// Helper: Fetch URL -> Base64 for Gemini
const fetchImageInput = async (url: string | null): Promise<{ data: string; mimeType: string } | null> => {
    if (!url) return null;
    
    // Check if it's still base64 (legacy fallback)
    if (url.startsWith('data:')) {
        const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
            return { mimeType: matches[1], data: matches[2] };
        }
        return null;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        return { data: base64, mimeType };
    } catch (e) {
        console.warn(`[WORKER] Failed to download asset from ${url}:`, e);
        return null;
    }
}

const updateJobProgress = async (jobId: string, currentPromptData: any, progressMessage: string) => {
    try {
        const newProgressData = { ...currentPromptData, progress: progressMessage };
        await supabaseAdmin.from('generated_images').update({ prompt: JSON.stringify(newProgressData) }).eq('id', jobId);
    } catch (e) {}
};

const failJob = async (jobId: string, reason: string, userId: string, cost: number) => {
    console.error(`[GROUP WORKER] Job ${jobId} FAILED: ${reason}`);
    try {
        const { data: userNow } = await supabaseAdmin.from('users').select('diamonds').eq('id', userId).single();
        if (userNow) {
            await Promise.all([
                supabaseAdmin.from('generated_images').update({ image_url: `FAILED: ${reason.substring(0, 200)}` }).eq('id', jobId),
                supabaseAdmin.from('users').update({ diamonds: userNow.diamonds + cost }).eq('id', userId),
                supabaseAdmin.from('diamond_transactions_log').insert({
                    user_id: userId,
                    amount: cost,
                    transaction_type: 'REFUND',
                    description: `Hoàn tiền lỗi Studio: ${reason.substring(0, 50)}`,
                })
            ]);
        }
    } catch (e) {
        console.error("Refund failed:", e);
    }
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 200 };

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) return { statusCode: 200 };

    let jobPromptData: any = {};
    let userId = "";
    let totalCost = 0;

    try {
        // 1. Fetch lightweight job data (URLs only)
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData || !jobData.prompt) throw new Error("Job not found.");

        try {
            jobPromptData = typeof jobData.prompt === 'string' ? JSON.parse(jobData.prompt) : jobData.prompt;
        } catch (e) {
            throw new Error("Invalid job data.");
        }

        const payload = jobPromptData.payload;
        userId = jobData.user_id;
        totalCost = payload.totalCost || 0;

        const { characters, referenceImage, prompt, style, aspectRatio, model: selectedModel, imageSize, useSearch, removeWatermark } = payload;
        const numCharacters = characters?.length || 0;

        // 2. Setup AI
        const { data: apiKeyData } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (!apiKeyData) throw new Error('Hết tài nguyên AI.');
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const modelName = selectedModel === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
        
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ];

        const generatedSprites = [];

        // 3. Download Master Canvas (Reference)
        await updateJobProgress(jobId, jobPromptData, 'Đang tải dữ liệu tham chiếu...');
        const masterLayoutData = await fetchImageInput(referenceImage);
        if (!masterLayoutData) throw new Error("Không thể tải ảnh tham chiếu.");

        // 4. Generate Characters (Sequential to avoid rate limits)
        for (const [i, char] of characters.entries()) {
            await updateJobProgress(jobId, jobPromptData, `Đang vẽ Nhân vật ${i + 1}/${numCharacters}...`);
            
            // Fetch inputs from R2 URLs
            const [poseData, faceData] = await Promise.all([
                fetchImageInput(char.poseImage),
                fetchImageInput(char.faceImage)
            ]);

            if (!poseData) throw new Error(`Không thể tải ảnh dáng của NV ${i+1}`);

            const genderPrompt = char.gender === 'male' ? 'MALE' : 'FEMALE';
            const charParts: any[] = [
                { inlineData: { data: poseData.data, mimeType: poseData.mimeType } },
                { text: "[CHARACTER_REF]" },
                { text: `GENERATE 3D SPRITE. GENDER: ${genderPrompt}. COPY OUTFIT & POSE. BACKGROUND: GREEN.` }
            ];

            if (faceData) {
                charParts.push({ text: "[FACE_ID]" });
                charParts.push({ inlineData: { data: faceData.data, mimeType: faceData.mimeType } });
            }

            const charResp = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image', // Always use Flash for components to save cost/time
                contents: { parts: charParts },
                config: { safetySettings }
            });

            const charImg = charResp.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!charImg) throw new Error(`Lỗi tạo hình NV ${i+1}`);

            generatedSprites.push({
                index: i,
                gender: char.gender,
                data: charImg.inlineData
            });
            
            // Tiny delay
            await new Promise(r => setTimeout(r, 500));
        }

        // 5. Final Composition
        await updateJobProgress(jobId, jobPromptData, 'Đang tổng hợp ảnh cuối cùng...');
        
        const finalParts: any[] = [
            { inlineData: { data: masterLayoutData.data, mimeType: masterLayoutData.mimeType } },
            { text: "[MASTER_LAYOUT] Preserve aspect ratio. Fill scene: " + prompt },
            { text: `STYLE: ${style}. 3D Render.` }
        ];

        generatedSprites.forEach((sprite, idx) => {
            finalParts.push({ text: `[SPRITE_${idx+1}]` });
            finalParts.push({ inlineData: sprite.data });
        });

        const finalConfig: any = { 
            responseModalities: [Modality.IMAGE],
            safetySettings,
            imageConfig: { 
                aspectRatio: aspectRatio, 
                imageSize: selectedModel === 'pro' ? imageSize : undefined
            }
        };
        if (selectedModel === 'pro' && useSearch) finalConfig.tools = [{ googleSearch: {} }];

        const finalResp = await ai.models.generateContent({
            model: modelName,
            contents: { parts: finalParts },
            config: finalConfig,
        });

        const finalImgPart = finalResp.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!finalImgPart) throw new Error("Lỗi tổng hợp ảnh cuối cùng.");

        // 6. Watermark & Upload Result
        let resultBuffer = Buffer.from(finalImgPart.inlineData.data, 'base64');
        if (!removeWatermark) {
            resultBuffer = await addSmartWatermark(resultBuffer, '');
        }

        const s3Client = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT!, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }});
        const finalFileName = `${userId}/group/${Date.now()}_result.png`;
        
        await (s3Client as any).send(new PutObjectCommand({ 
            Bucket: process.env.R2_BUCKET_NAME!, 
            Key: finalFileName, 
            Body: resultBuffer, 
            ContentType: 'image/png' 
        }));

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${finalFileName}`;
        const xpToAward = numCharacters * XP_PER_CHARACTER;

        await Promise.all([
             supabaseAdmin.from('generated_images').update({ image_url: publicUrl, prompt: prompt }).eq('id', jobId),
             supabaseAdmin.rpc('increment_user_xp', { user_id_param: userId, xp_amount: xpToAward }),
             supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);

        console.log(`[WORKER] Job ${jobId} COMPLETED.`);

    } catch (error: any) {
        if (userId) await failJob(jobId, error.message, userId, totalCost);
    }

    return { statusCode: 200 };
};

export { handler };
