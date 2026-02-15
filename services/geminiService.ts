
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";
import { createTextureSheet, optimizePayload, createSolidFence } from "../utils/imageProcessor";

export interface CharacterData {
  id: number;
  gender: 'male' | 'female';
  image: string | null;
  faceImage?: string | null;
  shoesImage?: string | null;
  description?: string;
}

const cleanBase64 = (data: string) => {
    if (!data) return '';
    const index = data.indexOf(';base64,');
    if (index !== -1) {
        return data.substring(index + 8);
    }
    return data;
};

// Cấu hình timeout cao hơn cho Client (mặc định fetch là ngắn)
const getAiClient = async (specificKey?: string) => {
    const key = specificKey || await getSystemApiKey();
    if (!key) throw new Error("API Key missing or invalid");
    return new GoogleGenAI({ 
        apiKey: key,
    });
};

// --- ERROR HANDLER & EXTRACTOR (FIXED CRASH) ---
const extractImage = (response: any): string | null => {
    // 1. Kiểm tra cấu trúc cơ bản
    if (!response) {
        console.error("Empty response from Gemini");
        return null;
    }

    // 2. Kiểm tra Safety Block (Lỗi phổ biến nhất)
    if (response.promptFeedback?.blockReason) {
        console.warn("Blocked by Safety:", response.promptFeedback);
        throw new Error(`Safety Block: ${response.promptFeedback.blockReason}`);
    }

    // 3. Kiểm tra Candidates
    if (!response.candidates || response.candidates.length === 0) {
        console.warn("No candidates returned.");
        return null;
    }

    const candidate = response.candidates[0];

    // 4. Kiểm tra Finish Reason của Candidate
    if (candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
        // Nếu bị chặn ở mức candidate
        if (candidate.finishReason === "SAFETY") {
             throw new Error("Safety Block (Content violation)");
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

    return null;
};

const uploadToGemini = async (base64Data: string, mimeType: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        const byteCharacters = atob(cleanBase64(base64Data));
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });

        const uploadResult = await ai.files.upload({
            file: blob,
            config: { 
                displayName: `ref_img_${Date.now()}` 
            }
        });

        const fileUri = (uploadResult as any).file?.uri || (uploadResult as any).uri;
        if (!fileUri) throw new Error("No URI returned");
        
        return fileUri;
    } catch (e) {
        console.warn("Cloud upload failed, falling back to inline", e);
        throw e;
    }
};

export const checkConnection = async (key?: string): Promise<boolean> => {
    try {
        const ai = await getAiClient(key);
        // UPDATED: Use gemini-3-flash-preview for a reliable ping (Flash 2.5 deprecated)
        await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: 'ping'
        });
        return true;
    } catch (e) {
        console.error("Gemini Connection Check Failed", e);
        return false;
    }
};

// --- PROMPT REASONING ENGINE V3: THE "SANITIZER & ARCHITECT" ---
const optimizePromptWithThinking = async (rawPrompt: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // UPDATED: Use gemini-3-flash-preview
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `You are a Technical Prompt Engineer for a 3D Game Asset Generator.
            
            USER INPUT: "${rawPrompt}"
            
            TASK:
            1.  **Translate & Enhance**: Convert the user's description into professional English 3D art keywords.
            2.  **SANITIZE (IMPORTANT)**: If the prompt contains potentially NSFW, violent, or policy-violating terms (e.g., specific body parts, nudity terms), YOU MUST REWRITE them into safe, artistic terms (e.g., "fitted bodysuit", "sculpted physique"). Do not refuse the prompt, just clean it.
            3.  **Structure**: [Subject] + [Action/Pose] + [Outfit] + [Environment] + [Lighting] + [Style: 3D Game Render].
            4.  **Preserve Details**: Keep numbers (e.g., "22"), colors, and specific items (e.g., "Shark plushie").
            
            MANDATORY STYLE TAGS:
            "3D Game Character, Unreal Engine 5, Octane Render, Blind Box Style, Clean Textures".
            
            OUTPUT:
            Return ONLY the final prompt string. No conversational text.`,
        });
        
        // Safety check on the reasoning output itself
        const result = response.text?.trim();
        if (!result) throw new Error("Empty reasoning response");
        return result;

    } catch (e) {
        console.warn("Prompt Optimization Failed, using raw prompt", e);
        return rawPrompt;
    }
}

// --- INTELLIGENCE CORE ---
const processDigitalTwinMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[],
    modelTier: 'flash' | 'pro'
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    
    if (refImagePart) {
        parts.push({ text: "REFERENCE IMAGE [POSE & COMPOSITION]: Follow this image's camera angle and character pose exactly." });
        parts.push(refImagePart);
    }
    
    if (charParts.length > 0) {
        parts.push({ text: `REFERENCE FACE [IDENTITY]: Use these facial features for the 3D character.` });
        parts.push(...charParts);
    }

    const systemPrompt = `** SYSTEM DIRECTIVE: 3D GAME ASSET GENERATION **
    
    1.  **STYLE ENFORCEMENT**:
        - Output MUST be a "3D Game Character Render" (like Audition, Sims 4 with mods, or Pop Mart figures).
        - NOT a real photo. NOT a 2D drawing.
        - Skin should have "Subsurface Scattering" but retain a stylized "Game Ready" look.

    2.  **SCENE ACCURACY**:
        - Render exactly what is described in the prompt: objects, background details, lighting.
        - If the prompt specifies a "Shark plushie" or "Number 22", it MUST appear.

    3.  **SAFETY & COMPLIANCE**:
        - If the prompt implies nudity, AUTOMATICALY clothe the character in generic game underwear or a bodysuit. DO NOT BLOCK THE GENERATION.
        - Focus on the "Artistic" and "Digital" aspect.

    [EXECUTE PROMPT]: ${prompt}
    `;

    return { systemPrompt, parts };
};

// --- MAIN GENERATION FUNCTION WITH SMART RETRY ---
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, 
    characterDataList: CharacterData[] = [], 
    resolution: string = '2K',
    _modelTier: 'flash' | 'pro' = 'pro', 
    useSearch: boolean = true, 
    useCloudRef: boolean = true, 
    onProgress?: (msg: string) => void
): Promise<string | null> => {
  
  const ai = await getAiClient();
  const model = 'gemini-3-pro-image-preview'; // Only this model supports high quality generation

  // --- INTERNAL HELPER: EXECUTE RUN ---
  const executeRun = async (currentPrompt: string, isRetry: boolean = false): Promise<string | null> => {
        
        // Prepare Inputs
        let refImagePart = null;
        if (styleRefBase64) {
            refImagePart = {
                inlineData: { data: cleanBase64(styleRefBase64), mimeType: 'image/jpeg' }
            };
        }

        const allParts: any[] = [];
        const charDescriptions: string[] = [];

        for (const char of characterDataList) {
            if (char.image) {
                // Chỉ log scan lần đầu
                if (!isRetry && onProgress) onProgress(`Scanning Identity Features (Player ${char.id})...`);
                
                const textureSheet = await createTextureSheet(char.image, char.faceImage, char.shoesImage);
                let finalPart;

                // Cloud upload for better quality, fallback to inline
                if (useCloudRef) {
                    try {
                        const fileUri = await uploadToGemini(textureSheet, 'image/jpeg');
                        finalPart = { fileData: { mimeType: 'image/jpeg', fileUri: fileUri } };
                    } catch (e) {
                        finalPart = { inlineData: { data: cleanBase64(textureSheet), mimeType: 'image/jpeg' } };
                    }
                } else {
                    finalPart = { inlineData: { data: cleanBase64(textureSheet), mimeType: 'image/jpeg' } };
                }
                allParts.push(finalPart);
                charDescriptions.push(char.gender);
            }
        }

        const payload = processDigitalTwinMode(currentPrompt, refImagePart, allParts, charDescriptions, 'pro');
        const finalParts = [...payload.parts, { text: payload.systemPrompt }];

        const config: any = {
            imageConfig: { aspectRatio: aspectRatio, imageSize: resolution },
            // Safety Settings: BLOCK_ONLY_HIGH to allow artistic freedom but prevent illegal content
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" }, // Relaxed to allow "sexy" but not "porn"
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
            ]
        };

        if (useSearch && !refImagePart && currentPrompt.length < 50) {
            config.tools = [{ googleSearch: {} }];
        }

        if (onProgress) onProgress(isRetry ? "Retrying with Safety Filters..." : "Rendering Final Image (This may take 2-3 mins)...");

        // Gọi API
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: finalParts },
            config: config
        });

        return extractImage(response);
  };

  // --- MAIN FLOW ---
  try {
    // 1. OPTIMIZATION PHASE
    if (onProgress) onProgress("Analyzing Prompt & Safety Check...");
    const optimizedPrompt = await optimizePromptWithThinking(prompt);
    let finalPromptToUse = optimizedPrompt;

    // Safety Net: Ensure 3D context
    if (!finalPromptToUse.toLowerCase().includes("3d")) {
        finalPromptToUse = "3D Game Character Render, " + finalPromptToUse;
    }

    // 2. EXECUTION PHASE (ATTEMPT 1)
    if (onProgress) onProgress(`Engine: ${model} | Scene Construction...`);
    try {
        return await executeRun(finalPromptToUse);
    } catch (firstError: any) {
        // 3. RETRY PHASE (ATTEMPT 2 - FALLBACK)
        console.warn("Attempt 1 Failed:", firstError.message);
        
        // Nếu lỗi là do Safety hoặc Model không hiểu Prompt tối ưu, thử lại với Prompt gốc
        // Prompt gốc thường ngắn hơn và ít gây hiểu lầm cho bộ lọc Safety
        if (onProgress) onProgress("⚠️ Attempt 1 failed. Re-calibrating for Safety & Stability...");
        
        // Thêm delay nhẹ để tránh rate limit
        await new Promise(r => setTimeout(r, 2000));

        const safeFallbackPrompt = `3D Game Character, ${prompt} --safe --no nudity`;
        return await executeRun(safeFallbackPrompt, true);
    }

  } catch (error) {
    console.error("Gemini Pipeline Final Error:", error);
    throw error; // Ném lỗi ra để UI hoàn tiền
  }
};

export const editImageWithInstructions = async (base64Data: string, instruction: string, mimeType: string): Promise<string | null> => {
    try {
        const ai = await getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image', 
            contents: {
                parts: [
                    { inlineData: { data: cleanBase64(base64Data), mimeType: mimeType } },
                    { text: instruction }
                ]
            }
        });
        return extractImage(response);
    } catch (e) {
        console.error(e);
        return null;
    }
};

export const suggestPrompt = async (currentInput: string, lang: string, featureName: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // UPDATED: Use gemini-3-flash-preview
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: currentInput || `Create a 3D character concept for ${featureName}`,
            config: {
                systemInstruction: `You are an AI Prompt Expert for 3D Game Assets. Output ONLY the refined 3D-centric prompt.`,
                temperature: 0.7,
            }
        });
        return response.text?.trim() || currentInput;
    } catch (error) { return currentInput; }
}
