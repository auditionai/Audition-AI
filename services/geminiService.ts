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
    // 1. Specific key (testing)
    if (specificKey) return new GoogleGenAI({ apiKey: specificKey });

    // 2. DB Key (Rotation System - Priority)
    // We prioritize the DB keys to enable the Load Balancing / Rotation mechanism
    const dbKey = await getSystemApiKey();
    if (dbKey) return new GoogleGenAI({ apiKey: dbKey });

    // 3. Env Key (Fallback)
    if (process.env.API_KEY) return new GoogleGenAI({ apiKey: process.env.API_KEY });

    throw new Error("API Key missing. Set process.env.API_KEY or configure in Admin.");
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
        // Add Timeout to Ping - INCREASED TO 15s
        await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: 'ping'
            }),
            15000,
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
                model: 'gemini-3-flash-preview',
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
    
    parts.push({ text: `GENERATE: ${prompt}` });

    const systemPrompt = `** SYSTEM DIRECTIVE: KOREAN MMO GAME CHARACTER GENERATION (GEMINI 3.0 PRO) **
    
    1.  **STRICT BODY PROPORTIONS (CRITICAL)**:
        - The character MUST have **TALL, SLENDER, ADULT** proportions (like K-Pop Idols or Fashion Models).
        - **Body Ratio**: 1:8 (Head to Body). LEGS MUST BE LONG.
        - **ABSOLUTELY NO**: Chibi, Child-like, Big Head, Short Legs, Cartoonish proportions.

    2.  **STYLE**:
        - Semi-realistic Anime / Korean MMO Style (Lost Ark, Black Desert).
        - Octane Render, Unreal Engine 5, Ray Tracing.
        - Detailed textures (skin pores, fabric weaving).
    `;

    return { systemPrompt, parts };
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
    onLog: (msg: string) => void = () => {}
): Promise<string> => {
    onLog("Initializing Gemini 3.0 Pro...");
    const ai = await getAiClient();
    
    const model = 'gemini-3-pro-image-preview'; // Only this model supports image generation size and search
    
    let refImagePart = null;
    if (refImageBase64) {
        onLog("Processing Reference Image...");
        if (refImageBase64.startsWith('data:') || refImageBase64.length > 100) {
             refImagePart = {
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanBase64(refImageBase64)
                }
            };
        }
    }

    const charParts: any[] = [];
    for (const char of characters) {
        if (char.faceImage) {
            onLog(`Processing Face ID for Character ${char.id}...`);
            charParts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanBase64(char.faceImage)
                }
            });
        }
        if (char.image && !char.faceImage) { 
             charParts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanBase64(char.image)
                }
            });
        }
    }

    onLog("Reasoning Prompt...");
    const optimizedPrompt = await optimizePromptWithThinking(prompt);
    
    const { systemPrompt, parts } = processDigitalTwinMode(optimizedPrompt, refImagePart, charParts, []);
    
    onLog("Sending to Generation Grid...");

    const config: any = {
        imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution
        },
        systemInstruction: systemPrompt
    };

    if (useSearch) {
        config.tools = [{ googleSearch: {} }];
    }

    const response = await runWithTimeout(
        ai.models.generateContent({
            model: model,
            contents: { parts },
            config: config
        }),
        60000, 
        "Image Generation"
    );

    onLog("Downloading result...");
    const result = extractImage(response);
    if (!result) throw new Error("Generation failed: No image output");
    return result;
};

export const editImageWithInstructions = async (
    base64Data: string, 
    instruction: string, 
    mimeType: string
): Promise<string> => {
    const ai = await getAiClient();
    
    // gemini-2.5-flash-image for standard editing per guidelines
    const model = 'gemini-2.5-flash-image'; 

    const response = await runWithTimeout(
        ai.models.generateContent({
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
            }
        }),
        45000,
        "Image Editing"
    );

    const result = extractImage(response);
    if (!result) throw new Error("Editing failed: No image output");
    return result;
}
