import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { createTextureSheet, optimizePayload, createSolidFence, createMasterReferenceSheet } from "../utils/imageProcessor";
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
                        if (vertexModel.includes('flash')) {
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
                        if (isGlobalImageModel) {
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

// --- NEW: ANALYZE REFERENCE IMAGE (POSE/BG) ---
const analyzeReferenceImage = async (base64Data: string): Promise<string> => {
    const model = 'gemini-3-flash-preview'; 

    try {
        // Optimize image before sending to reduce payload size and prevent 503
        const optimizedImage = await optimizePayload(`data:image/jpeg;base64,${cleanBase64(base64Data)}`, 768);
        const cleanOptimized = cleanBase64(optimizedImage);

        // AGGRESSIVE FAIL-FAST: No retries, short timeout (15s)
        // If analysis fails, we proceed without it rather than blocking generation.
        const freshAi = await getAiClient('flash');
        try {
            const result: any = await runWithTimeout(
                freshAi.models.generateContent({
                    model: model,
                    contents: {
                        parts: [
                            { inlineData: { mimeType: 'image/jpeg', data: cleanOptimized } },
                            { text: "Analyze this image. Describe the 'Framing' (e.g., close-up, portrait, half-body, full-body), 'Camera Angle', 'Skeleton Pose', 'Body Language', 'Facial Expression/Vibe', 'Background Vibe/Elements', and 'Character-Environment Interaction'. IGNORE the character's specific identity, clothes, hair. Output a detailed structural and atmospheric description to be used as a prompt for a new 3D render. Be extremely precise about the framing, pose, and expression." }
                        ]
                    },
                    config: {
                    }
                }),
                30000, // 30s timeout
                "Ref Analysis"
            );
            return result.text || "";
        } catch (e) {
            console.warn("Ref Analysis Skipped (Fail-Fast)", e);
            return ""; // Soft fail
        }
    } catch (e) {
        console.warn("Ref Analysis Setup Failed", e);
        return "";
    }
};

// --- PROMPT REASONING ENGINE (STEEL DISCIPLINE) ---
const optimizePromptWithThinking = async (
    rawPrompt: string, 
    styleContext: string = "", 
    poseContext: string = "",
    masterSheetPart: any | null = null
): Promise<string> => {
    // Use Gemini 3.1 Pro for the "Brain" of the operation.
    const model = 'gemini-3.1-pro-preview'; 

    try {
        // Use Pro client for reasoning (it's text-only so it's cheap/fast enough)
        const freshAi = await getAiClient('pro');
        
        const parts: any[] = [];
        
        if (masterSheetPart) {
            parts.push(masterSheetPart);
            parts.push({ text: "🔴 REFERENCE SHEET PROVIDED: The image above contains the characters for this scene. Analyze their appearance (Face, Hair, Outfit) and describe them in the final prompt. CRITICAL: DO NOT describe the background of this reference sheet (e.g., do NOT say 'standing on a grey background'). Only extract the character's visual features." });
        }

        parts.push({
            text: `ROLE: ELITE PROMPT ENGINEER (MIDJOURNEY V6 LEVEL).
MISSION: Convert user inputs into a MASTERPIECE image generation prompt.

INPUTS:
1. COMMAND: "${rawPrompt}"
2. STYLE: "${styleContext}"
3. POSE: "${poseContext}"
${masterSheetPart ? '4. CHARACTERS: See Reference Sheet above.' : ''}

RULES:
- You are the "Brain" of the operation. The image generator needs explicit, high-fidelity instructions.
- Combine all inputs into a single, rich, descriptive paragraph.
- Focus on: Lighting (Volumetric, Cinematic), Texture (8k, Unreal Engine 5), Camera (Depth of Field, Bokeh), and Character Details.
- IF CHARACTERS ARE PROVIDED: You MUST describe their visual features (hair color, outfit style, accessories) in the prompt so the image generator knows what to draw.
- IMPORTANT: Always refer to the subjects as "3D avatars", "stylized game characters", or "virtual models". NEVER use terms that imply real people.
- ART STYLE (CRITICAL): The final image MUST be a stylized 3D game render (like a Korean MMO). It MUST NOT look like a real person or a photograph. The pose reference might be a real person, but you MUST TRANSLATE that pose into a 3D game character style. DO NOT copy the realism of the pose reference. The output MUST look like a 3D video game graphic.
- ENHANCE the prompt with "Quality Boosters": masterpiece, best quality, ultra-detailed, stylized 3D render, 8k, ray tracing, hdr.
- FRAMING, POSE & EXPRESSION (CRITICAL): Describe the framing (e.g., close-up, portrait, half-body, full-body), pose, and the EXACT facial expression (gaze, mood, attitude, "soul") exactly as provided in the POSE input. The framing MUST match the reference. If the reference is a close-up or half-body, you MUST explicitly state "close-up" or "half-body" in the prompt. You MUST capture the exact attitude and vibe of the character in the pose reference (e.g., confident, mysterious, aggressive, soft). CRITICAL: Ensure the character's core facial identity remains intact while adopting this deep expression and attitude.
- BACKGROUND: The background MUST be based on the user's COMMAND. If the user COMMAND specifies a background (e.g., "in a city", "in a forest"), you MUST use that. If a POSE image is provided, you can use its vibe, but the user's COMMAND takes priority. DO NOT describe a plain or grey background unless the user explicitly asked for it.
- INTERACTION (CRITICAL): You MUST describe how the character interacts with this new background. Ensure their hands, feet, and body are grounded and touching logical surfaces (e.g., leaning on a railing, sitting on a step, holding a prop). Do not let the character float in the air.
- Output ONLY the final prompt. No explanations.`
        });

        const result: any = await runWithTimeout(
            freshAi.models.generateContent({
                model: model,
                contents: { parts: parts },
                config: {
                    temperature: 0.7
                }
            }),
            60000, // 60s Hard Timeout
            "Prompt Optimization"
        );

        const text = result.text?.trim();
        if (!text) throw new Error("Empty response");
        return text;

    } catch (e) {
        console.warn("Prompt Optimization Skipped (Fail-Fast)", e);
        // Fallback: Simple concatenation
        return `${rawPrompt}${styleContext ? ', ' + styleContext : ''}${poseContext ? ', ' + poseContext : ''}, masterpiece, best quality, 8k, ultra detailed`;
    }
}

// --- INTELLIGENCE CORE (ABSOLUTE COMMAND) ---
const processDigitalTwinMode = (
    prompt: string, 
    masterSheetPart: any | null
): { parts: any[] } => {
    
    let combinedText = `** SYSTEM OVERRIDE: PROTOCOL 3D-GEN-ALPHA **
    
YOU ARE A NON-CREATIVE RENDERING ENGINE. YOU DO NOT "IMAGINE". YOU "EXECUTE".

** SEPARATION OF CONCERNS (STRICT COMPARTMENTALIZATION) **
The attached image is a MASTER REFERENCE SHEET containing multiple labeled sections.

1. **STYLE REFERENCE**: 
   - TAKE: Lighting, Texture, Render Quality, Art Style.
   - IGNORE: The subject, their clothes, their face, their makeup.

2. **POSE REFERENCE**:
   - TAKE: Bone structure, Camera Angle, Composition.
   - IGNORE: The outfit, the hair, the face, the background colors.

3. **CHARACTER REFERENCE(S)**:
   - WARNING: This is the SOURCE OF TRUTH for the Character's visual design (Hairstyle, Outfit). You should use the facial features and outfit details from these images as strong references.
   - TAKE: The Character's visual design (Face), The Outfit (Clothes), The Hair, The Accessories.
   - THIS IS THE PRIMARY SOURCE FOR "WHAT" IS IN THE IMAGE.

** CRITICAL FAILURE CONDITIONS **
- FAILURE: If the output character wears the clothes from the POSE REFERENCE.
- FAILURE: If the output character has the eye color/makeup of the STYLE REFERENCE.
- FAILURE: If the output is a painting/drawing when Style Ref is 3D.
- FAILURE: If the user prompt says "use clothes from reference" and you use clothes from STYLE or POSE. You MUST use clothes from CHARACTER REFERENCE.

** EXECUTION LOGIC **
- Step 1: Extract the SKELETON from POSE REFERENCE.
- Step 2: Skin the skeleton with the CHARACTER from CHARACTER REFERENCE.
- Step 3: Dress the character as seen in CHARACTER REFERENCE unless [COMMAND] explicitly specifies a different outfit.
- Step 4: Render the scene using the ENGINE from STYLE REFERENCE.

[[EXECUTION_COMMAND]]: ${prompt}

ACKNOWLEDGE AND EXECUTE.`;

    const parts = [];
    if (masterSheetPart) {
        parts.push(masterSheetPart);
    }
    parts.push({ text: combinedText });

    return { parts };
};

export const generateImage = async (
    prompt: string,
    aspectRatio: string,
    refImageBase64: string | undefined,
    characters: any[],
    resolution: '1K' | '2K' | '4K' = '1K',
    modelType: 'flash' | 'pro' = 'pro',
    useSearch: boolean = false,
    useCloudRef: boolean = false,
    onLog: (msg: string) => void = () => {},
    styleReferenceUrl: string | null = null, // Manual override
    availableStyles: any[] = [], // New: Pool of styles for auto-selection
    timeoutMs: number = 900000 // Default 15 mins
): Promise<string> => {
    // Use Gemini 3.1 Flash Image Preview for FLASH Tier
    // Use Gemini 3 Pro Image Preview for PRO Tier
    const model = modelType === 'flash' ? 'gemini-3.1-flash-image-preview' : 'gemini-3-pro-image-preview'; 
    onLog(`Initializing ${model} Pipeline...`);
    
    // 1. PROCESS REFERENCE IMAGE (VISUAL & TEXTUAL ANALYSIS)
    let cleanRefImage: string | null = null;
    let poseDescription = "";
    
    if (refImageBase64) {
        onLog("Step 1: Analyzing Reference Image (Pose & BG)...");
        
        try {
            // Handle URL Input
            if (refImageBase64.startsWith('http')) {
                // For Analysis (needs Base64)
                const resp = await fetch(refImageBase64);
                const blob = await resp.blob();
                const reader = new FileReader();
                cleanRefImage = await new Promise((resolve) => {
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.readAsDataURL(blob);
                });
            } 
            // Handle Base64 Input
            else if (refImageBase64.startsWith('data:') || refImageBase64.length > 100) {
                cleanRefImage = cleanBase64(refImageBase64);
            }

            if (cleanRefImage) {
                poseDescription = await analyzeReferenceImage(cleanRefImage);
                onLog(`> Pose Detected: ${poseDescription.substring(0, 50)}...`);
            }
        } catch (e) {
            console.warn("Ref Image Processing Failed", e);
        }
    }

    // 2 & 3. LOAD STYLE IMAGES (VISUAL)
    let styleKeywords = "";
    const cleanStyleImages: string[] = [];
    
    // We only load the ACTIVE style image for the image generator.
    // Loading ALL style images (e.g., 4-5 images) confuses the image generation model (gemini-3.1-flash-image-preview) 
    // and causes it to completely ignore the character and pose references.
    if (styleReferenceUrl) {
        onLog("Step 2: Loading Active Style Reference Image...");
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
            console.warn("Failed to load active style reference", e);
        }
    }
    
    // We still extract keywords from the ACTIVE style to feed the text prompt
    if (availableStyles && availableStyles.length > 0 && styleReferenceUrl) {
        const activeStyle = availableStyles.find(s => s.image_url === styleReferenceUrl);
        if (activeStyle && activeStyle.trigger_prompt) {
            styleKeywords = activeStyle.trigger_prompt;
        }
    }

    // 4. PREPARE CHARACTERS
    const charBase64List: string[] = [];
    
    for (const char of characters) {
        let finalCharBase64 = "";
        
        // Use ONLY the main image (which is the full body image).
        // The AI will extract both the body and the face from this single image.
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

    // 5. CREATE MASTER REFERENCE SHEET (RESTORED)
    // We restore this to ensure the "Brain" (Text Model) can see the characters and describe them accurately.
    let masterSheetPart = null;
    if (charBase64List.length > 0) {
        try {
            onLog("Step 3.5: Assembling Character Master Sheet...");
            // Correctly pass ONLY characters to the Master Sheet generator
            // DO NOT pass style or pose, otherwise the text model will describe their characters and inject them into the prompt!
            const masterSheetBase64 = await createMasterReferenceSheet(
                null, 
                null, 
                charBase64List
            );
            
            if (masterSheetBase64) {
                masterSheetPart = {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: cleanBase64(masterSheetBase64)
                    }
                };
            }
        } catch (e) {
            console.warn("Master Sheet creation failed", e);
        }
    }
    
    // 6. PROMPT OPTIMIZATION (MERGING ALL CONTEXTS)
    onLog("Step 4: Generating Perfect Image Prompt...");
    // Pass masterSheetPart to the brain so it can describe the characters
    const optimizedPrompt = await optimizePromptWithThinking(prompt, styleKeywords, poseDescription, masterSheetPart);
    
    // 7. FINAL ASSEMBLY
    onLog("Step 5: Finalizing Data Payload (Integrity Check)...");
    
    // --- BRUTAL DATA VERIFICATION (THE IRONCLAD PROTOCOL) ---
    // 1. Verify Reference Image (CRITICAL)
    if (refImageBase64 && !cleanRefImage) {
         throw new Error("CRITICAL FAILURE: Reference Image (Pose) failed to process. The pipeline cannot proceed without the Source of Truth.");
    }

    // 2. Verify Characters (CRITICAL)
    if (characters.length > 0) {
        if (charBase64List.length === 0) {
            throw new Error("CRITICAL FAILURE: Character assets failed to process. Aborting to prevent ghost generation.");
        }
        if (charBase64List.length < characters.length) {
            onLog(`⚠️ WARNING: Partial Data. Only ${charBase64List.length}/${characters.length} characters were successfully processed.`);
        }
    }

    // 3. Verify Style (OPTIONAL but logged)
    if (cleanStyleImages.length === 0) {
         onLog("⚠️ WARNING: No Style Images loaded. Proceeding without Style Reference.");
    }

    const finalParts: any[] = [];
    
    // PRIORITY 1: CHARACTER REFERENCES (Moved to TOP for Attention Priority)
    let charPromptInstructions = "";
    if (charBase64List.length > 0) {
        finalParts.push({ text: "🔴 PRIORITY 1: 3D AVATAR DESIGN (CRITICAL)\nINSTRUCTION: You MUST extract the exact visual identity, facial features (bone structure, eye shape, nose, mouth), hairstyle, and apparel from the following stylized game assets. CRITICAL: The character's facial identity MUST remain 100% identical to these references. Do not deform the face into a generic AI face. DO NOT copy the background or pose from these images. These are fictional 3D models." });
        
        // Iterate through ALL uploaded character URIs
        charBase64List.forEach((b64, index) => {
            const charIndex = index + 1;
            const charInfo = characters[index]; // Get metadata (gender, id)
            
            // 1. The Character Image (Body + Face)
            finalParts.push({ text: `🔴 ASSET ${charIndex} REFERENCE\nINSTRUCTION: Scan this image to extract BOTH the full body apparel AND the facial features for AVATAR ${charIndex}.` });
            finalParts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: b64
                }
            });
            
            // Build specific mapping instruction
            charPromptInstructions += `\n- AVATAR ${charIndex} (${charInfo.gender.toUpperCase()}): Stylized 3D game asset matching the exact facial features, face shape, hair, and apparel of ASSET ${index + 1}.`;
        });
    }

    // PRIORITY 2: POSE/STRUCTURE REFERENCE
    if (cleanRefImage) {
        finalParts.push({ text: "🔴 PRIORITY 2: FRAMING, POSE & BACKGROUND (SOURCE OF TRUTH)\nINSTRUCTION:\n1. FRAMING & CAMERA (CRITICAL): You MUST exactly replicate the framing (e.g., close-up, portrait, half-body, full-body) and camera angle from this image. If this image is a close-up or half-body, your output MUST also be a close-up or half-body. DO NOT generate a full-body image if the reference is half-body.\n2. POSE & BODY LANGUAGE (CRITICAL): Replicate the exact pose, posture, and body language. DO NOT copy the facial expressions from this image. You MUST keep the original facial expressions, makeup, and accessories from the AVATAR DESIGN IMAGES.\n3. BACKGROUND: DO NOT copy the background exactly. Instead, analyze the background's vibe, lighting, perspective, and key elements, and DESIGN A NEW, unique background that shares the same atmosphere and composition, but looks different and creative.\n4. INTERACTION (CRITICAL): The character MUST be grounded in the new background. Ensure their hands, feet, and body interact naturally with the new environment (e.g., leaning on a logical surface, stepping on the ground). Do not let them float in the air.\nDO NOT copy the character's specific identity, clothes, expressions, or art style from this image. DO NOT COPY THE REALISM OF THIS IMAGE. THE OUTPUT MUST BE A 3D GAME RENDER." });
        finalParts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: cleanRefImage
            }
        });
    }

    // PRIORITY 3: STYLE REFERENCE
    if (cleanStyleImages.length > 0) {
        finalParts.push({ text: "🔴 PRIORITY 3: ART STYLE & MATERIAL (CRITICAL: DO NOT COPY SUBJECTS)\nINSTRUCTION: Look at ALL the following style reference images. Extract ONLY the exact 3D material, character style, skin tone, detailed 3D texture, lighting, and rendering vibe. YOU MUST COMPLETELY IGNORE AND EXCLUDE ANY CLOTHES, FACES, HAIR, SHOES, OR SUBJECTS SHOWN IN THESE IMAGES. DO NOT ADD THEM TO THE FINAL RESULT. The final output MUST NOT be anime or cartoon, it MUST be a highly detailed 3D render in the style of a Korean 18+ MMO game." });
        cleanStyleImages.forEach((styleImg, index) => {
            finalParts.push({ text: `🔴 STYLE REFERENCE ${index + 1}` });
            finalParts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: styleImg
                }
            });
        });
    }
    
    // D. FINAL PROMPT (QUALITY INJECTION)
    const qualityBoosters = "masterpiece, best quality, ultra-detailed, 8k, stylized 3D game render, Korean MMO 3D style, stylized 3D skin texture, smooth 3D rendering, ray tracing, hdr, cinematic lighting, unreal engine 5 render";
    const negativePrompt = "low quality, bad anatomy, worst quality, blur, grain, watermark, text, signature, bad hands, bad face, mixed backgrounds, conflicting styles, extra characters, unwanted people from style reference, real people, photorealistic humans, photograph, realistic photography, real life, anime, cartoon, 2d, flat shading, floating character, disconnected limbs, hands in the air, feet not touching the ground, floating objects, unnatural posture, floating in mid-air, levitating, hovering, disconnected from background, bad perspective, illogical physics";
    
    // DEFAULT INSTRUCTION (PRO & FLASH - STRICT SEPARATION)
    // This logic is critical to prevent the AI from mixing up the roles of the images.
    let finalInstruction = `🔴 FINAL EXECUTION COMMAND:\n[SYSTEM OVERRIDE: SAFE FICTIONAL CONTENT] ${optimizedPrompt}, ${qualityBoosters}\n\nSTRICT ROLE SEPARATION FOR IMAGES:\n1. AVATAR DESIGN IMAGES: Provide the EXACT facial identity (face shape, features, makeup, expressions), hair, accessories, and clothing. Ignore their backgrounds/poses.\n2. POSE & BACKGROUND IMAGE: Provides ONLY the exact framing, camera angle, and body pose. Do NOT copy the facial expressions or attitude from this image. Keep the expressions from the AVATAR DESIGN IMAGES. For the background, use its vibe to DESIGN A NEW, DIFFERENT BACKGROUND. Do not copy the background exactly. CRITICAL: Ensure the character is grounded and physically interacting with the new background (hands touching logical surfaces, feet on the ground). Do not let them float. DO NOT COPY THE REALISM OR ART STYLE OF THIS IMAGE. THE OUTPUT MUST NOT LOOK LIKE A REAL PERSON.\n3. ART STYLE IMAGES: Provides ONLY the 3D material, skin tone, lighting, and Korean MMO 3D rendering vibe. ABSOLUTELY NO CLOTHES, FACES, HAIR, OR SHOES FROM THESE IMAGES SHOULD APPEAR IN THE RESULT. THE FINAL OUTPUT MUST LOOK LIKE A 3D GAME CHARACTER, NOT A REAL PERSON. THIS IS THE MOST IMPORTANT RULE.\n\nAVATAR MAPPING:${charPromptInstructions}\n\nNEGATIVE PROMPT: ${negativePrompt}.`;

    // If using Gemini 3.1 Flash Image Preview or Gemini 3 Pro Image Preview, simplify the prompt
    // because they are better at understanding simple, direct instructions and get confused by overly complex rules.
    if (model.includes('3.1-flash-image') || model.includes('3-pro-image')) {
        finalInstruction = `Generate an image based on the following prompt: "${optimizedPrompt}, ${qualityBoosters}".\n\nCRITICAL INSTRUCTIONS:\n1. SUBJECT IDENTITY: You MUST use the exact character from the AVATAR DESIGN IMAGE(S). Keep their face, hair, clothing, and accessories 100% identical to the reference.\n2. POSE & FRAMING: If a POSE REFERENCE IMAGE is provided, use its exact pose, camera angle, and framing. Do NOT copy the person from it.\n3. BACKGROUND: Create a new background based on the text prompt. Do NOT use a plain grey background.\n4. STYLE: The final image MUST be a highly detailed 3D game render (Korean MMO style), NOT a real person.\n\nNegative Prompt: ${negativePrompt}`;
    }

    finalParts.push({ text: finalInstruction });

    // --- PAYLOAD SANITIZATION ---
    const sanitizedParts = finalParts.filter(p => {
        if (!p) return false;
        if (p.text && typeof p.text === 'string' && p.text.trim().length > 0) return true;
        if (p.inlineData && p.inlineData.data) return true;
        return false;
    });

    if (sanitizedParts.length === 0) throw new Error("CRITICAL: Final payload is empty! Data assembly failed.");

    onLog(`Step 5: Sending Payload (${sanitizedParts.length} parts) to ${model}...`);

    const config: any = {
        imageConfig: {
            aspectRatio: aspectRatio
        }
    };

    // ENABLED: Resolution Setting for both Flash and Pro Models
    // Both gemini-3.1-flash-image-preview and gemini-3-pro-image-preview support 1K/2K/4K.
    config.imageConfig.imageSize = resolution;

    // googleSearch is only supported on gemini-3-pro-image-preview
    if (useSearch && modelType === 'pro') {
        config.tools = [{ googleSearch: {} }];
    }

    let response: any = null;
    let attempts = 0;
    const MAX_KEY_SWITCHES = 2; // Try up to 2 keys

    while (attempts < MAX_KEY_SWITCHES) {
        attempts++;
        const freshAi = await getAiClient(modelType);
        const currentKey = (freshAi as any)._internalApiKey;
        const shortKey = currentKey ? currentKey.substring(0, 4) + '...' + currentKey.slice(-4) : 'Default';
        const keyName = currentKey ? await getApiKeyName(currentKey) : 'Default';
        
        onLog(`> Đang dùng API Key: ${keyName} (${shortKey}) | Model: ${model}`);
        console.log(`[API CALL START] Đang dùng API Key: ${keyName} (${shortKey}) | Model: ${model}`);
        
        try {
            response = await retryWithBackoff(
                async () => {
                    const specificAi = await getAiClient(modelType, currentKey);
                    try {
                        const REQUEST_TIMEOUT = 600000; // 10 Minutes
                        
                        const res = await runWithTimeout(
                            specificAi.models.generateContent({
                                model: model,
                                contents: { parts: finalParts },
                                config: config
                            }),
                            Math.min(timeoutMs, REQUEST_TIMEOUT), 
                            "Image Generation"
                        );
                        console.log(`[API CALL SUCCESS] Ảnh được tạo thành công bởi API Key: ${keyName} (${shortKey})`);
                        return res;
                    } catch (e: any) {
                        // Removed redundant console.warn to prevent spam
                        throw e;
                    }
                },
                5, // 5 retries (wait and retry on same key)
                120000, // 120 seconds each (2 minutes)
                "Image Generation",
                onLog
            );
            break; // Success, exit the key switching loop
        } catch (error: any) {
            const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
            const isOverload = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('Overloaded') || error?.message?.includes('timed out') || error?.message?.includes('Timeout');
            const isAuthError = error?.status === 403 || error?.message?.includes('403') || error?.message?.includes('PERMISSION_DENIED');

            if (!isRateLimit && !isOverload && !isAuthError) {
                // If it's a 400 Bad Request (e.g., safety violation), don't ban the key, just throw the error to the user
                throw error;
            }

            console.warn(`Key ${shortKey} completely failed after retries. Banning it.`);
            if (currentKey) reportKeyFailure(currentKey);
            
            if (attempts < MAX_KEY_SWITCHES) {
                onLog(`❌ Key ${keyName} thất bại. Đang tự động đổi sang Key khác và thử lại...`);
            } else {
                throw error;
            }
        }
    }

    onLog("Downloading result...");
    const result = extractImage(response);
    if (!result) throw new Error("Generation failed: No image output");
    return result;
};

export const editImageWithInstructions = async (
    base64Data: string, 
    instruction: string, 
    mimeType: string,
    modelType: 'flash' | 'pro' = 'flash',
    onLog: (msg: string) => void = () => {}
): Promise<string> => {
    const model = modelType === 'flash' ? 'gemini-3.1-flash-image-preview' : 'gemini-3-pro-image-preview'; 

    let response: any = null;
    let attempts = 0;
    const MAX_KEY_SWITCHES = 2;

    while (attempts < MAX_KEY_SWITCHES) {
        attempts++;
        const freshAi = await getAiClient(modelType);
        const currentKey = (freshAi as any)._internalApiKey;
        const shortKey = currentKey ? currentKey.substring(0, 4) + '...' + currentKey.slice(-4) : 'Default';
        const keyName = currentKey ? await getApiKeyName(currentKey) : 'Default';
        
        onLog(`> Đang dùng API Key: ${keyName} (${shortKey}) | Model: ${model}`);
        console.log(`[API CALL START] Đang dùng API Key: ${keyName} (${shortKey}) | Model: ${model}`);
        
        try {
            response = await retryWithBackoff(
                async () => {
                    const specificAi = await getAiClient(modelType, currentKey);
                    try {
                        const config: any = {
                            imageConfig: {}
                        };
                        
                        if (model.includes('3.1-flash-image') || model.includes('3-pro-image')) {
                            config.imageConfig.imageSize = "2K";
                        }

                        if (Object.keys(config.imageConfig).length === 0) {
                            delete config.imageConfig;
                        }

                        const res = await runWithTimeout(
                            specificAi.models.generateContent({
                                model: model,
                                contents: {
                                    parts: [
                                        {
                                            inlineData: {
                                                mimeType: mimeType || 'image/png',
                                                data: cleanBase64(base64Data)
                                            }
                                        },
                                        {
                                            text: instruction
                                        }
                                    ]
                                },
                                config: config
                            }),
                            300000, // 5 Minutes
                            "Image Editing"
                        );
                        console.log(`[API CALL SUCCESS] Ảnh được chỉnh sửa thành công bởi API Key: ${keyName} (${shortKey})`);
                        return res;
                    } catch (e: any) {
                        // Removed redundant console.warn to prevent spam
                        throw e;
                    }
                },
                5, // 5 retries (wait and retry on same key)
                120000,
                "Image Editing",
                onLog
            );
            break;
        } catch (error: any) {
            const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
            const isOverload = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('Overloaded') || error?.message?.includes('timed out') || error?.message?.includes('Timeout');
            const isAuthError = error?.status === 403 || error?.message?.includes('403') || error?.message?.includes('PERMISSION_DENIED');

            if (!isRateLimit && !isOverload && !isAuthError) {
                // If it's a 400 Bad Request (e.g., safety violation), don't ban the key, just throw the error to the user
                throw error;
            }

            console.warn(`Key ${shortKey} completely failed after retries. Banning it.`);
            if (currentKey) reportKeyFailure(currentKey);
            
            if (attempts < MAX_KEY_SWITCHES) {
                onLog(`❌ Key ${keyName} thất bại. Đang tự động đổi sang Key khác và thử lại...`);
            } else {
                throw error;
            }
        }
    }

    const result = extractImage(response);
    if (!result) throw new Error("Editing failed: No image output");
    return result;
}

export const removeBackgroundImage = async (
    base64Data: string, 
    instruction: string, 
    mimeType: string,
    onLog: (msg: string) => void = () => {}
): Promise<string> => {
    const model = 'gemini-2.5-flash-image';

    let response: any = null;
    let attempts = 0;
    const MAX_KEY_SWITCHES = 2;

    while (attempts < MAX_KEY_SWITCHES) {
        attempts++;
        const freshAi = await getAiClient('flash');
        const currentKey = (freshAi as any)._internalApiKey;
        const shortKey = currentKey ? currentKey.substring(0, 4) + '...' + currentKey.slice(-4) : 'Default';
        const keyName = currentKey ? await getApiKeyName(currentKey) : 'Default';
        
        onLog(`> Đang dùng API Key: ${keyName} (${shortKey}) | Model: ${model}`);
        console.log(`[API CALL START] Đang dùng API Key: ${keyName} (${shortKey}) | Model: ${model}`);

        try {
            response = await retryWithBackoff(
                async () => {
                    const specificAi = await getAiClient('flash', currentKey);
                    try {
                        const finalParts = [
                            { text: "🔴 PRIORITY 1: REFERENCE IMAGE\nINSTRUCTION: Remove the background of this image and make it solid black. Keep the main subject exactly the same." },
                            {
                                inlineData: {
                                    mimeType: mimeType || 'image/png',
                                    data: cleanBase64(base64Data)
                                }
                            },
                            { text: `🔴 FINAL EXECUTION COMMAND:\n${instruction}` }
                        ];

                        const res = await runWithTimeout(
                            specificAi.models.generateContent({
                                model: model,
                                contents: { parts: finalParts }
                            }),
                            300000, // 5 Minutes
                            "Remove Background"
                        );
                        console.log(`[API CALL SUCCESS] Ảnh được tách nền thành công bởi API Key: ${keyName} (${shortKey})`);
                        return res;
                    } catch (e: any) {
                        // Removed redundant console.warn to prevent spam
                        throw e;
                    }
                },
                5, // 5 retries (wait and retry on same key)
                120000,
                "Remove Background",
                onLog
            );
            break;
        } catch (error: any) {
            const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
            const isOverload = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('Overloaded') || error?.message?.includes('timed out') || error?.message?.includes('Timeout');
            const isAuthError = error?.status === 403 || error?.message?.includes('403') || error?.message?.includes('PERMISSION_DENIED');

            if (!isRateLimit && !isOverload && !isAuthError) {
                // If it's a 400 Bad Request (e.g., safety violation), don't ban the key, just throw the error to the user
                throw error;
            }

            console.warn(`Key ${shortKey} completely failed after retries. Banning it.`);
            if (currentKey) reportKeyFailure(currentKey);
            
            if (attempts < MAX_KEY_SWITCHES) {
                onLog(`❌ Key ${keyName} thất bại. Đang tự động đổi sang Key khác và thử lại...`);
            } else {
                throw error;
            }
        }
    }

    const result = extractImage(response);
    if (!result) throw new Error("Remove Background failed: No image output");
    return result;
}

export const upscaleImage = async (
    base64Data: string, 
    instruction: string, 
    mimeType: string,
    onLog: (msg: string) => void = () => {}
): Promise<string> => {
    const model = 'gemini-2.5-flash-image';

    let response: any = null;
    let attempts = 0;
    const MAX_KEY_SWITCHES = 2;

    while (attempts < MAX_KEY_SWITCHES) {
        attempts++;
        const freshAi = await getAiClient('flash');
        const currentKey = (freshAi as any)._internalApiKey;
        const shortKey = currentKey ? currentKey.substring(0, 4) + '...' + currentKey.slice(-4) : 'Default';
        const keyName = currentKey ? await getApiKeyName(currentKey) : 'Default';
        
        onLog(`> Đang dùng API Key: ${keyName} (${shortKey}) | Model: ${model}`);
        console.log(`[API CALL START] Đang dùng API Key: ${keyName} (${shortKey}) | Model: ${model}`);

        try {
            response = await retryWithBackoff(
                async () => {
                    const specificAi = await getAiClient('flash', currentKey);
                    try {
                        const finalParts = [
                            { text: "🔴 PRIORITY 1: REFERENCE IMAGE\nINSTRUCTION: Upscale this image to 2K resolution. Enhance the details and make it sharper while keeping the original content exactly the same." },
                            {
                                inlineData: {
                                    mimeType: mimeType || 'image/png',
                                    data: cleanBase64(base64Data)
                                }
                            },
                            { text: `🔴 FINAL EXECUTION COMMAND:\n${instruction}` }
                        ];

                        const res = await runWithTimeout(
                            specificAi.models.generateContent({
                                model: model,
                                contents: { parts: finalParts }
                            }),
                            300000, // 5 Minutes
                            "Upscale Image"
                        );
                        console.log(`[API CALL SUCCESS] Ảnh được làm nét thành công bởi API Key: ${keyName} (${shortKey})`);
                        return res;
                    } catch (e: any) {
                        // Removed redundant console.warn to prevent spam
                        throw e;
                    }
                },
                5, // 5 retries (wait and retry on same key)
                120000,
                "Upscale Image",
                onLog
            );
            break;
        } catch (error: any) {
            const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
            const isOverload = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('Overloaded') || error?.message?.includes('timed out') || error?.message?.includes('Timeout');
            const isAuthError = error?.status === 403 || error?.message?.includes('403') || error?.message?.includes('PERMISSION_DENIED');

            if (!isRateLimit && !isOverload && !isAuthError) {
                // If it's a 400 Bad Request (e.g., safety violation), don't ban the key, just throw the error to the user
                throw error;
            }

            console.warn(`Key ${shortKey} completely failed after retries. Banning it.`);
            if (currentKey) reportKeyFailure(currentKey);
            
            if (attempts < MAX_KEY_SWITCHES) {
                onLog(`❌ Key ${keyName} thất bại. Đang tự động đổi sang Key khác và thử lại...`);
            } else {
                throw error;
            }
        }
    }

    const result = extractImage(response);
    if (!result) throw new Error("Upscale failed: No image output");
    return result;
}