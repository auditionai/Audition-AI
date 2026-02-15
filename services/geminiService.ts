
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";
import { createSolidFence, optimizePayload, createTextureSheet } from "../utils/imageProcessor";

const getDynamicApiKey = async (): Promise<string> => {
    const dbKey = await getSystemApiKey();
    if (dbKey && dbKey.trim().length > 0) return dbKey.trim();
    return process.env.API_KEY || "";
};

const getAiClient = async () => {
    const key = await getDynamicApiKey();
    if (!key) throw new Error("Hệ thống chưa có API Key.");
    return new GoogleGenAI({ apiKey: key });
};

const cleanBase64 = (data: string): string => {
    if (!data) return "";
    if (data.includes(',')) {
        return data.split(',')[1];
    }
    return data;
};

const extractImage = (response: any): string | null => {
  if (response.candidates && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

interface CharacterData {
    id: number;
    gender: 'male' | 'female';
    image: string | null; 
    faceImage?: string | null;
    shoesImage?: string | null; // Made optional again
    description?: string;
}

// --- NEW: GOOGLE FILE API UPLOADER ---
// Converts Base64 to Blob and uploads to Google GenAI Files
const uploadToGemini = async (base64Data: string, mimeType: string = 'image/jpeg'): Promise<string> => {
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
        // NOTE: The SDK supports `ai.files.upload` in newer versions.
        const uploadResult = await ai.files.upload({
            file: blob,
            config: { 
                displayName: `texture_sheet_${Date.now()}` 
            }
        });

        // SAFE ACCESS TO URI: Handle SDK response variations
        // Some versions return { file: { uri: ... } }, others return { uri: ... } directly
        const fileUri = (uploadResult as any).file?.uri || (uploadResult as any).uri;
        
        if (!fileUri) {
            console.error("Upload Result Structure:", uploadResult);
            throw new Error("Không lấy được File URI từ Google Cloud.");
        }

        return fileUri;
    } catch (e) {
        console.error("Gemini File Upload Failed", e);
        throw new Error("Failed to upload reference image to Google Cloud.");
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
        // --- FIXED LOGIC FOR SINGLE IMAGE ---
        systemPrompt = `** SYSTEM: PROFESSIONAL 3D CHARACTER ARTIST **
        
        [TASK]: Create a high-quality 3D render of the character provided in the input reference.
        
        [INPUT ANALYSIS]:
        - The input image is a REFERENCE SHEET containing the character's design.
        - DO NOT output the reference sheet. DO NOT output a collage.
        - Treat the input image purely as information about outfit and face.
        
        [OUTPUT REQUIREMENTS]:
        - Generate EXACTLY ONE single image of the character.
        - Style: Semi-realistic 3D, Blind Box aesthetics, Audition Online style, Unreal Engine 5 render.
        - Skin: Smooth, glowing, no realistic human pores.
        - Eyes: Large, expressive, anime-styled 3D.
        - Composition: Full body or 3/4 view based on the prompt.
        
        [SCENE]: "${prompt}"
        
        [STRICT NEGATIVE CONSTRAINTS]:
        - NO real humans, NO photorealism.
        - NO split screens, NO grids, NO text, NO UI elements.
        - NO blurry faces, NO distorted limbs.
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
    modelTier: 'flash' | 'pro' = 'pro', // NEW ARGUMENT
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

    // 1. PREPARE STYLE REF (POSE)
    let refImagePart = null;
    if (styleRefBase64) {
        // For single image, ensure the pose ref doesn't confuse the layout
        const fencedData = await createSolidFence(styleRefBase64, aspectRatio, true);
        const optData = await optimizePayload(fencedData, 1024);
        refImagePart = {
            inlineData: { data: cleanBase64(optData), mimeType: 'image/jpeg' }
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
                if (onProgress) onProgress(`Uploading Reference (Player ${char.id})...`);
                const fileUri = await uploadToGemini(textureSheet, 'image/jpeg');
                console.log("File URI received:", fileUri);
                finalPart = {
                    fileData: { mimeType: 'image/jpeg', fileUri: fileUri }
                };
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
            ? "You are a professional 3D Character Designer. Generate a single, high-quality 3D render. No collages."
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

// ... existing utils (editImageWithInstructions, etc.) remain unchanged ...
export const editImageWithInstructions = async (
  imageBase64: string,
  prompt: string,
  mimeType: string = "image/jpeg",
  styleRefBase64?: string
): Promise<string | null> => {
  try {
    const ai = await getAiClient();
    const model = 'gemini-2.5-flash-image'; 
    
    const cleanMain = cleanBase64(imageBase64);
    const parts: any[] = [{ inlineData: { data: cleanMain, mimeType: mimeType } }];
    
    let instructionText = `TASK: EDIT IMAGE. INSTRUCTION: ${prompt}. CONSTRAINT: Keep all other details unchanged.`;
    
    if (styleRefBase64) {
        const cleanStyle = cleanBase64(styleRefBase64);
        parts.push({ inlineData: { data: cleanStyle, mimeType: 'image/jpeg' } });
        instructionText += ` STYLE SOURCE: Image 2. Apply style from Image 2 to Image 1.`;
    }
    parts.push({ text: instructionText });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: parts }
    });

    return extractImage(response);
  } catch (error) { throw error; }
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

export const checkConnection = async (testKey?: string): Promise<boolean> => {
  try {
    const key = testKey ? testKey.trim() : (await getDynamicApiKey()).trim();
    if (!key) return false;
    const ai = new GoogleGenAI({ apiKey: key });
    await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: 'ping' }] },
      config: { maxOutputTokens: 1 }
    });
    return true;
  } catch (error) { return false; }
}
