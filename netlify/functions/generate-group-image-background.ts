// IMPORTANT: This file is now correctly named with a "-background" suffix for Netlify to treat it as a background function.
// The client calls the endpoint WITHOUT the suffix: /.netlify/functions/generate-group-image

import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from 'jimp';

const XP_PER_CHARACTER = 5;

const failJob = async (jobId: string, reason: string) => {
    console.error(`[WORKER] Failing job ${jobId}: ${reason}`);
    await supabaseAdmin.from('generated_images').delete().eq('id', jobId);
};

// Helper to extract base64 and mimeType from data URL
const processDataUrl = (dataUrl: string | null) => {
    if (!dataUrl) return null;
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return { base64, mimeType };
};

const processImageForGemini = async (imageDataUrl: string | null, targetAspectRatio: string): Promise<string | null> => {
    if (!imageDataUrl) return null;

    try {
        const [header, base64] = imageDataUrl.split(',');
        if (!base64) return null;

        const imageBuffer = Buffer.from(base64, 'base64');
        const image = await (Jimp as any).read(imageBuffer);
        const originalWidth = image.getWidth();
        const originalHeight = image.getHeight();

        const [aspectW, aspectH] = targetAspectRatio.split(':').map(Number);
        const targetRatio = aspectW / aspectH;
        const originalRatio = originalWidth / originalHeight;

        let newCanvasWidth: number, newCanvasHeight: number;

        if (targetRatio > originalRatio) {
            newCanvasHeight = originalHeight;
            newCanvasWidth = Math.round(originalHeight * targetRatio);
        } else {
            newCanvasWidth = originalWidth;
            newCanvasHeight = Math.round(originalWidth / targetRatio);
        }
        
        const newCanvas = new (Jimp as any)(newCanvasWidth, newCanvasHeight, '#000000');
        const x = (newCanvasWidth - originalWidth) / 2;
        const y = (newCanvasHeight - originalHeight) / 2;
        newCanvas.composite(image, x, y);

        const mime = header.match(/:(.*?);/)?.[1] || (Jimp as any).MIME_PNG;
        return newCanvas.getBase64Async(mime as any);

    } catch (error) {
        console.error("Error pre-processing image for Gemini:", error);
        return imageDataUrl;
    }
};

const getPositionalDescription = (index: number, total: number): string => {
    const positions: { [key: number]: string[] } = {
        2: ["trên bên trái", "trên bên phải"],
        3: ["bên trái", "ở giữa", "bên phải"],
        4: ["ngoài cùng bên trái", "thứ hai từ trái sang", "thứ hai từ phải sang", "ngoài cùng bên phải"],
        5: ["ngoài cùng bên trái", "thứ hai từ trái sang", "ở giữa", "thứ hai từ phải sang", "ngoài cùng bên phải"],
        6: ["thứ nhất từ trái sang", "thứ hai từ trái sang", "thứ ba từ trái sang", "thứ ba từ phải sang", "thứ hai từ phải sang", "thứ nhất từ phải sang"]
    };
    return (positions[total] && positions[total][index]) || `thứ ${index + 1}`;
};


// This is now the "worker" function.
const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 }; 

    const { jobId } = JSON.parse(event.body || '{}');
    if (!jobId) { 
        console.error("[WORKER] Job ID is missing."); 
        // Background functions should return a 200 to prevent retries
        return { statusCode: 200, body: JSON.stringify({ error: "Job ID is missing." }) }; 
    }

    try {
        const { data: jobData, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('prompt, user_id')
            .eq('id', jobId)
            .single();

        if (fetchError || !jobData || !jobData.prompt) {
            throw new Error(fetchError?.message || 'Job not found or payload is missing.');
        }

        const payload = JSON.parse(jobData.prompt);
        const { characters, referenceImage, prompt, style, aspectRatio } = payload;
        const userId = jobData.user_id;
        const numCharacters = characters.length;

        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) {
            throw new Error('Hết tài nguyên AI. Vui lòng thử lại sau.');
        }

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const model = 'gemini-2.5-flash-image';
        
        console.log(`[WORKER ${jobId}] Pre-processing images for ${aspectRatio} aspect ratio...`);
        const [
            processedReferenceImage,
            ...processedCharacterImages
        ] = await Promise.all([
            processImageForGemini(referenceImage, aspectRatio),
            ...characters.flatMap((char: any) => [
                processImageForGemini(char.poseImage, aspectRatio),
                processImageForGemini(char.faceImage, aspectRatio)
            ])
        ]);

        const processedCharacters = characters.map((char: any, index: number) => ({
            ...char,
            poseImage: processedCharacterImages[index * 2],
            faceImage: processedCharacterImages[index * 2 + 1]
        }));
        
        console.log(`[WORKER ${jobId}] Constructing the Super Prompt...`);

        const maleCount = characters.filter((c: any) => c.gender === 'male').length;
        const femaleCount = characters.filter((c: any) => c.gender === 'female').length;

        const promptParts: string[] = [
            `**Nhiệm vụ Tối quan trọng: Tái tạo Ảnh Nhóm Hoàn hảo**`,
            `**Mục tiêu chính:** Nhiệm vụ của bạn là tái tạo một cách hoàn hảo **Ảnh Mẫu Tham Chiếu (Ảnh 1)** được cung cấp, nhưng thay thế các nhân vật gốc bằng một dàn nhân vật mới. Bạn phải tuân thủ mọi quy tắc dưới đây một cách tuyệt đối.`,
            ``,
            `**--- CHỈ THỊ TOÀN CỤC (Áp dụng cho toàn bộ ảnh) ---**`,
            `1.  **BẢN VẼ TỔNG THỂ:** **Ảnh Mẫu Tham Chiếu (Ảnh 1)** là bản thiết kế cuối cùng của bạn. Ảnh kết quả phải sao chép **giống hệt 100%** về **bối cảnh, môi trường, ánh sáng, bóng đổ, góc máy, và không khí chung** của Ảnh 1.`,
            `2.  **SỐ LƯỢNG NHÂN VẬT:** Ảnh kết quả phải có **chính xác ${numCharacters} người**. Không hơn, không kém. Nhóm này bao gồm ${maleCount} nam và ${femaleCount} nữ.`,
            `3.  **PHONG CÁCH NGHỆ THUẬT:** Toàn bộ ảnh phải có phong cách nghệ thuật đồng nhất là '${style}'.`,
            `4.  **MÔ TẢ NGƯỜI DÙNG (Thứ yếu):** Nếu có thể, hãy lồng ghép chủ đề này vào ảnh: "${prompt || 'Bám sát ảnh mẫu tham chiếu.'}" Tuy nhiên, không được để yêu cầu này ghi đè lên bất kỳ quy tắc nào khác.`,
            ``,
            `**--- QUY TRÌNH THAY THẾ NHÂN VẬT (Bắt buộc thực hiện từng bước) ---**`,
            `Bây giờ, bạn sẽ thay thế từng người trong Ảnh Mẫu Tham Chiếu (Ảnh 1) bằng một nhân vật mới được chỉ định. Việc ánh xạ này là rõ ràng và bắt buộc.`,
        ];

        const finalApiParts: any[] = [];
        let imageInputIndex = 1;

        const refImageProcessed = processDataUrl(processedReferenceImage);
        if (!refImageProcessed) throw new Error('Ảnh Mẫu Tham Chiếu không hợp lệ.');
        finalApiParts.push({ inlineData: { data: refImageProcessed.base64, mimeType: refImageProcessed.mimeType } });
        
        for (let i = 0; i < processedCharacters.length; i++) {
            const char = processedCharacters[i];
            const charDescription: string[] = [
                ``,
                `**MỤC TIÊU THAY THẾ ${i + 1}:**`,
                `*   **XÁC ĐỊNH:** Người đang đứng ở vị trí **${getPositionalDescription(i, numCharacters)}** trong Ảnh Mẫu Tham Chiếu (Ảnh 1).`,
                `*   **THAY THẾ BẰNG:** Nhân vật ${i + 1} (Giới tính: ${char.gender === 'male' ? 'Nam' : 'Nữ'}).`,
            ];

            const poseImageProcessed = processDataUrl(char.poseImage);
            const faceImageProcessed = processDataUrl(char.faceImage);

            if (poseImageProcessed) {
                imageInputIndex++;
                finalApiParts.push({ inlineData: { data: poseImageProcessed.base64, mimeType: poseImageProcessed.mimeType } });
                charDescription.push(`*   **DIỆN MẠO (Trang phục/Cơ thể):** Sử dụng **Ảnh ${imageInputIndex}**. (QUY TẮC TUYỆT ĐỐI: Trang phục, kiểu tóc và hình dáng cơ thể phải là một bản sao hoàn hảo, không thay đổi từ ảnh này.)`);
            }
            if (faceImageProcessed) {
                imageInputIndex++;
                finalApiParts.push({ inlineData: { data: faceImageProcessed.base64, mimeType: faceImageProcessed.mimeType } });
                charDescription.push(`*   **GƯƠNG MẶT:** Sử dụng **Ảnh ${imageInputIndex}**. (QUY TẮC TUYỆT ĐỐI: Gương mặt phải được cấy ghép một cách hoàn hảo, không thay đổi từ ảnh này. Giữ nguyên mọi đường nét, biểu cảm và chi tiết. Đây là quy tắc quan trọng nhất.)`);
            }
            
            charDescription.push(`*   **HÀNH ĐỘNG BẮT BUỘC:** Nhân vật ${i + 1} được tạo ra phải sao chép **giống hệt tư thế, hướng cơ thể và vị trí** của người mà họ đang thay thế trong Ảnh Mẫu Tham Chiếu.`);
            
            promptParts.push(charDescription.join('\n'));
        }

        promptParts.push(
            ``,
            `**--- KIỂM TRA CHẤT LƯỢNG CUỐI CÙNG (Tự sửa lỗi) ---**`,
            `Trước khi hoàn thành, hãy tự trả lời những câu hỏi này. Nếu bất kỳ câu trả lời nào là "KHÔNG", bạn phải hủy bỏ và làm lại từ đầu.`,
            `1.  Bạn đã sao chép bối cảnh và ánh sáng từ Ảnh 1 một cách hoàn hảo chưa? (CÓ/KHÔNG)`,
            `2.  Có chính xác ${numCharacters} người trong ảnh không? (CÓ/KHÔNG)`,
            `3.  Trang phục và gương mặt của mỗi người có khớp hoàn toàn với ảnh nguồn được chỉ định của họ không? (CÓ/KHÔNG)`,
            `4.  Mỗi nhân vật mới có khớp hoàn hảo với tư thế và vị trí của một người trong ảnh mẫu không? (CÓ/KHÔNG)`,
            `**CHỈ KẾT QUẢ HOÀN HẢO MỚI ĐƯỢC CHẤP NHẬN.**`
        );
        
        const superPrompt = promptParts.join('\n');
        
        finalApiParts.unshift({ text: superPrompt });

        console.log(`[WORKER ${jobId}] Super Prompt constructed. Making API call...`);
        
        const finalResponse = await ai.models.generateContent({
            model,
            contents: { parts: finalApiParts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const finalImagePart = finalResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!finalImagePart?.inlineData) throw new Error("AI không thể tạo ảnh nhóm với các chỉ dẫn được cung cấp.");
        
        console.log(`[WORKER ${jobId}] Image generated successfully.`);

        console.log(`[WORKER ${jobId}] Finalizing...`);

        const finalImageBase64 = finalImagePart.inlineData.data;
        const finalImageMimeType = finalImagePart.inlineData.mimeType;

        const s3Client = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT!, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }});
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${userId}/group/${Date.now()}.${finalImageMimeType.split('/')[1] || 'png'}`;
        
        await (s3Client as any).send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: fileName, Body: imageBuffer, ContentType: finalImageMimeType }));
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
        
        const xpToAward = (characters.length || 0) * XP_PER_CHARACTER;

        const [updateJobResult, incrementXpResult] = await Promise.all([
             supabaseAdmin.from('generated_images').update({ image_url: publicUrl, prompt: prompt }).eq('id', jobId), // Update prompt to be clean
             supabaseAdmin.rpc('increment_user_xp', { user_id_param: userId, xp_amount: xpToAward })
        ]);

        if (updateJobResult.error) throw new Error(`Failed to update job status: ${updateJobResult.error.message}`);
        if (incrementXpResult.error) console.error(`[WORKER] Failed to award XP for job ${jobId}:`, incrementXpResult.error.message);

        await supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id });
        
        console.log(`[WORKER ${jobId}] Job finalized successfully.`);
        return { statusCode: 200 };

    } catch (error: any) {
        await failJob(jobId, error.message || 'Lỗi không xác định từ máy chủ.');
        return { statusCode: 200 };
    }
};

export { handler };
