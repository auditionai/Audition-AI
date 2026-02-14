
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

// --- MODULE 2: STRATEGY IMPLEMENTATIONS (DIGITAL TWIN PROTOCOL) ---

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

    const systemPrompt = `** PROTOCOL: PHOTOGRAMMETRY RECONSTRUCTION **
    
    [ROLE]: You are NOT an artist. You are a 3D TEXTURE PROJECTION ENGINE.
    [TASK]: Project the texture and geometry from SOURCE IMAGE onto a new pose.
    
    [INPUT MAPPING]:
    - IMAGE 1: [SOURCE_MATERIAL] (Contains strict Face, Hair, Outfit, Shoes).
    ${refImagePart ? '- IMAGE 2: [POSE_GUIDE] (Skeleton reference only).' : ''}
    
    [STRICT EXECUTION RULES]:
    1. **CLONING**: You MUST CLONE the character from [SOURCE_MATERIAL] exactly.
    2. **OUTFIT LOCK**: 
       - DO NOT DESIGN NEW CLOTHES.
       - DO NOT CHANGE COLORS.
       - DO NOT CHANGE SHOES.
       - If the source has a logo/pattern, KEEP IT.
    3. **OUTPUT**:
       - Render the character from [SOURCE_MATERIAL] performing action: "${prompt}".
       - Retain 100% of the visual identity (Face + Clothes) from Image 1.
    
    [NEGATIVE CONSTRAINTS]:
    - NO redesign, NO fashion changes, NO random accessories.
    - NO deviation from source image pixels.
    
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
    
    // Order: Img 1 (Bg/Pose - optional), Img 2 (P1), Img 3 (P2)
    // To make it strict, we define slots clearly.
    
    if (refImagePart) parts.push(refImagePart);
    charParts.forEach(p => parts.push(p));

    const p1Idx = refImagePart ? 2 : 1;
    const p2Idx = refImagePart ? 3 : 2;

    const systemPrompt = `** PROTOCOL: MULTI-CHARACTER COMPOSITING **
    
    [TASK]: Render 2 distinct characters in a scene.
    
    [SOURCE DATA]:
    - CHARACTER A: Derived STRICTLY from IMAGE ${p1Idx}.
    - CHARACTER B: Derived STRICTLY from IMAGE ${p2Idx}.
    ${refImagePart ? '- SCENE/POSE: Derived from IMAGE 1.' : ''}
    
    [VISUAL ENFORCEMENT]:
    1. **CHARACTER A**: Must wear the EXACT outfit found in IMAGE ${p1Idx}. Copy pixels for shirt, pants, shoes.
    2. **CHARACTER B**: Must wear the EXACT outfit found in IMAGE ${p2Idx}. Copy pixels for shirt, pants, shoes.
    3. **INTERACTION**: "${prompt}"
    
    [CRITICAL WARNING]:
    - DO NOT MIX OUTFITS. 
    - DO NOT HALLUCINATE NEW CLOTHES.
    - IF IMAGE SHOWS A SPECIFIC SHIRT, RENDER THAT SPECIFIC SHIRT.
    
    Style: Romantic 3D Game Art, Audition Style.`;

    return { systemPrompt, parts };
};

/**
 * STRATEGY 3: GROUP MODE - "Batch Processing"
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
        `MEMBER ${i+1}: Use IMAGE ${startIndex + i} as absolute Ground Truth for Outfit & Face.`
    ).join('\n');

    const systemPrompt = `** PROTOCOL: SQUAD REPLICATION **
    
    [TASK]: Render a group of ${charDescriptions.length} characters.
    
    [STRICT MAPPING]:
    ${mapping}
    
    [INSTRUCTIONS]:
    1. For each member, IGNORE internal creativity. USE VISUAL LOOKUP from their assigned Image.
    2. Maintain height differences and body types from source images.
    3. Context: "${prompt}"
    ${refImagePart ? '4. Use IMAGE 1 as Scene Background.' : ''}
    
    [FAIL CONDITION]:
    - Changing any character's outfit results in failure.
    
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
    
    // 1. SELECT MODEL
    const isPro = resolution === '2K' || resolution === '4K';
    const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    if (onProgress) onProgress(`Protocol: Digital Twin | Model: ${model}`);

    // 2. PREPARE ASSETS
    let refImagePart = null;
    if (styleRefBase64) {
        // Background/Structure ref (1024px)
        const optimizedRef = await optimizePayload(styleRefBase64, 1024);
        refImagePart = {
            inlineData: { data: cleanBase64(optimizedRef), mimeType: 'image/jpeg' }
        };
    }

    const charParts: any[] = [];
    const charDescriptions: string[] = [];

    for (const char of characterDataList) {
        if (char.image) {
            // STEP: MAX VISUAL FIDELITY
            // We use 1024px for character refs to ensure small details (logos, shoe laces) are visible
            // Standard Solid Fence to isolate the subject
            const fencedData = await createSolidFence(char.image, "1:1", false);
            const optimizedFence = await optimizePayload(fencedData, 1024); // Force High Res Input
            
            charParts.push({
                inlineData: { data: cleanBase64(optimizedFence), mimeType: 'image/jpeg' }
            });
            charDescriptions.push(char.gender);
        } else {
            // Placeholder for missing inputs
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

    // 4. CONSTRUCT FINAL CONFIG (THE "BRUTAL" PART)
    // We inject a high-level system instruction to override model bias.
    const globalSystemInstruction = `
    CRITICAL OVERRIDE:
    You are a 3D Scanning Utility. Your goal is REPLICATION, NOT CREATION.
    When provided with reference images containing people, you MUST:
    1. EXTRACT the exact outfit (Shirt, Pants, Shoes, Accessories).
    2. RE-APPLY that outfit onto the requested pose.
    3. DO NOT change colors. DO NOT modernize. DO NOT 'fix' the fashion.
    4. If the user prompt conflicts with the image visual, THE IMAGE VISUAL WINS for clothing.
    `;

    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { aspectRatio: aspectRatio },
        systemInstruction: globalSystemInstruction, // Injecting constraint at system level
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    if (isPro) {
        config.imageConfig.imageSize = resolution;
        // Search is risky for strict cloning as it introduces external noise.
        // We only enable it if explicitly requested AND no character ref clashes.
        if (useSearch && !refImagePart && characterDataList.every(c => !c.image)) {
            config.tools = [{ googleSearch: {} }];
        }
    }

    if (onProgress) onProgress("Executing Strict Visual Transfer...");

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
