
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

// --- INTELLIGENCE CORE: LOGIC XỬ LÝ PROMPT ĐA TẦNG (DIGITAL TWIN) ---
const processDigitalTwinMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[],
    modelTier: 'flash' | 'pro'
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];

    // --- CHIẾN LƯỢC: PHÂN TÁCH "SCENE CONTAINER" VÀ "CONTENT FILLER" ---
    
    if (refImagePart) {
        // INPUT A: SCENE CONTAINER
        parts.push({ text: ">>> INPUT A [SCENE_CONTAINER]: Contains the Background, Lighting, Camera Angle, and Pose. DO NOT CHANGE THE BACKGROUND." });
        parts.push(refImagePart);
    }
    
    if (charParts.length > 0) {
        // INPUT B: CONTENT FILLER
        parts.push({ text: ">>> INPUT B [CHARACTER_ID_SHEET]: Contains the visual identity (Face, Outfit, Body Shape) to be inserted." });
        parts.push(...charParts);
    }

    // --- SYSTEM INSTRUCTION ---
    // Ra lệnh cực mạnh để ép model thực hiện thao tác "Swap" thay vì "Generate"
    
    let systemPrompt = "";

    if (refImagePart && charParts.length > 0) {
        // TRƯỜNG HỢP: CÓ CẢ ẢNH MẪU VÀ NHÂN VẬT (SWAP MODE)
        systemPrompt = `** MISSION: DEEP CHARACTER SWAP & RENDER **
        
        [STRICT EXECUTION PROTOCOL]:
        1. ANALYZE Input A: Lock the Background, Lighting, Shadows, and the Pose of the subject.
        2. ERASE: Mentally remove the person and clothes currently in Input A.
        3. INSERT: Take the character from Input B (Face + Outfit) and place them into the scene of Input A.
        4. MATCH: The character from Input B must adopt the EXACT pose from Input A.
        5. BLEND: Apply the lighting and shadows from Input A onto the character from Input B.
        
        [CONSTRAINTS]:
        - DO NOT change the Background or Lighting of Input A.
        - DO NOT invent new clothes. You MUST copy the outfit from Input B exactly (100% Copy).
        - DO NOT mix the faces. Use the face from Input B.
        
        [CONTEXT]: ${prompt}
        `;
    } else if (!refImagePart && charParts.length > 0) {
        // TRƯỜNG HỢP: CHỈ CÓ NHÂN VẬT (GENERATION MODE)
        systemPrompt = `** MISSION: 3D CHARACTER RENDER **
        Generate a high-fidelity 3D character based on Input B.
        - OUTFIT & FACE: 100% Copy from Input B.
        - STYLE: 8K, Unreal Engine 5, Raytracing, Audition Online Style.
        - Context: "${prompt}"
        `;
    } else {
        // TRƯỜNG HỢP: TEXT ONLY
        systemPrompt = `Create a stunning 3D game character (Audition Online style). Context: ${prompt}`;
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
    
    if (onProgress) onProgress(`Engine: ${model} | Mode: DEEP SWAP`);

    // 1. Process Pose Reference (Input A)
    let refImagePart = null;
    if (styleRefBase64) {
        // styleRefBase64 đã được xử lý qua createSolidFence (resize/padding)
        refImagePart = {
            inlineData: { data: cleanBase64(styleRefBase64), mimeType: 'image/jpeg' }
        };
    }

    // 2. Process Character Identity (Input B)
    const allParts: any[] = [];
    const charDescriptions: string[] = [];

    for (const char of characterDataList) {
        if (char.image) {
            if (onProgress) onProgress(`Building Identity Sheet (Player ${char.id})...`);
            
            // Tạo Texture Sheet: Ghép Body + Face
            const textureSheet = await createTextureSheet(
                char.image, 
                char.faceImage, 
                char.shoesImage 
            );
            
            let finalPart;

            if (useCloudRef) {
                try {
                    if (onProgress) onProgress(`Uploading Identity (Player ${char.id})...`);
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

    // 3. Construct Payload
    const payload = processDigitalTwinMode(prompt, refImagePart, allParts, charDescriptions, modelTier);
    
    // Đảo ngược thứ tự: Instruction cuối cùng để AI nhớ rõ nhất
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { aspectRatio: aspectRatio },
        systemInstruction: "You are a specialized Image Compositor AI. Your only goal is to swap the character from Input B into the scene of Input A while maintaining 100% fidelity to the Source Identity (B) and the Source Scene (A).",
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    if (modelTier === 'pro') {
        config.imageConfig.imageSize = resolution;
        // Chỉ dùng Google Search khi KHÔNG CÓ ảnh mẫu
        if (useSearch && !refImagePart) {
            config.tools = [{ googleSearch: {} }];
        }
    }

    if (onProgress) onProgress("Rendering (This may take 10-15s)...");

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
