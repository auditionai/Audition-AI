
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";
import { createSolidFence, optimizePayload, createTextureSheet } from "../utils/imageProcessor";

// --- CONFIGURATION & HELPERS ---

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

// Helper to strictly clean base64 string
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
    description?: string;
}

// --- MODULE 2: STRATEGY IMPLEMENTATIONS (DIGITAL TWIN PROTOCOL V4 - TEXTURE SHEET) ---

const processDigitalTwinMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[]
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [...charParts]; // These are now Texture Sheets
    if (refImagePart) parts.push(refImagePart);

    let systemPrompt = `** PROTOCOL: 3D PHOTOGRAMMETRY & TEXTURE BAKING **
    
    [ROLE]: You are a 3D Texture Mapping Engine (Not a creative artist).
    [TASK]: Transfer the textures from the Input Sheets onto a 3D Mesh.
    
    [INPUT DATA EXPLANATION]:
    - Images 1 to ${charParts.length} are "TEXTURE SHEETS".
    - LEFT SIDE of Sheet = Full Body Reference.
    - RIGHT TOP of Sheet = FACE TEXTURE (High Res).
    - RIGHT BOTTOM of Sheet = SHOE/PANTS TEXTURE (High Res).
    
    [STRICT EXECUTION RULES]:
    1. **NO REDRAWING**: Do not invent new clothes. "Bake" the pixels from the Sheet onto the output character.
    2. **SHOE MANDATE**: Look at the Bottom-Right of each input sheet. Those are the shoes. If they are sandals, render sandals. If sneakers, render sneakers.
    3. **FACE CLONING**: Look at the Top-Right of each input sheet. Reconstruct that face exactly.
    4. **GROUP CONSISTENCY**:
       - Input Image 1 -> Player 1 (Leftmost).
       - Input Image 2 -> Player 2.
       - Input Image 3 -> Player 3...
       - Do not mix up their clothes.
    
    [SCENE]: "${prompt}"
    [STYLE]: Unreal Engine 5, 8K, Raytracing, Hyper-Realistic Textures.`;

    return { systemPrompt, parts };
};

// --- MAIN CONTROLLER ---

export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, 
    characterDataList: CharacterData[] = [], 
    resolution: string = '2K',
    useSearch: boolean = false,
    onProgress?: (msg: string) => void
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    const isPro = resolution === '2K' || resolution === '4K';
    const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    if (onProgress) onProgress(`Engine: ${model} | Scanning Texture Sheets...`);

    // 2. PREPARE ASSETS
    let refImagePart = null;
    if (styleRefBase64) {
        // Pose Reference doesn't need to be a sheet, just optimized
        const fencedData = await createSolidFence(styleRefBase64, aspectRatio, true);
        const optData = await optimizePayload(fencedData, 1024);
        refImagePart = {
            inlineData: { data: cleanBase64(optData), mimeType: 'image/jpeg' }
        };
    }

    const allParts: any[] = [];
    const charDescriptions: string[] = [];

    // --- PRE-PROCESSING: CREATING TEXTURE SHEETS ---
    for (const char of characterDataList) {
        if (char.image) {
            if (onProgress) onProgress(`Generating ID Card for Player ${char.id}...`);
            
            // 1. Create the Composite Sheet (Full + Face + Shoes)
            // This is the "Nuclear Option" for consistency
            const textureSheet = await createTextureSheet(char.image);
            
            // 2. Optimize the Sheet (It might be large now)
            const optimizedSheet = await optimizePayload(textureSheet, 1280); // Allow slightly larger for sheets

            allParts.push({
                inlineData: { data: cleanBase64(optimizedSheet), mimeType: 'image/jpeg' }
            });

            charDescriptions.push(char.gender);
        }
    }

    // 3. ROUTE STRATEGY (UNIFIED)
    // We now use the same robust strategy for Single, Couple, and Group
    const payload = processDigitalTwinMode(prompt, refImagePart, allParts, charDescriptions);

    // 4. CONSTRUCT FINAL CONFIG
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { aspectRatio: aspectRatio },
        systemInstruction: "You are a 3D Scanner. Copy input pixels exactly. Do not hallucinate clothes.", 
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    if (isPro) {
        config.imageConfig.imageSize = resolution;
        if (useSearch && !refImagePart) {
            config.tools = [{ googleSearch: {} }];
        }
    }

    if (onProgress) onProgress("Rendering Digital Twin (V4 Protocol)...");

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

// --- UTILS REMAIN UNCHANGED ---

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
    
    // Strict Edit Prompt
    let instructionText = `TASK: EDIT IMAGE. 
    INSTRUCTION: ${prompt}. 
    CONSTRAINT: Keep all other details unchanged.`;
    
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
