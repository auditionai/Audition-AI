
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
    
    const parts = [...charParts]; 
    if (refImagePart) parts.push(refImagePart);

    const isSingle = charDescriptions.length === 1;

    let systemPrompt = "";

    if (isSingle) {
        // --- FIXED LOGIC FOR SINGLE IMAGE (SCENE RECONSTRUCTION) ---
        systemPrompt = `** SYSTEM: 3D SCENE RECONSTRUCTION & CHARACTER ARTIST **
        
        [TASK]: You are an expert 3D Artist. Recreate the input image as a high-end 3D Game Render (Unreal Engine 5 Style).
        
        [CRITICAL INSTRUCTION - COMPOSITION & CAMERA]:
        - COPY the Camera Angle, Field of View, and Framing from the Reference Image EXACTLY.
        - If Reference is Portrait/Close-up -> Output Portrait/Close-up.
        - If Reference is Full Body -> Output Full Body.
        - If Reference is Dutch Angle/Low Angle -> Copy it.
        
        [CRITICAL INSTRUCTION - BACKGROUND]:
        - Analyze the background in the Reference Image (lights, furniture, atmosphere, darkness).
        - RECONSTRUCT the same environment in 3D.
        - DO NOT use a plain or studio background unless the reference has one.
        - Match the lighting mood (e.g., dark bar, neon lights, sunny park, bedroom).
        
        [CHARACTER]:
        - Style: Stylized 3D, semi-realistic anime features (Audition Online / Sims 4 Alpha CC style).
        - Skin: Smooth, glowing, no realistic human pores.
        - Outfit: Match the reference outfit exactly based on the texture sheet provided.
        
        [SCENE]: "${prompt}"
        
        [STRICT NEGATIVE CONSTRAINTS]:
        - NO real humans, NO photorealism.
        - NO collage, NO grid, NO split-screen.
        - NO text, NO UI elements.
        - NO plain background (unless reference is plain).
        `;
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
    // Flash always uses 'gemini-2.5-flash-image'
    // Pro always uses 'gemini-3-pro-image-preview' (even at 1K)
    const model = modelTier === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    if (onProgress) onProgress(`Engine: ${model} | Mode: ${useCloudRef ? 'CLOUD NEURAL LINK' : 'STANDARD'}`);

    // 1. PREPARE STYLE REF (POSE/SCENE)
    let refImagePart = null;
    if (styleRefBase64) {
        // Note: For Single Mode, styleRefBase64 is passed RAW (optimized) from the view to preserve background.
        // For Group Mode, it is passed FENCED (gray bg).
        // We just wrap it here.
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
        // Use a clearer system instruction for the API config as well
        systemInstruction: characterDataList.length === 1 
            ? "You are a professional 3D Scene Artist. Recreate the photo in 3D style. Match Composition and Background."
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
        // Only set imageSize for Pro model
        config.imageConfig.imageSize = resolution;
        
        // Add Search tool if requested and NO style ref (to avoid conflicts)
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
