
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

// --- INTELLIGENCE CORE: LOGIC XỬ LÝ PROMPT ĐA TẦNG (UPGRADED V2) ---
const processDigitalTwinMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[],
    modelTier: 'flash' | 'pro'
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    
    // --- CHIẾN LƯỢC ĐỒNG BỘ: ÁP DỤNG QUY TRÌNH STRICT (NHÓM) CHO CẢ SINGLE MODE ---
    
    if (refImagePart) {
        // INPUT A: STRUCTURE (Cấu trúc/Pose)
        parts.push({ text: "INPUT A [STRUCTURE ONLY]: Use this image purely for POSE ESTIMATION and CAMERA ANGLE. IGNORE the face in this image." });
        parts.push(refImagePart);
    }
    
    if (charParts.length > 0) {
        // INPUT B: IDENTITY (Định danh) - SUPER PRO SCAN MODE
        parts.push({ text: `
        INPUT B [DEEP FACE SCAN DATA]: 
        This is the MASTER SOURCE for the character's identity. 
        
        ** SCANNING PROTOCOL (EXECUTE IMMEDIATELY): **
        1.  **ACCESSORIES SCAN**: Detect ALL piercings (nose rings, bridge piercings, lip rings, brow bars), ear accessories, and eyewear. YOU MUST RENDER THESE EXACTLY.
        2.  **MAKEUP ANALYSIS**: Map the exact makeup style. Look for:
            - Eyeliner wings (sharp, smoked out, graphic).
            - Eyeshadow gradients and colors.
            - Lipstick texture (matte vs glossy) and color.
            - Face paint, decals, or stickers on cheeks/forehead.
        3.  **FEATURES TOPOGRAPHY**: Analyze the unique eye shape (anime/stylized), iris color, eyebrow slant, and jawline.
        4.  **EXPRESSION**: Capture the micro-expression (smirk, glare, pout) from the face reference.

        CRITICAL: The character in the output MUST have this exact face. Do not humanize if the input is a stylized 3D doll. Keep the "Game Character" aesthetic.
        ` });
        parts.push(...charParts);
    }

    // --- SYSTEM INSTRUCTION (V2 - AGGRESSIVE FACE COPY) ---
    
    let systemPrompt = "";

    if (refImagePart) {
        // TRƯỜNG HỢP CÓ ẢNH MẪU POSE
        systemPrompt = `** MISSION: 3D CHARACTER RECONSTRUCTION (VIP FACE LOCK) **
        
        [STRICT EXECUTION RULES]:
        1. POSE: Taken strictly from Input A.
        2. FACE & IDENTITY: Taken strictly from Input B (The Scan Data).
        3. FUSION STRATEGY: You are a 3D Modeler using "Texture Projection". You must project the face details from Input B onto the 3D model in the pose of Input A.
        4. DETAIL RETENTION:
           - If Input B has a nose ring, the output MUST have a nose ring.
           - If Input B has heavy gothic makeup, the output MUST have heavy gothic makeup.
           - Do not simplify the design.
        5. STYLE: 8K, Unreal Engine 5, Octane Render, High Fidelity Game Asset.
        
        [CONTEXT]: ${prompt}
        `;
    } else {
        // TRƯỜNG HỢP CHUẨN (Không ảnh mẫu Pose)
        systemPrompt = `** MISSION: 3D CHARACTER GENERATION (VIP FACE LOCK) **
        Create a high-end 3D game character.
        
        [IDENTITY ENFORCEMENT]:
        - The face MUST be a perfect replica of the character provided in Input B.
        - Pay extreme attention to: Piercings, Makeup Layers, Face Tattoos/Markings, and Eye Design.
        - The goal is 95-100% likeness retention for facial features.
        
        - Style: Unreal Engine 5, Raytracing, Audition Online Style (Updated).
        - Context: "${prompt}"
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
    _modelTier: 'flash' | 'pro' = 'pro', // Deprecated param
    useSearch: boolean = true, // Default ON
    useCloudRef: boolean = true, // Default ON
    onProgress?: (msg: string) => void
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    // FORCE PRO MODEL - Deprecated Flash for Image Generation
    const model = 'gemini-3-pro-image-preview';
    
    if (onProgress) onProgress(`Engine: ${model} | Mode: DEEP FACE SCAN`);

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
            if (onProgress) onProgress(`Scanning Identity Features (Player ${char.id})...`);
            
            // Tạo Texture Sheet: Ghép Body + Face vào 1 ảnh duy nhất để Flash 2.5 không bị loạn
            // Vẫn dùng hàm này vì nó đã tách biệt Face sang một bên, giúp AI dễ "Scan" hơn
            const textureSheet = await createTextureSheet(
                char.image, 
                char.faceImage, 
                char.shoesImage 
            );
            
            let finalPart;

            if (useCloudRef) {
                try {
                    if (onProgress) onProgress(`Uploading High-Res Identity (Player ${char.id})...`);
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
    // Always use 'pro' logic
    const payload = processDigitalTwinMode(prompt, refImagePart, allParts, charDescriptions, 'pro');
    
    // Đảo ngược thứ tự: Instruction cuối cùng để AI nhớ rõ nhất (Recency Bias)
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { 
            aspectRatio: aspectRatio,
            imageSize: resolution // Always available in Pro
        },
        // Simple but forceful system instruction for the Config object
        systemInstruction: "You are an advanced 3D Character Artist. You specialize in replicating complex facial features, makeup, and piercings from reference images. Pixel-perfect accuracy for face details is required.",
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    // Chỉ dùng Google Search khi KHÔNG CÓ ảnh mẫu, để tránh nhiễu
    if (useSearch && !refImagePart) {
        config.tools = [{ googleSearch: {} }];
    }

    if (onProgress) onProgress("Reconstructing 3D Model...");

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
