
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";
import { createSolidFence, optimizePayload } from "../utils/imageProcessor";

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

// --- MODULE 2: STRATEGY IMPLEMENTATIONS (DIGITAL TWIN PROTOCOL V2) ---

/**
 * STRATEGY 1: SINGLE MODE - "The 3D Scan"
 */
const processSingleMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[]
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    
    // LOGIC: Image 1 is ALWAYS the Identity Source (Face + Clothes)
    if (charParts[0]) parts.push(charParts[0]);
    
    // If there is a background/pose ref, it becomes Image 2
    if (refImagePart) parts.push(refImagePart);

    const systemPrompt = `** PROTOCOL: FULL BODY PHOTOGRAMMETRY **
    
    [ROLE]: You are a high-precision 3D Scanner.
    [INPUT]: 
    - IMAGE 1: [SOURCE_IDENTITY] (Full Body Shot).
    ${refImagePart ? '- IMAGE 2: [POSE_GUIDE] (Skeleton reference).' : ''}
    
    [SCANNING SEQUENCE]:
    1. **FACE SCAN**: Capture facial features, hair style, and hair color.
    2. **BODY SCAN**: Capture the exact outfit (Top, Bottom).
    3. **FEET SCAN**: Look at the BOTTOM of Image 1. Capture the SHOES/FOOTWEAR exactly.
    
    [EXECUTION]:
    - Transfer the scanned 3D mesh (Face + Outfit + Shoes) to the new scene.
    - If the Source Image is cropped, hallucinate matching shoes.
    - BUT IF SHOES ARE VISIBLE in Image 1, YOU MUST COPY THEM.
    
    [STRICT CONSTRAINTS]:
    - DO NOT CHANGE THE SHOES.
    - DO NOT CHANGE THE FACE.
    - Action: "${prompt}"
    
    Style: High Fidelity 3D Render, Unreal Engine 5.`;

    return { systemPrompt, parts };
};

/**
 * STRATEGY 2: COUPLE MODE - "Texture Swapping"
 */
const processCoupleMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[]
): { systemPrompt: string, parts: any[] } => {

    const parts = [];
    
    if (refImagePart) parts.push(refImagePart);
    charParts.forEach(p => parts.push(p));

    const p1Idx = refImagePart ? 2 : 1;
    const p2Idx = refImagePart ? 3 : 2;

    const systemPrompt = `** PROTOCOL: MULTI-CHARACTER SCAN **
    
    [SOURCE DATA]:
    - CHARACTER A: IMAGE ${p1Idx}.
    - CHARACTER B: IMAGE ${p2Idx}.
    
    [VISUAL ENFORCEMENT]:
    1. **CHARACTER A**: Copy Outfit + SHOES from Image ${p1Idx}.
    2. **CHARACTER B**: Copy Outfit + SHOES from Image ${p2Idx}.
    3. **ATTENTION**: Look at the very bottom of the source images for footwear.
    
    [INTERACTION]: "${prompt}"
    
    Style: Romantic 3D Game Art, Audition Style.`;

    return { systemPrompt, parts };
};

/**
 * STRATEGY 3: GROUP MODE
 */
const processGroupMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[]
): { systemPrompt: string, parts: any[] } => {

    const parts = [];
    if (refImagePart) parts.push(refImagePart);
    charParts.forEach(p => parts.push(p));

    const startIndex = refImagePart ? 2 : 1;

    // Strict mapping list
    const mapping = charDescriptions.map((gender, i) => 
        `MEMBER ${i+1}: Scan IMAGE ${startIndex + i} for Full Outfit & Shoes.`
    ).join('\n');

    const systemPrompt = `** PROTOCOL: SQUAD REPLICATION **
    
    [STRICT MAPPING]:
    ${mapping}
    
    [INSTRUCTIONS]:
    1. For each member, COPY pixels from Head to Toe.
    2. Ensure SHOES match the source image.
    3. Context: "${prompt}"
    
    Style: Cool, Energetic, Game Promo Art.`;

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
    
    if (onProgress) onProgress(`Engine: ${model} | Scanning Inputs...`);

    // 2. PREPARE ASSETS
    let refImagePart = null;
    if (styleRefBase64) {
        // Pose Ref: Use strict aspect ratio matching for the pose guide
        const fencedData = await createSolidFence(styleRefBase64, aspectRatio, true);
        refImagePart = {
            inlineData: { data: cleanBase64(fencedData), mimeType: 'image/jpeg' }
        };
    }

    const charParts: any[] = [];
    const charDescriptions: string[] = [];

    for (const char of characterDataList) {
        if (char.image) {
            // STEP: ADAPTIVE FENCE
            // We pass "1:1" but the function ignores it for character inputs 
            // and uses the image's own aspect ratio to prevent shoe cropping.
            const fencedData = await createSolidFence(char.image, "1:1", false);
            
            // We optimized AFTER fencing to ensure the whole fence fits
            const optimizedFence = await optimizePayload(fencedData, 1024); 
            
            charParts.push({
                inlineData: { data: cleanBase64(optimizedFence), mimeType: 'image/jpeg' }
            });
            charDescriptions.push(char.gender);
        } else {
            charParts.push(null);
            charDescriptions.push(char.gender);
        }
    }

    const validCharParts = charParts.filter(p => p !== null);

    // 3. ROUTE STRATEGY
    let payload;
    const modeCount = characterDataList.length;

    if (modeCount === 1) {
        payload = processSingleMode(prompt, refImagePart, validCharParts, charDescriptions);
    } else if (modeCount === 2) {
        payload = processCoupleMode(prompt, refImagePart, validCharParts, charDescriptions);
    } else {
        payload = processGroupMode(prompt, refImagePart, validCharParts, charDescriptions);
    }

    // 4. CONSTRUCT FINAL CONFIG
    const globalSystemInstruction = `
    CRITICAL OVERRIDE:
    You are a 3D Scanning Utility. 
    1. SCAN the Source Image from TOP (Hair) to BOTTOM (Shoes).
    2. DO NOT CROP the character. If the source image is vertical, read the shoes at the bottom.
    3. REPLICATE the shoes exactly.
    4. Maintain the Face Identity strictly.
    `;

    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { aspectRatio: aspectRatio },
        systemInstruction: globalSystemInstruction, 
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    if (isPro) {
        config.imageConfig.imageSize = resolution;
        if (useSearch && !refImagePart && characterDataList.every(c => !c.image)) {
            config.tools = [{ googleSearch: {} }];
        }
    }

    if (onProgress) onProgress("Executing Full Body Transfer...");

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
