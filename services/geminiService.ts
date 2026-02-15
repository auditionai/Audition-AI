
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";
import { createTextureSheet, optimizePayload, createSolidFence } from "../utils/imageProcessor";

// Define CharacterData interface
export interface CharacterData {
  id: number; // Changed to number to match View
  gender: 'male' | 'female';
  image: string | null;
  faceImage?: string | null;
  shoesImage?: string | null;
  description?: string;
}

// Helper to clean base64 string
const cleanBase64 = (data: string) => {
    if (!data) return '';
    const index = data.indexOf(';base64,');
    if (index !== -1) {
        return data.substring(index + 8);
    }
    return data;
};

// Helper to get AI Client
const getAiClient = async (specificKey?: string) => {
    const key = specificKey || await getSystemApiKey();
    if (!key) throw new Error("API Key missing or invalid");
    return new GoogleGenAI({ apiKey: key });
};

// Extract image from response
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

// Stub for uploadToGemini (Browser implementation limited, fallback to inline)
const uploadToGemini = async (base64Data: string, mimeType: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        
        // 1. Convert Base64 to Blob
        const byteCharacters = atob(cleanBase64(base64Data));
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });

        // 2. Upload using SDK
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
    charDescriptions: string[]
): { systemPrompt: string, parts: any[] } => {
    
    // NOTE: Order matters for Flash model understanding
    // We put Reference Image (Scene/Pose) FIRST, then Character Images.
    const parts = [];
    if (refImagePart) parts.push(refImagePart);
    parts.push(...charParts);

    const isSingle = charDescriptions.length === 1;

    let systemPrompt = "";

    if (isSingle) {
        // --- UPGRADED LOGIC FOR SINGLE IMAGE (STRICT CHARACTER SWAP) ---
        if (refImagePart) {
            systemPrompt = `** SYSTEM: 3D CHARACTER REPLACEMENT ENGINE **
            
            [INPUT ANALYSIS]
            - IMAGE 1 (The Reference): A photo showing a specific POSE and BACKGROUND.
            - IMAGE 2 (The Character): A photo showing the IDENTITY (Face/Outfit) to insert.
            
            [YOUR MISSION]
            1. IGNORE the person in IMAGE 1. Treat them as a placeholder.
            2. EXTRACT the POSE and CAMERA ANGLE from IMAGE 1.
            3. RENDER the Character from IMAGE 2 into that exact pose.
            4. COMPOSITE the new character back into the environment of IMAGE 1.
            
            [CRITICAL CONSTRAINTS FOR FLASH MODEL]
            - DO NOT OUTPUT IMAGE 1 UNCHANGED. You MUST replace the person.
            - If Image 2 has a specific face, the result MUST look like Image 2, not Image 1.
            - Style: High-fidelity 3D Game Render (Unreal Engine 5).
            - NO 2D flat cartoon style. Keep the lighting realistic.
            
            [CONTEXT]: "${prompt}"
            `;
        } else {
            // No Reference Image -> Standard Text-to-Image
            systemPrompt = `** SYSTEM: 3D CHARACTER CREATOR **
            Create a stunning 3D game character (Audition Online/Sims style).
            - Detail: 8K, Unreal Engine 5, Raytracing.
            - Context: "${prompt}"`;
        }
    } else {
        // --- LOGIC FOR COUPLE / GROUP (KEPT STABLE) ---
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
    
    // --- FIXED MODEL SELECTION LOGIC ---
    const model = modelTier === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    if (onProgress) onProgress(`Engine: ${model} | Mode: ${useCloudRef ? 'CLOUD NEURAL LINK' : 'STANDARD'}`);

    // 1. PREPARE STYLE REF (POSE/SCENE)
    let refImagePart = null;
    if (styleRefBase64) {
        refImagePart = {
            inlineData: { data: cleanBase64(styleRefBase64), mimeType: 'image/jpeg' }
        };
    }

    const allParts: any[] = [];
    const charDescriptions: string[] = [];

    // 2. PREPARE CHARACTERS
    for (const char of characterDataList) {
        if (char.image) {
            if (onProgress) onProgress(`Processing Player ${char.id}...`);
            
            // Create the Texture Sheet
            const textureSheet = await createTextureSheet(
                char.image, 
                char.faceImage, 
                char.shoesImage 
            );
            
            let finalPart;

            if (useCloudRef) {
                // STRATEGY A: CLOUD UPLOAD (FILE API)
                try {
                    if (onProgress) onProgress(`Uploading Reference (Player ${char.id})...`);
                    const fileUri = await uploadToGemini(textureSheet, 'image/jpeg');
                    console.log("File URI received:", fileUri);
                    finalPart = {
                        fileData: { mimeType: 'image/jpeg', fileUri: fileUri }
                    };
                } catch (e) {
                    // Fallback to inline if upload fails
                     const optimizedSheet = await optimizePayload(textureSheet, 1280); 
                    finalPart = {
                        inlineData: { data: cleanBase64(optimizedSheet), mimeType: 'image/jpeg' }
                    };
                }
            } else {
                // STRATEGY B: INLINE BASE64
                const optimizedSheet = await optimizePayload(textureSheet, 1280); 
                finalPart = {
                    inlineData: { data: cleanBase64(optimizedSheet), mimeType: 'image/jpeg' }
                };
            }

            allParts.push(finalPart);
            charDescriptions.push(char.gender);
        }
    }

    // 3. BUILD PAYLOAD
    const payload = processDigitalTwinMode(prompt, refImagePart, allParts, charDescriptions);
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { aspectRatio: aspectRatio },
        // ENHANCED INSTRUCTION FOR API LEVEL
        systemInstruction: characterDataList.length === 1 && styleRefBase64
            ? "CRITICAL: YOU ARE REPLACING THE PERSON IN IMAGE 1 WITH THE CHARACTER IN IMAGE 2. DO NOT OUTPUT IMAGE 1 AS IS."
            : "Create high quality 3D character render. Follow the reference image structure.", 
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    // Apply Pro features if model is Pro
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
            model: 'gemini-2.5-flash-image', // Guidelines: Use gemini-2.5-flash-image for editing
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
