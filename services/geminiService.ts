
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

// --- INTELLIGENCE CORE: LOGIC XỬ LÝ PROMPT ĐA TẦNG ---
const processDigitalTwinMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[],
    modelTier: 'flash' | 'pro'
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    
    // --- CHIẾN LƯỢC ĐỒNG BỘ: ÁP DỤNG QUY TRÌNH STRICT (NHÓM) CHO CẢ SINGLE MODE ---
    // Không còn phân biệt Single/Group. Mọi Input đều được xử lý theo mô hình:
    // Input A: Khung xương (Wireframe/Structure)
    // Input B: Danh tính (Identity/Texture)
    
    if (refImagePart) {
        // INPUT A: STRUCTURE (Cấu trúc/Pose)
        // Explicitly label this for Gemini to ignore pixels
        parts.push({ text: "INPUT A [STRUCTURE ONLY]: Use this image purely for POSE ESTIMATION and CAMERA ANGLE. IGNORE all colors, faces, and clothes in this image. It is a wireframe reference." });
        parts.push(refImagePart);
    }
    
    if (charParts.length > 0) {
        // INPUT B: IDENTITY (Định danh)
        parts.push({ text: "INPUT B [IDENTITY REFERENCE]: This texture sheet defines the CHARACTER APPEARANCE (Face, Outfit, Body Type). You MUST use this character." });
        parts.push(...charParts);
    }

    // --- SYSTEM INSTRUCTION ---
    // Viết lại hoàn toàn để ép buộc model tuân thủ quy trình RE-RENDER
    
    let systemPrompt = "";

    if (refImagePart) {
        // TRƯỜNG HỢP CÓ ẢNH MẪU (Bất kể Single hay Group)
        // Bắt buộc AI phải RE-RENDER, cấm copy ảnh mẫu
        systemPrompt = `** MISSION: 3D CHARACTER RENDERING (STRICT MODE) **
        
        [RULES - DO NOT IGNORE]:
        1. DO NOT return Input A. Input A is only for POSE/COMPOSITION.
        2. YOU MUST RENDER A NEW IMAGE from scratch.
        3. IDENTITY SOURCE: The character appearance comes ONLY from Input B.
        4. If Input A contains a human, REPLACE them completely with the character from Input B.
        5. STYLE: 8K, Unreal Engine 5, Highly Detailed, 3D Game Render.
        
        [CONTEXT]: ${prompt}
        `;
    } else {
        // TRƯỜNG HỢP CHUẨN (Không ảnh mẫu)
        systemPrompt = `** MISSION: 3D CHARACTER GENERATION **
        Create a stunning 3D game character (Audition Online style).
        - Detail: 8K, Unreal Engine 5, Raytracing.
        - Context: "${prompt}"
        ${charParts.length > 0 ? '- IDENTITY: Strictly follow the character sheet provided in Input B.' : ''}
        `;
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
    
    if (onProgress) onProgress(`Engine: ${model} | Mode: STRICT COMPOSITING`);

    // 1. Process Pose Reference (Input A)
    let refImagePart = null;
    if (styleRefBase64) {
        // NOTE: styleRefBase64 should already be the "Solid Fence" processed version from UI
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
            
            // Tạo Texture Sheet: Ghép Body + Face vào 1 ảnh duy nhất để Flash 2.5 không bị loạn
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
                     // Fallback to inline if upload fails
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
    // FORCE SINGLE MODE TO USE THE EXACT SAME LOGIC AS GROUP MODE
    const payload = processDigitalTwinMode(prompt, refImagePart, allParts, charDescriptions, modelTier);
    
    // Đảo ngược thứ tự: Instruction cuối cùng để AI nhớ rõ nhất (Recency Bias)
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { aspectRatio: aspectRatio },
        // Simple but forceful system instruction for the Config object
        systemInstruction: "You are an advanced 3D Rendering AI. You strictly separate STRUCTURE (Pose) from IDENTITY (Appearance). Never confuse the two inputs.",
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    if (modelTier === 'pro') {
        config.imageConfig.imageSize = resolution;
        // Chỉ dùng Google Search khi KHÔNG CÓ ảnh mẫu, để tránh nhiễu
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
