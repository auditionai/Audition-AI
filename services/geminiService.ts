
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
        // STRICTLY USE GEMINI 3.0 PRO FOR PING
        await ai.models.generateContent({
             model: 'gemini-3-pro-preview',
             contents: 'ping'
        });
        return true;
    } catch (e) {
        console.error("Gemini Connection Check Failed", e);
        return false;
    }
};

// --- PROMPT REASONING ENGINE: STRICT PRO 3.0 ---
const optimizePromptWithThinking = async (rawPrompt: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // STRICTLY USE GEMINI 3.0 PRO
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `You are a Technical Prompt Engineer for a High-End 3D Game Asset Generator.
            
            USER INPUT: "${rawPrompt}"
            
            TASK:
            1.  **Translate & Enhance**: Convert the user's description into professional English 3D art keywords.
            2.  **STYLE ENFORCEMENT**: The user wants a "Korean MMO Game Character" (Audition/Blade & Soul style).
            3.  **PROPORTIONS**: MUST BE TALL, SLENDER, ADULT PROPORTIONS. NO CHIBI.
            4.  **Structure**: [Subject] + [Action/Pose] + [Outfit] + [Environment] + [Lighting] + [Style Tags].
            
            MANDATORY STYLE TAGS TO ADD:
            "3D Game Character, Korean MMO Style, Tall Slender Body, Long Legs, Small Head, Fashion Model Ratio, 8-head tall, Smooth Texture, Non-Photorealistic Rendering, Octane Render, 8K Resolution".
            
            OUTPUT:
            Return ONLY the final prompt string. No conversational text.`,
        });
        
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
    charDescriptions: string[]
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

    const systemPrompt = `** SYSTEM DIRECTIVE: KOREAN MMO GAME CHARACTER GENERATION (GEMINI 3.0 PRO) **
    
    1.  **STRICT BODY PROPORTIONS (CRITICAL)**:
        - The character MUST have **TALL, SLENDER, ADULT** proportions (like K-Pop Idols or Fashion Models).
        - **Body Ratio**: 1:8 (Head to Body). LEGS MUST BE LONG.
        - **ABSOLUTELY NO**: Chibi, Nendoroid, Big Head, Short Legs, Child-like body, Baby face.
        - Treat this as a "High-End Fashion Game" asset.

    2.  **RENDERING STYLE (NON-REALISTIC)**:
        - Output MUST look like a PC Game Render (Audition Online, Sims 4 CC).
        - Skin: Smooth, flawless, "porcelain" texture. NO realistic pores/wrinkles.
        - Eyes: Stylized Anime/Game eyes (expressive but not creepy).
        - Hair: 3D Mesh style, thick strands, perfectly styled.

    3.  **SCENE ACCURACY**:
        - Render exactly what is described in the prompt.
        - If reference images are provided, MATCH THE BODY SCALE of the reference images.

    4.  **SAFETY & COMPLIANCE**:
        - If the prompt implies nudity, clothe the character in generic game underwear/bodysuit.

    [EXECUTE PROMPT]: ${prompt}
    `;

    return { systemPrompt, parts };
};

// --- MAIN GENERATION FUNCTION: STRICT PRO 3.0 ONLY ---
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, 
    characterDataList: CharacterData[] = [], 
    resolution: string = '2K',
    _modelTier: 'pro' = 'pro', // Parameter ignored, enforced internally
    useSearch: boolean = true, 
    useCloudRef: boolean = true, 
    onProgress?: (msg: string) => void
): Promise<string | null> => {
  
  const ai = await getAiClient();
  
  // STRICTLY ENFORCE GEMINI 3.0 PRO IMAGE MODEL
  const MODEL_NAME = 'gemini-3-pro-image-preview';

  try {
    // 1. OPTIMIZATION PHASE (Using Gemini 3.0 Pro Text)
    if (onProgress) onProgress("Analyzing Prompt with Gemini 3.0 Pro...");
    const optimizedPrompt = await optimizePromptWithThinking(prompt);
    
    let finalPromptToUse = optimizedPrompt;
    if (!finalPromptToUse.toLowerCase().includes("tall")) {
        finalPromptToUse = "Tall Slender 3D Game Character, Adult Proportions, " + finalPromptToUse + " --no chibi --no photorealistic";
    }

    // 2. PREPARE ASSETS
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
            if (onProgress) onProgress(`Scanning Identity Features (Player ${char.id})...`);
            
            const textureSheet = await createTextureSheet(char.image, char.faceImage, char.shoesImage);
            let finalPart;

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

    // 3. CONSTRUCT PAYLOAD
    const payload = processDigitalTwinMode(finalPromptToUse, refImagePart, allParts, charDescriptions);
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { 
            aspectRatio: aspectRatio,
            imageSize: resolution // Only Pro supports this
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
    };

    if (useSearch && !refImagePart && finalPromptToUse.length < 50) {
        config.tools = [{ googleSearch: {} }];
    }

    if (onProgress) onProgress(`Engine: ${MODEL_NAME} | Rendering...`);

    // 4. EXECUTE GENERATION WITH TIMEOUT
    // Timeout set to 60s
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout: Gemini API took too long")), 60000)
    );

    const apiPromise = ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts: finalParts },
        config: config
    });

    const response: any = await Promise.race([apiPromise, timeoutPromise]);

    return extractImage(response);

  } catch (error: any) {
    console.error("Gemini Pipeline Final Error:", error);
    throw error;
  }
};

export const editImageWithInstructions = async (base64Data: string, instruction: string, mimeType: string): Promise<string | null> => {
    try {
        const ai = await getAiClient();
        // STRICTLY USE GEMINI 3.0 PRO IMAGE
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview', 
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
        throw e; // Throw so UI handles refund
    }
};

export const suggestPrompt = async (currentInput: string, lang: string, featureName: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // STRICTLY USE GEMINI 3.0 PRO
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: currentInput || `Create a 3D character concept for ${featureName}`,
            config: {
                systemInstruction: `You are an AI Prompt Expert for 3D Game Assets. Output ONLY the refined 3D-centric prompt. Keep it stylized/anime but with TALL/ADULT proportions.`,
                temperature: 0.7,
            }
        });
        return response.text?.trim() || currentInput;
    } catch (error) { return currentInput; }
}
