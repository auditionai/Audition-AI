
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

// --- TIMEOUT HELPER ---
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

        // Add Timeout to Upload
        const uploadResult = await runWithTimeout(
            ai.files.upload({
                file: blob,
                config: { displayName: `ref_img_${Date.now()}` }
            }),
            20000, // 20s
            "File Upload"
        );

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
        // Add Timeout to Ping
        await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: 'ping'
            }),
            5000,
            "Ping Connection"
        );
        return true;
    } catch (e) {
        console.error("Gemini Connection Check Failed", e);
        return false;
    }
};

// --- PROMPT REASONING ENGINE ---
const optimizePromptWithThinking = async (rawPrompt: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // Add Timeout to Thinking
        const response = await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: `You are a Technical Prompt Engineer. Convert user input into professional 3D art keywords.
                USER INPUT: "${rawPrompt}"
                OUTPUT: [Subject] + [Action] + [Outfit] + [Environment] + [Lighting] + [Style Tags].
                MANDATORY: "3D Game Character, Korean MMO Style, Tall Slender Body, Long Legs, Small Head, Fashion Model Ratio, 8-head tall, Smooth Texture, Octane Render, 8K".`,
            }),
            10000, // 10s
            "Prompt Optimization"
        );
        
        const result = response.text?.trim();
        if (!result) throw new Error("Empty reasoning response");
        return result;

    } catch (e) {
        console.warn("Prompt Optimization Failed/Timed out, using raw prompt", e);
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

// --- MAIN GENERATION FUNCTION ---
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, 
    characterDataList: CharacterData[] = [], 
    resolution: string = '2K',
    _modelTier: 'pro' = 'pro',
    useSearch: boolean = true, 
    useCloudRef: boolean = true, 
    onProgress?: (msg: string) => void
): Promise<string | null> => {
  
  const ai = await getAiClient();
  const MODEL_NAME = 'gemini-3-pro-image-preview';

  try {
    // 1. OPTIMIZATION PHASE
    if (onProgress) onProgress("Analyzing Prompt (Gemini 3.0 Pro)...");
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

    // Process Characters with Timeouts
    for (const char of characterDataList) {
        if (char.image) {
            if (onProgress) onProgress(`Scanning Identity Features (Player ${char.id})...`);
            
            // Texture Sheet Generation could hang if not careful, but it's local canvas logic usually.
            // We assume createTextureSheet is safe or handled in its own module.
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
            imageSize: resolution
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
    const response = await runWithTimeout(
        ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: finalParts },
            config: config
        }),
        60000, // 60s hard limit for the API call itself
        "Image Generation"
    );

    return extractImage(response);

  } catch (error: any) {
    console.error("Gemini Pipeline Final Error:", error);
    throw error;
  }
};

export const editImageWithInstructions = async (base64Data: string, instruction: string, mimeType: string): Promise<string | null> => {
    try {
        const ai = await getAiClient();
        
        const response = await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3-pro-image-preview', 
                contents: {
                    parts: [
                        { inlineData: { data: cleanBase64(base64Data), mimeType: mimeType } },
                        { text: instruction }
                    ]
                }
            }),
            60000,
            "Edit Image"
        );
        return extractImage(response);
    } catch (e) {
        console.error(e);
        throw e;
    }
};

export const suggestPrompt = async (currentInput: string, lang: string, featureName: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        const response = await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3-pro-preview', 
                contents: currentInput || `Create a 3D character concept for ${featureName}`,
                config: {
                    systemInstruction: `You are an AI Prompt Expert. Output refined 3D prompt.`,
                    temperature: 0.7,
                }
            }),
            8000,
            "Suggest Prompt"
        );
        return response.text?.trim() || currentInput;
    } catch (error) { return currentInput; }
}
