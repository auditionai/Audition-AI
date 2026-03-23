import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { createTextureSheet, optimizePayload, createSolidFence } from "../utils/imageProcessor";
import { getSystemApiKey, reportKeyFailure, getApiKeyName } from "./economyService";

export interface CharacterData {
  id: number;
  gender: 'male' | 'female';
  image: string | null;
  faceImage?: string | null;
  shoesImage?: string | null;
  description?: string;
}

// --- HELPER: CLEAN BASE64 ---
const cleanBase64 = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, "");
const estimateBase64Bytes = (b64: string) => Math.floor((cleanBase64(b64).length * 3) / 4);
const TST_UPLOAD_MAX_WIDTH = 1280;


// --- HELPER: RETRY WITH BACKOFF ---
const retryWithBackoff = async <T>(
    operation: () => Promise<T>,
    retries: number = 10, // Tăng số lần thử lại lên 10 lần (Thô bạo nhất)
    delay: number = 5000, // Cố định chờ 5s mỗi lần
    label: string = "Operation",
    onLog?: (msg: string) => void,
    hasLoggedRetry: boolean = false
): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        // Check for 503 (Service Unavailable), 429 (Quota/Rate Limit), or 403 (Auth)
        const isTransient = 
            error?.status === 503 || 
            error?.status === 429 ||
            error?.status === 500 ||
            error?.status === 502 ||
            error?.status === 504 ||
            error?.message?.includes('503') || 
            error?.message?.includes('429') ||
            error?.message?.includes('500') ||
            error?.message?.includes('502') ||
            error?.message?.includes('504') ||
            error?.message?.includes('Overloaded') ||
            error?.message?.includes('quota') ||
            error?.message?.includes('fetch failed') ||
            error?.message?.includes('NetworkError') ||
            error?.message?.includes('Failed to fetch') ||
            error?.message?.includes('timed out') ||
            error?.message?.includes('Timeout');

        if (retries > 0 && isTransient) {
            const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
            const msg = isRateLimit 
                ? `${label} - Hệ thống đang xử lý ảnh, vui lòng chờ trong ít phút...`
                : `${label} - Server Google đang bận, tự động kết nối lại...`;
            
            console.warn(msg, error.message);
            if (onLog && !hasLoggedRetry) onLog(`🔄 ${msg}`);
            
            // Wait before retry
            // If it's a rate limit, we wait the full delay (e.g., 60s) to allow quota to reset
            const waitTime = isRateLimit ? Math.max(delay, 30000) : delay;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return retryWithBackoff(operation, retries - 1, delay, label, onLog, true);
        }
        throw error;
    }
};

// --- NEW: ANALYZE STYLE IMAGE (For Admin) ---
export const analyzeStyleImage = async (imageBase64: string): Promise<string> => {
    const model = 'gemini-3.1-pro-preview'; // Use 3.1 pro for analysis

    const result: any = await retryWithBackoff(
        async () => {
            const freshAi = await getAiClient('pro');
            try {
                return await freshAi.models.generateContent({
                    model: model,
                    contents: {
                        parts: [
                            { text: "Analyze this image's visual style for a 3D character generator. Describe the lighting, texture, rendering engine vibe (e.g. Octane, Unreal), and artistic mood. Keep it concise, comma-separated keywords." },
                            { inlineData: { mimeType: 'image/png', data: cleanBase64(imageBase64) } }
                        ]
                    }
                });
            } catch (e) {
                
                throw e;
            }
        },
        3,
        2000,
        "Style Analysis"
    );

    return result.text || "";
};

// --- NEW: SMART STYLE ROUTER ---
const selectBestStyle = async (prompt: string, styles: any[]): Promise<any | null> => {
    if (!styles || styles.length === 0) return null;
    if (styles.length === 1) return styles[0]; // Only one choice

    // Use latest Flash for fast routing
    const model = 'gemini-3-flash-preview'; 

    const styleList = styles.map(s => `- ID: ${s.id} | Name: ${s.name} | Keywords: ${s.trigger_prompt}`).join('\n');

    const routerPrompt = `
    User Prompt: "${prompt}"

    Available Styles:
    ${styleList}

    Task: Select the ONE best matching style ID for this prompt. 
    If the prompt asks for a specific vibe (e.g. "cute", "dark", "neon"), pick the closest match.
    If unsure, pick the one marked "Default" or the most generic one.
    
    Return ONLY the ID.
    `;

    try {
        // AGGRESSIVE FAIL-FAST: No retries, 5s timeout
        const freshAi = await getAiClient('flash');
        const result: any = await runWithTimeout(
            freshAi.models.generateContent({
                model: model,
                contents: { parts: [{ text: routerPrompt }] }
            }),
            5000, // 5s Timeout
            "Style Selection"
        );
        
        const selectedId = result.text?.trim() || '';
        const match = styles.find(s => s.id === selectedId || selectedId.includes(s.id));
        return match || styles[0]; // Fallback to first
    } catch (e) {
        console.warn("Style routing failed, using default", e);
        return styles[0];
    }
};

// --- INTELLIGENCE CORE ---
const runWithTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out (${ms/1000}s)`)), ms);
    });
    return Promise.race([
        promise.then(val => { clearTimeout(timer); return val; }),
        timeoutPromise
    ]);
};

// Cấu hình timeout cao hơn cho Client (mặc định fetch là ngắn)
const getAiClient = async (tier: 'flash' | 'pro' = 'flash', specificKey?: string) => {
    let apiKey: string | null | undefined = specificKey;
    if (!apiKey) {
        apiKey = await getSystemApiKey(tier);
    }
    if (!apiKey) {
        throw new Error("No API Key or Service Account available. Please add one in the Admin Panel.");
    }
    
    const isServiceAccount = apiKey.includes('project_id') && apiKey.includes('private_key');

    // 1. Nếu là API Key thường (AI Studio) -> Dùng SDK chính thức
    if (!isServiceAccount) {
        const ai = new GoogleGenAI({ apiKey });
        return {
            ...ai,
            _internalApiKey: apiKey,
            models: {
                ...ai.models,
                generateContent: async (params: any) => {
                    try {
                        return await ai.models.generateContent(params);
                    } catch (error: any) {
                        const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
                        const isAuthError = error?.status === 403 || error?.message?.includes('403') || error?.message?.includes('PERMISSION_DENIED');
                        if (isAuthError) {
                            reportKeyFailure(apiKey!);
                        }
                        throw error;
                    }
                }
            },
            files: ai.files
        } as any;
    }

    // 2. Nếu là Service Account JSON -> Dùng Vertex AI REST API
    return {
        _internalApiKey: apiKey,
        models: {
            generateContent: async (params: any) => {
                try {
                    // Xin Access Token từ Netlify Function
                    const tokenRes = await fetch('/api/get-vertex-token', { 
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ service_account_json: apiKey })
                    });
                    if (!tokenRes.ok) {
                        const err = await tokenRes.json().catch(() => ({}));
                        throw new Error(err.error || 'Failed to get Vertex Token from Server');
                    }
                    const { accessToken, projectId, location } = await tokenRes.json();

                    // Map model names for Vertex AI
                    let vertexModel = params.model;
                    let endpoint = 'generateContent';
                    let apiVersion = 'v1beta1'; // Default to v1beta1 for preview models
                    let isGlobalImageModel = false;
                    
                    // --- STANDARD PIPELINE ---
                    // Map models to stable versions for Vertex AI
                    if (vertexModel.includes('image')) {
                        if (vertexModel === 'gemini-2.5-flash-image') {
                            // Keep it as gemini-2.5-flash-image
                            apiVersion = 'v1beta1';
                        } else if (vertexModel.includes('flash')) {
                            vertexModel = 'gemini-3.1-flash-image-preview';
                            apiVersion = 'v1beta1'; // Gemini 3.1 Image uses v1beta1
                        } else if (vertexModel.includes('pro')) {
                            vertexModel = 'gemini-3-pro-image-preview';
                            apiVersion = 'v1beta1'; // Gemini 3 Pro Image uses v1beta1
                        }
                        isGlobalImageModel = true; // Both use global location
                    } else {
                        if (vertexModel.includes('flash')) {
                            // On Vertex AI, use 3 Flash
                            vertexModel = 'gemini-3-flash-preview';
                            apiVersion = 'v1beta1'; 
                        } else if (vertexModel.includes('pro')) {
                            // On Vertex AI, use 3.1 Pro
                            vertexModel = 'gemini-3.1-pro-preview';
                            apiVersion = 'v1beta1'; 
                        }
                    }

                    // QUAN TRỌNG: Dùng v1beta1 cho preview, v1 cho stable.
                    // Sử dụng location global cho tất cả các model theo yêu cầu
                    let url = `https://aiplatform.googleapis.com/${apiVersion}/projects/${projectId}/locations/global/publishers/google/models/${vertexModel}:${endpoint}`;
                    
                    // Chuyển đổi config sang generationConfig cho REST API
                    let payloadContents = params.contents;
                    if (typeof payloadContents === 'string') {
                        payloadContents = [{ role: 'user', parts: [{ text: payloadContents }] }];
                    } else if (payloadContents.parts) {
                        payloadContents = [payloadContents];
                    }
                    
                    payloadContents = payloadContents.map((c: any) => {
                        if (!c.role) {
                            c.role = 'user';
                        }
                        return c;
                    });

                    const payload: any = {
                        contents: payloadContents,
                    };
                    
                    if (params.config) {
                        payload.generationConfig = { ...params.config };
                        
                        // Move safetySettings to top level if present
                        if (payload.generationConfig.safetySettings) {
                            payload.safetySettings = payload.generationConfig.safetySettings;
                            delete payload.generationConfig.safetySettings;
                        }

                        delete payload.generationConfig.tools;
                        
                        // Map imageConfig sang generationConfig cho model ảnh (Vertex AI REST API)
                        if (params.config.imageConfig) {
                            payload.generationConfig.image_config = {
                                aspect_ratio: params.config.imageConfig.aspectRatio,
                                image_size: params.config.imageConfig.imageSize
                            };
                            delete payload.generationConfig.imageConfig;
                        }
                        
                        // Gemini 3.1 Image Preview requires response_modalities
                        if (isGlobalImageModel && vertexModel !== 'gemini-2.5-flash-image') {
                            payload.generationConfig.response_modalities = ["IMAGE"];
                        }
                    }
                    
                    if (params.config?.tools) {
                        payload.tools = params.config.tools;
                    }

                    // Also check top-level safetySettings in params
                    if (params.safetySettings) {
                        payload.safetySettings = params.safetySettings;
                    }

                    const res = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error?.message || `Vertex AI Error: ${res.status}`);
                    }

                    const data = await res.json();
                    
                    // Giả lập response của SDK
                    return {
                        text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
                        candidates: data.candidates
                    };
                } catch (error: any) {
                    const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
                    const isAuthError = error?.status === 403 || error?.message?.includes('403') || error?.message?.includes('PERMISSION_DENIED');
                    if (isAuthError) {
                        reportKeyFailure(apiKey!);
                    }
                    throw error;
                }
            }
        }
    } as any;
};

// --- ERROR HANDLER & EXTRACTOR ---
const extractImage = (response: any): string | null => {
    // 1. Kiểm tra cấu trúc cơ bản
    if (!response) {
        throw new Error("No response from server");
    }

    // 2. Kiểm tra Safety Block (Lỗi phổ biến nhất)
    if (response.promptFeedback?.blockReason) {
        console.warn("Blocked by Safety:", response.promptFeedback);
        throw new Error(`Safety Block: ${response.promptFeedback.blockReason}`);
    }

    // 3. Kiểm tra Candidates
    if (!response.candidates || response.candidates.length === 0) {
        console.warn("No candidates returned.");
        throw new Error("No candidates returned (Safety or Server Error)");
    }

    const candidate = response.candidates[0];

    // 4. Kiểm tra Finish Reason của Candidate
    if (candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
        // Nếu bị chặn ở mức candidate
        if (candidate.finishReason === "SAFETY") {
             throw new Error("Safety Block: Content Violation");
        }
        console.warn("Abnormal finish reason:", candidate.finishReason);
    }

    // 5. Trích xuất ảnh an toàn
    if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    }

    throw new Error("No image data found in response");
};

// --- NEW: TEST API KEY ---
export const testApiKey = async (tier: 'flash' | 'pro' = 'flash', attempt: number = 0): Promise<boolean> => {
    try {
        const freshAi = await getAiClient(tier);
        const testModel = tier === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';

        await runWithTimeout(
            freshAi.models.generateContent({
                model: testModel,
                contents: [{ role: 'user', parts: [{ text: "Hello" }] }]
            }),
            15000, // 15s Timeout
            "API Key Authentication"
        );
        return true;
    } catch (e: any) {
        console.warn(`API Key Test Failed (${tier})`, e);
        return false;
    }
};

const uploadToGemini = async (input: string, mimeType: string): Promise<string> => {
    try {
        const ai = await getAiClient('flash');
        let blob: Blob;

        // Check if input is a URL
        if (input.startsWith('http')) {
            const resp = await fetch(input);
            blob = await resp.blob();
        } else {
            // Assume Base64
            const byteCharacters = atob(cleanBase64(input));
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: mimeType });
        }

        // Add Timeout to Upload
        const uploadResult = await runWithTimeout(
            ai.files.upload({
                file: blob,
                config: { displayName: `ref_img_${Date.now()}` }
            }),
            30000, // Increased to 30s
            "File Upload"
        );

        const file = (uploadResult as any).file || uploadResult;
        const fileUri = file?.uri;
        
        if (!fileUri) throw new Error("No URI returned");

        // --- NEW: WAIT FOR ACTIVE STATE ---
        // Large files might be in 'PROCESSING' state. We must wait for 'ACTIVE'.
        let state = file.state;
        let attempts = 0;
        while (state === 'PROCESSING' && attempts < 10) {
            await new Promise(r => setTimeout(r, 2000)); // Wait 2s
            try {
                const fileStatus = await ai.files.get({ name: file.name });
                state = (fileStatus as any).state || (fileStatus as any).file?.state;
                console.log(`[System] File ${file.name} state: ${state}`);
            } catch (e) {
                console.warn("Check file state failed", e);
            }
            attempts++;
        }

        if (state === 'FAILED') throw new Error("File processing failed on Google side");
        
        return fileUri;
    } catch (e) {
        console.warn("Cloud upload failed", e);
        throw e;
    }
};

export const checkConnection = async (key?: string): Promise<{ success: boolean; message?: string }> => {
    try {
        const ai = await getAiClient('flash', key);
        // Sử dụng Flash cho checkConnection (Admin) để ping nhanh và ổn định nhất
        await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ text: "Ping" }] }
            }),
            15000,
            "Ping Connection"
        );
        return { success: true };
    } catch (e: any) {
        console.error("Gemini Connection Check Failed", e);
        let msg = e.message || "Unknown Error";
        
        // Parse Google Error
        if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
            msg = "Lỗi quyền truy cập (403). Vui lòng kiểm tra xem Google Generative AI API đã được bật trong Google Cloud Console chưa.";
        } else if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
            msg = "Key không hợp lệ hoặc sai định dạng.";
        } else if (msg.includes('429')) {
            msg = "Key đang bị giới hạn (Rate Limit).";
        }

        return { success: false, message: msg };
    }
};

export const generateImage = async (
    prompt: string,
    aspectRatio: string | undefined,
    refImageBase64: string | undefined,
    characters: any[],
    resolution: '1K' | '2K' | '4K' = '1K',
    modelType: 'flash' | 'pro' = 'pro',
    useSearch: boolean = false,
    useCloudRef: boolean = false,
    onLog: (msg: string) => void = () => {},
    styleReferenceUrl: string | null = null, // Manual override
    availableStyles: any[] = [], // New: Pool of styles for auto-selection
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string,
    timeoutMs: number = 900000 // Default 15 mins
): Promise<{ jobId: string, resultPromise: Promise<string> }> => {
    onLog(`Initializing Generation Pipeline...`);
    
    // 1. PROCESS SAMPLE IMAGE (Ảnh Mẫu)
    let cleanRefImage: string | null = null;
    
    if (refImageBase64) {
        onLog("Step 1: Preparing Sample Image...");
        try {
            if (refImageBase64.startsWith('http')) {
                const resp = await fetch(refImageBase64);
                const blob = await resp.blob();
                const reader = new FileReader();
                cleanRefImage = await new Promise((resolve) => {
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.readAsDataURL(blob);
                });
            } else if (refImageBase64.startsWith('data:') || refImageBase64.length > 100) {
                cleanRefImage = cleanBase64(refImageBase64);
            }
        } catch (e) {
            console.warn("Sample Image Processing Failed", e);
        }
    }

    // 2. PROCESS STYLE IMAGE (Ảnh Style)
    const cleanStyleImages: string[] = [];
    
    if (styleReferenceUrl) {
        onLog("Step 2: Preparing Style Image...");
        try {
            let styleData = styleReferenceUrl;
            if (styleReferenceUrl.startsWith('http')) {
                const resp = await fetch(styleReferenceUrl);
                const blob = await resp.blob();
                const reader = new FileReader();
                styleData = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            }
            const clean = cleanBase64(styleData);
            if (clean) {
                cleanStyleImages.push(clean);
            }
        } catch (e) {
            console.warn("Style Image Processing Failed", e);
        }
    }

    // 3. PROCESS CHARACTER IMAGES (Ảnh Nhân Vật)
    const charBase64List: string[] = [];
    
    if (characters.length > 0) {
        onLog("Step 3: Preparing Character Images...");
        for (const char of characters) {
            let finalCharBase64 = "";
            if (char.image) {
                const optimized = await optimizePayload(char.image, 2048);
                finalCharBase64 = cleanBase64(optimized);
            } else if (char.faceImage) {
                const optimized = await optimizePayload(char.faceImage, 2048);
                finalCharBase64 = cleanBase64(optimized);
            }
            
            if (finalCharBase64) {
                charBase64List.push(finalCharBase64);
            }
        }
    }

    // 4. SYNTHESIZE PROMPT WITH ALL IMAGES IN ONE PAYLOAD
    onLog("Step 4: Analyzing all images and synthesizing Final Prompt via Vertex AI...");
    
    const parts: any[] = [];
    let promptInstructions = `You are a master AI image generation director. Your task is to analyze the provided reference images step-by-step and synthesize a highly detailed prompt for an image generation model.
You must act as a strict investigator for each step.

`;

    if (charBase64List.length > 0) {
        promptInstructions += `Step 1: Analyze the Character Reference Image(s). Describe the character's facial features, hair, clothing, and gender in extreme detail. This is the SOURCE OF TRUTH for the character's identity.\n`;
        for (const charBase64 of charBase64List) {
            parts.push({ inlineData: { data: charBase64, mimeType: "image/jpeg" } });
        }
    }

    if (cleanRefImage) {
        promptInstructions += `Step 2: Analyze the Sample Image (Pose/Background). Describe the character's pose, the camera angle, the lighting, and the background environment. DO NOT copy the character's facial features or clothing from this image.\n`;
        parts.push({ inlineData: { data: cleanRefImage, mimeType: "image/jpeg" } });
    }

    if (cleanStyleImages.length > 0) {
        promptInstructions += `Step 3: Analyze the Style Reference Image. Describe the artistic style, color palette, medium (e.g., 3D render, anime, oil painting), and visual mood. DO NOT copy the character or subject from this image.\n`;
        parts.push({ inlineData: { data: cleanStyleImages[0], mimeType: "image/jpeg" } });
    }

    promptInstructions += `Step 4: Synthesize the Final Command Prompt.
Based on the user's base prompt: "${prompt}"
The final image generation AI WILL receive these exact images. Your task is to write a STRICT COMMAND PROMPT for that AI.
Your prompt must COMMAND the AI to:
1. EXACTLY COPY AND PASTE the character's face, hair, and clothing from the provided character reference images. DO NOT invent new features.
2. EXACTLY COPY the pose, camera angle, and background from the provided pose reference image.
3. EXACTLY COPY the artistic style, rendering quality, and lighting from the provided style reference image.

Do not just describe the image. Write it as a set of strict instructions and constraints for the rendering engine.
Output ONLY the final command prompt. Do not include the step-by-step analysis in your final output, just the prompt itself.`;

    parts.push({ text: promptInstructions });

    let optimizedPrompt = prompt;
    try {
        const freshAi = await getAiClient('pro');
        const response = await freshAi.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: { parts },
            config: {
                temperature: 0.4,
            }
        });
        if (response.text) {
            optimizedPrompt = response.text.trim();
            onLog(`> Final Command Prompt Synthesized: ${optimizedPrompt.substring(0, 100)}...`);
        }
    } catch (e) {
        console.error("Failed to synthesize prompt with all images", e);
        onLog("Failed to synthesize prompt, using base prompt.");
    }
    
    // 5. FINAL ASSEMBLY
    onLog("Step 5: Finalizing Data Payload for Image Generation...");
    
    if (refImageBase64 && !cleanRefImage) {
         throw new Error("CRITICAL FAILURE: Sample Image failed to process.");
    }
    if (characters.length > 0 && charBase64List.length === 0) {
        throw new Error("CRITICAL FAILURE: Character assets failed to process.");
    }

    const referenceImages: string[] = [];
    // The user explicitly wants ALL images sent to the final API so it can SEE them and COPY from them.
    if (charBase64List.length > 0) referenceImages.push(...charBase64List);
    if (cleanRefImage) referenceImages.push(cleanRefImage);
    if (cleanStyleImages.length > 0) referenceImages.push(cleanStyleImages[0]);

    const qualityBoosters = "masterpiece, best quality, ultra-detailed, 8k, stylized 3D game render, Korean MMO 3D style, stylized 3D skin texture, smooth 3D rendering, ray tracing, hdr, cinematic lighting, unreal engine 5 render";
    const negativePrompt = "low quality, bad anatomy, worst quality, blur, grain, watermark, text, signature, bad hands, bad face, mixed backgrounds, conflicting styles, extra characters, unwanted people from style reference, real people, photorealistic humans, photograph, realistic photography, real life, anime, cartoon, 2d, flat shading, floating character, disconnected limbs, hands in the air, feet not touching the ground, floating objects, unnatural posture, floating in mid-air, levitating, hovering, disconnected from background, bad perspective, illogical physics";
    
    const finalInstruction = `Generate an image based on the following prompt: "${optimizedPrompt}, ${qualityBoosters}".\n\nNegative Prompt: ${negativePrompt}`;

    onLog("Step 6: Sending payload to Trạm Sáng Tạo API...");

    const { jobId, resultPromise } = await runTramsangtaoGenerate(
        finalInstruction,
        modelType,
        referenceImages.length > 0 ? referenceImages : null,
        'image/jpeg',
        resolution,
        onLog,
        aspectRatio,
        speed,
        serverId,
        timeoutMs
    );

    return { jobId, resultPromise };
};

const uploadBase64ToTramsangtao = async (base64Data: string, mimeType: string, onLog: (msg: string) => void): Promise<string> => {
    onLog("Uploading image to CDN...");
    const normalizedMimeType = mimeType || 'image/jpeg';
    const normalizedDataUrl = base64Data.startsWith('data:')
        ? base64Data
        : `data:${normalizedMimeType};base64,${cleanBase64(base64Data)}`;

    let optimizedDataUrl = normalizedDataUrl;
    try {
        optimizedDataUrl = await optimizePayload(normalizedDataUrl, TST_UPLOAD_MAX_WIDTH);
    } catch (error) {
        console.warn("TST upload optimization failed, using original payload:", error);
    }

    const originalSize = estimateBase64Bytes(normalizedDataUrl);
    const optimizedSize = estimateBase64Bytes(optimizedDataUrl);
    onLog(`Optimized ref image: ${(originalSize / 1024 / 1024).toFixed(2)}MB -> ${(optimizedSize / 1024 / 1024).toFixed(2)}MB`);

    const base64Content = cleanBase64(optimizedDataUrl);
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: normalizedMimeType });

    const formData = new FormData();
    formData.append('file', blob, 'image.jpg');

    const uploadRes = await fetch('/api/tst-upload', {
        method: 'POST',
        body: formData
    });

    if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(`Failed to upload image: ${err.error || uploadRes.statusText}`);
    }

    const uploadData = await uploadRes.json();
    return uploadData.url;
};

const TST_POLL_INTERVAL_MS = 10000;
const TST_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

type TramsangtaoGeneratePayload = {
    prompt: string;
    model: string;
    img_url?: string[];
    resolution?: string;
    aspect_ratio?: string;
    speed?: string;
    server_id?: string;
};

const buildTramsangtaoPayload = (
    prompt: string,
    modelType: 'flash' | 'pro',
    imgUrls: string[],
    resolution?: string,
    aspectRatio?: string,
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string
): TramsangtaoGeneratePayload => {
    const payload: TramsangtaoGeneratePayload = {
        prompt,
        model: modelType === 'flash' ? 'nano-banana-2' : 'nano-banana-pro',
    };

    if (imgUrls.length > 0) {
        payload.img_url = imgUrls;
    }
    if (resolution) {
        payload.resolution = resolution.toLowerCase();
    }
    if (aspectRatio) {
        payload.aspect_ratio = aspectRatio;
    }
    if (speed) {
        payload.speed = speed;
    }
    if (serverId) {
        payload.server_id = serverId;
    }

    return payload;
};

export const prepareTramsangtaoGeneratePayload = async (
    prompt: string,
    modelType: 'flash' | 'pro' = 'flash',
    base64Data?: string | string[] | null,
    mimeType: string = 'image/jpeg',
    resolution?: string,
    onLog: (msg: string) => void = () => {},
    aspectRatio?: string,
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string,
): Promise<TramsangtaoGeneratePayload> => {
    let imgUrls: string[] = [];
    if (base64Data) {
        const dataArray = Array.isArray(base64Data) ? base64Data : [base64Data];
        for (let i = 0; i < dataArray.length; i++) {
            const url = await uploadBase64ToTramsangtao(dataArray[i], mimeType, onLog);
            imgUrls.push(url);
        }
    }
    return buildTramsangtaoPayload(prompt, modelType, imgUrls, resolution, aspectRatio, speed, serverId);
};

const parseTramsangtaoError = async (response: Response): Promise<string> => {
    try {
        const data = await response.json();
        return data?.error || data?.message || (typeof data === 'object' ? JSON.stringify(data) : String(data));
    } catch {
        return `Server returned ${response.status} ${response.statusText}`;
    }
};

const extractTramsangtaoJobId = (data: any): string | null => {
    const jobId = data?.job_id || data?.jobId || data?.id || data?.data?.job_id || data?.data?.jobId || data?.data?.id;
    return typeof jobId === 'string' && jobId.trim() ? jobId.trim() : null;
};

const extractTramsangtaoResultUrl = (data: any): string | null => {
    if (typeof data?.result === 'string' && data.result.trim()) {
        return data.result.trim();
    }

    if (Array.isArray(data?.result) && typeof data.result[0] === 'string' && data.result[0].trim()) {
        return data.result[0].trim();
    }

    if (typeof data?.output === 'string' && data.output.trim()) {
        return data.output.trim();
    }

    if (typeof data?.data?.result === 'string' && data.data.result.trim()) {
        return data.data.result.trim();
    }

    return null;
};

const submitTramsangtaoJob = async (
    payload: TramsangtaoGeneratePayload,
    onLog: (msg: string) => void
): Promise<string> => {
    onLog(`Calling Image API (Model: ${payload.model})...`);

    const genRes = await fetch('/api/tst-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!genRes.ok) {
        const errMessage = await parseTramsangtaoError(genRes);
        throw new Error(`Image API error: ${errMessage}`);
    }

    const genData = await genRes.json();
    const jobId = extractTramsangtaoJobId(genData);

    if (!jobId) {
        throw new Error(`Image API did not return a job_id: ${JSON.stringify(genData)}`);
    }

    onLog(`Job created (ID: ${jobId}).`);
    return jobId;
};

const pollTramsangtaoJob = async (
    jobId: string,
    onLog: (msg: string) => void,
    timeoutMs: number = TST_DEFAULT_TIMEOUT_MS
): Promise<string> => {
    const startedAt = Date.now();
    const timeoutMinutes = Math.ceil(timeoutMs / 60000);

    onLog(`Polling job every ${TST_POLL_INTERVAL_MS / 1000} seconds (timeout ${timeoutMinutes} minutes)...`);

    while (Date.now() - startedAt < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, TST_POLL_INTERVAL_MS));

        const pollRes = await fetch(`/api/tst-poll?jobId=${encodeURIComponent(jobId)}`);
        if (!pollRes.ok) {
            const errMessage = await parseTramsangtaoError(pollRes);
            onLog(`Polling retry: ${errMessage}`);
            continue;
        }

        const pollData = await pollRes.json();
        const status = typeof pollData?.status === 'string' ? pollData.status.toLowerCase() : 'unknown';
        onLog(`Job status: ${pollData?.status || 'unknown'} (${pollData?.progress || 0}%)...`);

        if (status === 'completed') {
            const resultUrl = extractTramsangtaoResultUrl(pollData);
            if (!resultUrl) {
                throw new Error(`Job completed but no result URL returned: ${JSON.stringify(pollData)}`);
            }

            onLog("Image processed successfully!");
            return resultUrl;
        }

        if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') {
            throw new Error(`Job failed: ${pollData?.error || pollData?.message || 'Unknown error'}`);
        }
    }

    throw new Error(`Generation failed: Timeout waiting for job to complete after ${Math.ceil(timeoutMs / 1000)} seconds`);
};

export const generateWithTramsangtao = async (
    prompt: string,
    modelType: 'flash' | 'pro' = 'flash',
    resolution?: string,
    aspectRatio?: string,
    base64Data?: string | string[] | null,
    mimeType: string = 'image/jpeg',
    onLog: (msg: string) => void = () => {},
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string
): Promise<string> => {
    const payload = await prepareTramsangtaoGeneratePayload(
        prompt,
        modelType,
        base64Data,
        mimeType,
        resolution,
        onLog,
        aspectRatio,
        speed,
        serverId
    );
    return submitTramsangtaoJob(payload, onLog);
};
export const runTramsangtaoGenerate = async (
    prompt: string,
    modelType: 'flash' | 'pro' = 'flash',
    base64Data?: string | string[] | null,
    mimeType: string = 'image/jpeg',
    resolution?: string,
    onLog: (msg: string) => void = () => {},
    aspectRatio?: string,
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string,
    timeoutMs: number = TST_DEFAULT_TIMEOUT_MS
): Promise<{ jobId: string, resultPromise: Promise<string> }> => {
    const payload = await prepareTramsangtaoGeneratePayload(
        prompt,
        modelType,
        base64Data,
        mimeType,
        resolution,
        onLog,
        aspectRatio,
        speed,
        serverId
    );
    const jobId = await submitTramsangtaoJob(payload, onLog);
    const resultPromise = pollTramsangtaoJob(jobId, onLog, timeoutMs);

    return { jobId, resultPromise };
};

export const prepareImageGenerationJob = async (
    prompt: string,
    aspectRatio: string | undefined,
    refImageBase64: string | undefined,
    characters: any[],
    resolution: '1K' | '2K' | '4K' = '1K',
    modelType: 'flash' | 'pro' = 'pro',
    useSearch: boolean = false,
    useCloudRef: boolean = false,
    onLog: (msg: string) => void = () => {},
    styleReferenceUrl: string | null = null,
    availableStyles: any[] = [],
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string,
): Promise<{ payload: TramsangtaoGeneratePayload; finalPrompt: string }> => {
    onLog(`Initializing Generation Pipeline...`);
    
    let cleanRefImage: string | null = null;
    if (refImageBase64) {
        onLog("Step 1: Preparing Sample Image...");
        try {
            if (refImageBase64.startsWith('http')) {
                const resp = await fetch(refImageBase64);
                const blob = await resp.blob();
                const reader = new FileReader();
                cleanRefImage = await new Promise((resolve) => {
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.readAsDataURL(blob);
                });
            } else if (refImageBase64.startsWith('data:') || refImageBase64.length > 100) {
                cleanRefImage = cleanBase64(refImageBase64);
            }
        } catch (e) {
            console.warn("Sample Image Processing Failed", e);
        }
    }

    const cleanStyleImages: string[] = [];
    if (styleReferenceUrl) {
        onLog("Step 2: Preparing Style Image...");
        try {
            let styleData = styleReferenceUrl;
            if (styleReferenceUrl.startsWith('http')) {
                const resp = await fetch(styleReferenceUrl);
                const blob = await resp.blob();
                const reader = new FileReader();
                styleData = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            }
            const clean = cleanBase64(styleData);
            if (clean) cleanStyleImages.push(clean);
        } catch (e) {
            console.warn("Style Image Processing Failed", e);
        }
    }

    const charBase64List: string[] = [];
    if (characters.length > 0) {
        onLog("Step 3: Preparing Character Images...");
        for (const char of characters) {
            let finalCharBase64 = "";
            if (char.image) {
                const optimized = await optimizePayload(char.image, 2048);
                finalCharBase64 = cleanBase64(optimized);
            } else if (char.faceImage) {
                const optimized = await optimizePayload(char.faceImage, 2048);
                finalCharBase64 = cleanBase64(optimized);
            }

            if (finalCharBase64) {
                charBase64List.push(finalCharBase64);
            }
        }
    }

    onLog("Step 4: Analyzing all images and synthesizing Final Prompt via Vertex AI...");

    const parts: any[] = [];
    let promptInstructions = `You are a master AI image generation director. Your task is to analyze the provided reference images step-by-step and synthesize a highly detailed prompt for an image generation model.
You must act as a strict investigator for each step.

`;

    if (charBase64List.length > 0) {
        promptInstructions += `Step 1: Analyze the Character Reference Image(s). Describe the character's facial features, hair, clothing, and gender in extreme detail. This is the SOURCE OF TRUTH for the character's identity.\n`;
        for (const charBase64 of charBase64List) {
            parts.push({ inlineData: { data: charBase64, mimeType: "image/jpeg" } });
        }
    }

    if (cleanRefImage) {
        promptInstructions += `Step 2: Analyze the Sample Image (Pose/Background). Describe the character's pose, the camera angle, the lighting, and the background environment. DO NOT copy the character's facial features or clothing from this image.\n`;
        parts.push({ inlineData: { data: cleanRefImage, mimeType: "image/jpeg" } });
    }

    if (cleanStyleImages.length > 0) {
        promptInstructions += `Step 3: Analyze the Style Reference Image. Describe the artistic style, color palette, medium (e.g., 3D render, anime, oil painting), and visual mood. DO NOT copy the character or subject from this image.\n`;
        parts.push({ inlineData: { data: cleanStyleImages[0], mimeType: "image/jpeg" } });
    }

    promptInstructions += `Step 4: Synthesize the Final Command Prompt.
Based on the user's base prompt: "${prompt}"
The final image generation AI WILL receive these exact images. Your task is to write a STRICT COMMAND PROMPT for that AI.
Your prompt must COMMAND the AI to:
1. EXACTLY COPY AND PASTE the character's face, hair, and clothing from the provided character reference images. DO NOT invent new features.
2. EXACTLY COPY the pose, camera angle, and background from the provided pose reference image.
3. EXACTLY COPY the artistic style, rendering quality, and lighting from the provided style reference image.

Do not just describe the image. Write it as a set of strict instructions and constraints for the rendering engine.
Output ONLY the final command prompt. Do not include the step-by-step analysis in your final output, just the prompt itself.`;

    parts.push({ text: promptInstructions });

    let optimizedPrompt = prompt;
    try {
        const freshAi = await getAiClient('pro');
        const response = await freshAi.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: { parts },
            config: {
                temperature: 0.4,
            }
        });
        if (response.text) {
            optimizedPrompt = response.text.trim();
            onLog(`> Final Command Prompt Synthesized: ${optimizedPrompt.substring(0, 100)}...`);
        }
    } catch (e) {
        console.error("Failed to synthesize prompt with all images", e);
        onLog("Failed to synthesize prompt, using base prompt.");
    }

    onLog("Step 5: Finalizing Data Payload for Image Generation...");

    if (refImageBase64 && !cleanRefImage) {
        throw new Error("CRITICAL FAILURE: Sample Image failed to process.");
    }
    if (characters.length > 0 && charBase64List.length === 0) {
        throw new Error("CRITICAL FAILURE: Character assets failed to process.");
    }

    const referenceImages: string[] = [];
    if (charBase64List.length > 0) referenceImages.push(...charBase64List);
    if (cleanRefImage) referenceImages.push(cleanRefImage);
    if (cleanStyleImages.length > 0) referenceImages.push(cleanStyleImages[0]);

    const qualityBoosters = "masterpiece, best quality, ultra-detailed, 8k, stylized 3D game render, Korean MMO 3D style, stylized 3D skin texture, smooth 3D rendering, ray tracing, hdr, cinematic lighting, unreal engine 5 render";
    const negativePrompt = "low quality, bad anatomy, worst quality, blur, grain, watermark, text, signature, bad hands, bad face, mixed backgrounds, conflicting styles, extra characters, unwanted people from style reference, real people, photorealistic humans, photograph, realistic photography, real life, anime, cartoon, 2d, flat shading, floating character, disconnected limbs, hands in the air, feet not touching the ground, floating objects, unnatural posture, floating in mid-air, levitating, hovering, disconnected from background, bad perspective, illogical physics";
    const finalInstruction = `Generate an image based on the following prompt: "${optimizedPrompt}, ${qualityBoosters}".\n\nNegative Prompt: ${negativePrompt}`;

    onLog("Step 6: Preparing payload for Trạm Sáng Tạo API...");
    const payload = await prepareTramsangtaoGeneratePayload(
        finalInstruction,
        modelType,
        referenceImages.length > 0 ? referenceImages : null,
        'image/jpeg',
        resolution,
        onLog,
        aspectRatio,
        speed,
        serverId
    );

    return { payload, finalPrompt: finalInstruction };
};

export const editImageWithInstructions = async (
    base64Data: string, 
    instruction: string, 
    mimeType: string,
    modelType: 'flash' | 'pro' = 'flash',
    aspectRatio?: string,
    onLog: (msg: string) => void = () => {},
    resolution: '1K' | '2K' | '4K' = '1K',
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string,
    allowTramsangtaoFallback: boolean = false
): Promise<{ jobId: string, resultPromise: Promise<string> }> => {
    const model = modelType === 'flash' ? 'gemini-3.1-flash-image-preview' : 'gemini-3-pro-image-preview';
    onLog(`Initializing ${model} Pipeline for Editing...`);
    
    // We will attempt Vertex AI first
    let vertexAiFailed = false;
    let vertexAiError: any = null;

    try {
        const cleanBase64Data = cleanBase64(base64Data);
        let lastVertexError: any = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                if (attempt > 1) {
                    onLog(`Retrying Vertex AI editing (attempt ${attempt}/2)...`);
                }

                const ai = await getAiClient(modelType);
                const response: any = await runWithTimeout(
                    ai.models.generateContent({
                        model: model,
                        contents: {
                            parts: [
                                {
                                    inlineData: {
                                        data: cleanBase64Data,
                                        mimeType: mimeType,
                                    },
                                },
                                {
                                    text: instruction,
                                },
                            ],
                        },
                    }),
                    45000,
                    "Vertex AI Editing"
                );

                let imageUrl = "";
                for (const part of response.candidates?.[0]?.content?.parts || []) {
                    if (part.inlineData) {
                        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
                        break;
                    }
                }

                if (imageUrl) {
                    onLog("Image edited successfully via Vertex AI!");
                    return { jobId: `gemini-edit-${Date.now()}`, resultPromise: Promise.resolve(imageUrl) };
                }

                throw new Error("No image data returned from Gemini API.");
            } catch (attemptError) {
                lastVertexError = attemptError;
            }
        }

        throw lastVertexError || new Error("Vertex AI editing failed.");
    } catch (error) {
        console.warn("Vertex AI Editing Failed or Timed Out, falling back to Trạm Sáng Tạo:", error);
        vertexAiFailed = true;
        vertexAiError = error;
    }

    if (vertexAiFailed && allowTramsangtaoFallback) {
        onLog("Vertex AI overloaded/timeout. Falling back to Trạm Sáng Tạo (Background Processing)...");
        // Fallback to Trạm Sáng Tạo
        return runTramsangtaoGenerate(
            instruction,
            modelType,
            [cleanBase64(base64Data)],
            mimeType,
            resolution,
            onLog,
            aspectRatio,
            speed,
            serverId
        );
    }

    const message = vertexAiError instanceof Error ? vertexAiError.message : 'Vertex AI image editing is currently unavailable.';
    onLog(`Vertex AI editing failed: ${message}`);
    return { jobId: `failed-${Date.now()}`, resultPromise: Promise.reject(new Error(message)) };
}

export const removeBackgroundImage = async (
    base64Data: string, 
    instruction: string, 
    mimeType: string,
    aspectRatio?: string,
    onLog: (msg: string) => void = () => {},
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string
): Promise<{ jobId: string, resultPromise: Promise<string> }> => {
    const prompt = `Remove the background of this image and make it solid transparent or black. Keep the main subject exactly the same. ${instruction}`;
    return editImageWithInstructions(base64Data, prompt, mimeType, 'flash', aspectRatio, onLog, '1K', speed, serverId);
}

export const upscaleImage = async (
    base64Data: string, 
    instruction: string, 
    mimeType: string,
    aspectRatio?: string,
    onLog: (msg: string) => void = () => {},
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string
): Promise<{ jobId: string, resultPromise: Promise<string> }> => {
    const prompt = `Upscale this image to 1K resolution. Enhance the details and make it sharper while keeping the original content exactly the same. ${instruction}`;
    return editImageWithInstructions(base64Data, prompt, mimeType, 'flash', aspectRatio, onLog, '1K', speed, serverId);
}

export const prepareImageEditJob = async (
    base64Data: string,
    instruction: string,
    mimeType: string,
    modelType: 'flash' | 'pro' = 'flash',
    aspectRatio?: string,
    onLog: (msg: string) => void = () => {},
    resolution: '1K' | '2K' | '4K' = '1K',
    speed: 'fast' | 'slow' = 'fast',
    serverId?: string
): Promise<TramsangtaoGeneratePayload> => {
    return prepareTramsangtaoGeneratePayload(
        instruction,
        modelType,
        [cleanBase64(base64Data)],
        mimeType,
        resolution,
        onLog,
        aspectRatio,
        speed,
        serverId
    );
};
