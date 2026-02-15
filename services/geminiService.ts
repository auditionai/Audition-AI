
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

const processDigitalTwinMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[],
    modelTier: 'flash' | 'pro'
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    const isSingle = charDescriptions.length === 1;

    // --- REFINED PROMPT STRATEGY FOR SINGLE MODE WITH REF ---
    if (isSingle && refImagePart) {
        // PRIORITY 1: CHARACTER REFERENCE (Identity)
        if (charParts.length > 0) {
            parts.push({ text: "INPUT A - CHARACTER REFERENCE (SOURCE OF IDENTITY & OUTFIT): Use the face, hair, and clothing from this image." });
            parts.push(...charParts);
        }

        // PRIORITY 2: POSE REFERENCE (Structure)
        parts.push({ text: "INPUT B - POSE REFERENCE (SOURCE OF STRUCTURE): Use the pose, camera angle, and composition from this image. IGNORE the character details, clothes, and colors." });
        parts.push(refImagePart);

        const systemPrompt = `** SYSTEM: CHARACTER RE-POSING TASK **
        [OBJECTIVE]: Render the character from [INPUT A] into the exact pose and composition of [INPUT B].

        [CRITICAL INSTRUCTIONS]:
        1. IDENTITY LOCK: The output character MUST have the exact face, hairstyle, and OUTFIT of [INPUT A].
        2. STRUCTURE LOCK: The output MUST have the exact pose, body proportions, and camera angle of [INPUT B].
        3. CLOTHING RULE: Do NOT mix the clothes. You must strictly use the outfit from [INPUT A]. Ignore the outfit in [INPUT B].
        4. SCENE CONTEXT: "${prompt}"
        5. RENDER QUALITY: 8K, Unreal Engine 5, detailed textures.
        `;
        
        return { systemPrompt, parts };
    }

    // --- STANDARD LOGIC FOR OTHER MODES ---
    
    if (refImagePart) {
        parts.push({ text: "POSE REFERENCE (USE FOR STRUCTURE ONLY):" });
        parts.push(refImagePart);
    }
    
    if (charParts.length > 0) {
        parts.push({ text: "CHARACTER IDENTITY (FACE/OUTFIT):" });
        parts.push(...charParts);
    }

    let systemPrompt = "";

    if (isSingle) {
        systemPrompt = `** SYSTEM: 3D CHARACTER CREATOR **
        Create a stunning 3D game character (Audition Online/Sims style).
        - Detail: 8K, Unreal Engine 5, Raytracing.
        - Context: "${prompt}"`;
    } else {
        systemPrompt = `** SYSTEM: 3D CHARACTER RECONSTRUCTION **
    
        [TASK]: Recreate the character(s) based on the provided Reference Sheets.
        
        [INPUT FORMAT]:
        - Each input image contains the MAIN BODY (Left) and optionally TARGET FACE (Right).
        - If a specific Face is provided, you MUST Swap/Map that face onto the character.
        - If no specific shoes are provided, infer appropriate footwear based on the outfit style.
        
        [MAPPING]:
        - Image 1 -> Character 1 (Left).
        - Image 2 -> Character 2 (Right/Center).
        ${charDescriptions.length > 2 ? '- Image 3 -> Character 3.' : ''}
        ${charDescriptions.length > 3 ? '- Image 4 -> Character 4.' : ''}
        
        [SCENE]: "${prompt}"
        [RENDER]: Unreal Engine 5, 8K, Raytracing, Detailed Texture.`;
    }

    return { systemPrompt, parts };
};

export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, 
    characterDataList: CharacterData[] = [], 
    resolution: string = '2K',
    modelTier: 'flash' | 'pro' = 'pro', 
    useSearch: boolean = false,
    useCloudRef: boolean = false, 
    onProgress?: (msg: string) => void
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    const model = modelTier === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    if (onProgress) onProgress(`Engine: ${model} | Mode: ${useCloudRef ? 'CLOUD NEURAL LINK' : 'STANDARD'}`);

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
            if (onProgress) onProgress(`Processing Player ${char.id}...`);
            
            const textureSheet = await createTextureSheet(
                char.image, 
                char.faceImage, 
                char.shoesImage 
            );
            
            let finalPart;

            if (useCloudRef) {
                try {
                    if (onProgress) onProgress(`Uploading Reference (Player ${char.id})...`);
                    const fileUri = await uploadToGemini(textureSheet, 'image/jpeg');
                    finalPart = {
                        fileData: { mimeType: 'image/jpeg', fileUri: fileUri }
                    };
                } catch (e) {
                     const optimizedSheet = await optimizePayload(textureSheet, 1280); 
                    finalPart = {
                        inlineData: { data: cleanBase64(optimizedSheet), mimeType: 'image/jpeg' }
                    };
                }
            } else {
                const optimizedSheet = await optimizePayload(textureSheet, 1280); 
                finalPart = {
                    inlineData: { data: cleanBase64(optimizedSheet), mimeType: 'image/jpeg' }
                };
            }

            allParts.push(finalPart);
            charDescriptions.push(char.gender);
        }
    }

    const payload = processDigitalTwinMode(prompt, refImagePart, allParts, charDescriptions, modelTier);
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    // Strict system instruction for single mode with ref
    let systemInstruction = "Create high quality 3D character render. Follow the reference image structure.";
    if (characterDataList.length === 1 && styleRefBase64) {
        systemInstruction = "STRICT INSTRUCTION: You are an Image Composition Engine. You MUST combine the IDENTITY (Face, Clothes) of Input A with the POSE/STRUCTURE of Input B. Do not mix them up. The output must strictly follow the pose of Input B.";
    }

    const config: any = {
        imageConfig: { aspectRatio: aspectRatio },
        systemInstruction: systemInstruction,
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    if (modelTier === 'pro') {
        config.imageConfig.imageSize = resolution;
        if (useSearch && !refImagePart) {
            config.tools = [{ googleSearch: {} }];
        }
    }

    if (onProgress) onProgress("Rendering...");

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
                systemInstruction: `You are an AI Prompt Expert. Output ONLY the refined prompt.`,
                temperature: 0.7,
            }
        });
        return response.text?.trim() || currentInput;
    } catch (error) { return currentInput; }
}
