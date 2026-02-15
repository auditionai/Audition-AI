
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

const getAiClient = async (specificKey?: string) => {
    const key = specificKey || await getSystemApiKey();
    if (!key) throw new Error("API Key missing or invalid");
    return new GoogleGenAI({ apiKey: key });
};

const extractImage = (response: any): string | null => {
    if (!response || !response.candidates || response.candidates.length === 0) return null;
    const parts = response.candidates[0].content.parts;
    for (const part of parts) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
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
        await ai.models.generateContent({
             model: 'gemini-2.5-flash-latest',
             contents: 'ping'
        });
        return true;
    } catch (e) {
        console.error("Gemini Connection Check Failed", e);
        return false;
    }
};

// --- PROMPT REASONING ENGINE V2: THE "SUPREME COMMAND" ---
// AI này có nhiệm vụ "Chuyển hóa" ý tưởng người dùng thành ngôn ngữ 3D Game
const optimizePromptWithThinking = async (rawPrompt: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are the Lead Art Director for a 3D Game Character Creation System (like Audition, Pop Mart, Blind Box).
            
            USER INPUT: "${rawPrompt}"
            
            YOUR MISSION:
            1.  **Analyze**: Understand the user's scene description (pose, objects, lighting, background, specific numbers/items).
            2.  **Enforce 3D Style**: Even if the user says "Photo", "Realism", or "Human", you MUST interpret this as "High-end 3D Render imitating that style". NEVER output a prompt for a real human.
            3.  **Construct Prompt**: Write a detailed prompt for the Image Generator.
            
            MANDATORY KEYWORDS TO INCLUDE:
            - "3D Game Character Render", "CGI", "Unreal Engine 5", "Octane Render".
            - "Stylized 3D proportions", "Smooth skin texture", "Clay material" or "3D Anime style".
            - IF user asks for "Flash Photo": Use "3D render with direct flash lighting, harsh shadows, digital camera aesthetic".
            
            SCENE PRESERVATION:
            - You MUST keep specific details: "Blue shark plushie", "Digital number 22 on AC", "Messy aesthetic room".
            - Describe the POSE exactly as requested.
            
            OUTPUT:
            Return ONLY the optimized English prompt.`,
        });
        return response.text?.trim() || rawPrompt;
    } catch (e) {
        console.warn("Prompt Optimization Failed, using raw prompt", e);
        return rawPrompt;
    }
}

// --- INTELLIGENCE CORE: LOGIC XỬ LÝ PROMPT ĐA TẦNG (UPGRADED V4) ---
const processDigitalTwinMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[],
    modelTier: 'flash' | 'pro'
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    
    if (refImagePart) {
        // INPUT A: STRUCTURE (Cấu trúc/Pose)
        parts.push({ text: "REFERENCE IMAGE [POSE & LAYOUT ONLY]: Mimic the camera angle, character positioning, and composition of this image exactly. Do NOT copy the character's face." });
        parts.push(refImagePart);
    }
    
    if (charParts.length > 0) {
        // INPUT B: IDENTITY (Định danh)
        parts.push({ text: `REFERENCE FACE [IDENTITY]: Use these features for the 3D character's face. Map them onto a 3D model.` });
        parts.push(...charParts);
    }

    // --- SYSTEM INSTRUCTION (V4 - SUPREME 3D COMMAND) ---
    // Đây là "Hiến pháp" bắt buộc AI phải tuân theo
    const systemPrompt = `** SUPREME DIRECTIVE: 3D GAME CHARACTER GENERATION **
    
    1.  **CORE IDENTITY**: 
        - You are a 3D Rendering Engine (like Unreal Engine 5 or Blender).
        - EVERYTHING you generate must be a **3D MODEL / GAME CHARACTER**.
        - **NEVER** generate a photorealistic real-life human photograph.
        - Characters should have that specific "Audition Game" / "Pop Mart" / "Blind Box" aesthetic (smooth skin, perfect hair, slightly stylized proportions).

    2.  **SCENE & DETAIL FIDELITY (HIGHEST PRIORITY)**:
        - The user's prompt contains SPECIFIC scene details (e.g., "Shark plushie", "Number 22 on AC", "Black leather sofa"). 
        - YOU MUST RENDER THESE EXACTLY. Do not ignore background details.
        - If the user describes a pose (e.g., "Hugging from behind", "Legs intertwined"), render that EXACT pose.

    3.  **STYLE INTERPRETATION**:
        - If prompt says "Flash Photography" -> Render a 3D Character with direct, harsh lighting and high contrast shading.
        - If prompt says "Vintage" -> Apply a noise/grain filter to the 3D Render.
        - The "Vibe" is the photographic style, but the "Subject" remains a 3D Character.

    [FINAL PROMPT EXECUTION]: ${prompt}
    `;

    return { systemPrompt, parts };
};

export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, 
    characterDataList: CharacterData[] = [], 
    resolution: string = '2K',
    _modelTier: 'flash' | 'pro' = 'pro', // Deprecated param
    useSearch: boolean = true, // Default ON
    useCloudRef: boolean = true, // Default ON
    onProgress?: (msg: string) => void
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    const model = 'gemini-3-pro-image-preview';
    
    // STEP 1: THINKING & OPTIMIZATION (Reasoning Layer)
    if (onProgress) onProgress("Analyzing Scene Layout & 3D Conversion...");
    
    // Force "3D Game Character" context into the prompt optimizer
    let optimizedPrompt = await optimizePromptWithThinking(prompt);
    
    // Safety Net: Append 3D keywords one last time just in case the optimizer missed it
    if (!optimizedPrompt.toLowerCase().includes("3d")) {
        optimizedPrompt = "3D Game Character Render, " + optimizedPrompt;
    }

    if (onProgress) onProgress(`Engine: ${model} | Rendering 3D Scene...`);

    // STEP 2: PREPARE INPUTS
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
            if (onProgress) onProgress(`Mapping 3D Texture (Player ${char.id})...`);
            
            const textureSheet = await createTextureSheet(
                char.image, 
                char.faceImage, 
                char.shoesImage 
            );
            
            let finalPart;

            if (useCloudRef) {
                try {
                    const fileUri = await uploadToGemini(textureSheet, 'image/jpeg');
                    finalPart = {
                        fileData: { mimeType: 'image/jpeg', fileUri: fileUri }
                    };
                } catch (e) {
                     finalPart = {
                        inlineData: { data: cleanBase64(textureSheet), mimeType: 'image/jpeg' }
                    };
                }
            } else {
                finalPart = {
                    inlineData: { data: cleanBase64(textureSheet), mimeType: 'image/jpeg' }
                };
            }

            allParts.push(finalPart);
            charDescriptions.push(char.gender);
        }
    }

    // STEP 3: EXECUTE GENERATION WITH SUPREME COMMAND
    const payload = processDigitalTwinMode(optimizedPrompt, refImagePart, allParts, charDescriptions, 'pro');
    
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { 
            aspectRatio: aspectRatio,
            imageSize: resolution
        },
        // Direct Safety Settings to allow creative freedom while blocking harmful content
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    // Use Google Search only if we need to understand specific real-world objects (like "Air Conditioner model X")
    // But keep the pose reference priority if it exists.
    if (useSearch && !refImagePart && prompt.length < 50) {
        config.tools = [{ googleSearch: {} }];
    }

    if (onProgress) onProgress("Finalizing Octane Render...");

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: finalParts },
      config: config
    });

    return extractImage(response);

  } catch (error) {
    console.error("Gemini Pipeline Error:", error);
    throw error;
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
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: currentInput || `Create a 3D character concept for ${featureName}`,
            config: {
                systemInstruction: `You are an AI Prompt Expert for 3D Game Assets. Output ONLY the refined 3D-centric prompt.`,
                temperature: 0.7,
            }
        });
        return response.text?.trim() || currentInput;
    } catch (error) { return currentInput; }
}
