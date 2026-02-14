
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";
import { createSolidFence, optimizePayload, sliceImageVertical } from "../utils/imageProcessor";

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
    slices?: { top: string, bottom: string } | null; // New field for slices
}

// --- MODULE 2: STRATEGY IMPLEMENTATIONS (DIGITAL TWIN PROTOCOL V3) ---

/**
 * STRATEGY 1: SINGLE MODE - "The 3D Photocopier"
 */
const processSingleMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], // Now contains [Full, Top, Bottom] if slices exist
    charDescriptions: string[]
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    let systemPrompt = "";

    // Image Index Tracking
    // [0]: Char Full (Always)
    // [1]: Char Top (If exists)
    // [2]: Char Bottom (If exists)
    // [3]: Ref Pose (If exists)
    
    parts.push(charParts[0]); // Full Body
    
    let instructions = `** PROTOCOL: 3D PHOTOCOPIER (DIGITAL TWIN) **
    [ROLE]: You are a specialized 3D Texture Scanner.
    [TASK]: Reconstruct the character in Image 1 EXACTLY.
    [INPUT MAPPING]:
    - IMAGE 1: [MASTER REFERENCE] Full Body Identity.`;

    if (charParts.length > 1) {
        parts.push(charParts[1]); // Top Slice
        parts.push(charParts[2]); // Bottom Slice
        instructions += `
    - IMAGE 2: [MACRO ZOOM A] FACE, HAIR, & OUTFIT TEXTURE. 
    - IMAGE 3: [MACRO ZOOM B] SHOES, LEGS & PANTS TEXTURE.
    
    [CRITICAL INSTRUCTION - DO NOT INVENT]:
    1. **FACE & HAIR**: Look at IMAGE 2. Copy the hairstyle, face shape, and makeup EXACTLY.
    2. **OUTFIT**: Look at IMAGE 2. Copy the fabric patterns, logos, and necklines EXACTLY.
    3. **SHOES**: Look at IMAGE 3. This is the source of truth for footwear. If Image 1 is blurry at the bottom, USE IMAGE 3. Copy the exact shoe type (sneakers, heels, boots) and color.
        `;
    }

    if (refImagePart) {
        parts.push(refImagePart);
        instructions += `\n- FINAL IMAGE: [POSE GUIDE] Use the skeleton from this image, but keep the Character from Images 1-3.`;
    }

    systemPrompt = instructions + `
    [STRICT CONSTRAINTS]:
    - NO HALLUCINATION. If you see stripes, render stripes. If you see white shoes, render white shoes.
    - OUTPUT: A high-fidelity 3D Render (Unreal Engine 5 style) of the Character in Image 1 performing: "${prompt}".
    `;

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

    // Handling 2 characters. We likely won't send slices for both to avoid token overload (Gemini limit).
    // We send FULL images for both. 
    
    const parts = [];
    
    // Image 1: Char 1
    // Image 2: Char 2
    // Image 3: Pose (Optional)
    
    // Flatten the charParts. Assuming input is [Char1_Full, Char2_Full] (Slices ignored for couple to save complexity for now)
    // NOTE: In generateImage below, we flatMapped the slices. We need to handle that.
    // For Couple Mode, let's simplify: Just take the FULL images (indices 0 of each char set if we had slices, but logic below handles it)
    
    // In this updated logic, we pass prepared parts.
    parts.push(...charParts); 
    if (refImagePart) parts.push(refImagePart);

    const systemPrompt = `** PROTOCOL: DUAL IDENTITY CLONING **
    
    [SOURCE DATA]:
    - CHARACTER A (Left/Male typically): IMAGE 1.
    - CHARACTER B (Right/Female typically): IMAGE 2.
    ${refImagePart ? '- POSE REFERENCE: IMAGE 3.' : ''}
    
    [INSTRUCTIONS]:
    1. **CLONE CHAR A**: Transfer Face + Outfit + Shoes from IMAGE 1. Look at the feet in Image 1 carefully.
    2. **CLONE CHAR B**: Transfer Face + Outfit + Shoes from IMAGE 2. Look at the feet in Image 2 carefully.
    
    [INTERACTION]: "${prompt}"
    
    Style: Romantic 3D Game Art, Audition Style. High fidelity textures.`;

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

    const parts = [...charParts];
    if (refImagePart) parts.push(refImagePart);

    const systemPrompt = `** PROTOCOL: TEAM REPLICATION **
    
    [INPUTS]: Images 1 to ${charParts.length} are the team members.
    ${refImagePart ? `Last Image is the POSE/FORMATION guide.` : ''}
    
    [EXECUTION]:
    - Create a group photo.
    - Each member must look exactly like their source image (Face, Clothes, Shoes).
    - Do not change their outfits.
    - Context: "${prompt}"`;

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
    
    if (onProgress) onProgress(`Engine: ${model} | Scanning High-Res Inputs...`);

    // 2. PREPARE ASSETS
    let refImagePart = null;
    if (styleRefBase64) {
        const fencedData = await createSolidFence(styleRefBase64, aspectRatio, true);
        refImagePart = {
            inlineData: { data: cleanBase64(fencedData), mimeType: 'image/jpeg' }
        };
    }

    const allParts: any[] = [];
    const charDescriptions: string[] = [];

    // --- PRE-PROCESSING: SLICING IMAGES FOR DETAIL ---
    // Only slice if Single Mode (for max quality) or Couple Mode (if manageable)
    // Group mode: No slicing to avoid token limit errors.
    const enableSlicing = characterDataList.length === 1;

    for (const char of characterDataList) {
        if (char.image) {
            // 1. Full Body (Optimized but not cropped)
            const fencedData = await createSolidFence(char.image, "1:1", false);
            const optimizedFull = await optimizePayload(fencedData, 1024); 
            
            allParts.push({
                inlineData: { data: cleanBase64(optimizedFull), mimeType: 'image/jpeg' }
            });

            // 2. Slices (If enabled)
            if (enableSlicing) {
                if (onProgress) onProgress("Digital Twin: Generating Texture Slices...");
                const slices = await sliceImageVertical(char.image);
                if (slices) {
                    // Top Slice (Face/Torso)
                    allParts.push({
                        inlineData: { data: cleanBase64(slices.top), mimeType: 'image/jpeg' }
                    });
                    // Bottom Slice (Shoes)
                    allParts.push({
                        inlineData: { data: cleanBase64(slices.bottom), mimeType: 'image/jpeg' }
                    });
                }
            }

            charDescriptions.push(char.gender);
        } else {
            // Generic placeholder if needed, though usually UI prevents this
            // allParts.push(null); // Logic handled in strategy
        }
    }

    // 3. ROUTE STRATEGY
    let payload;
    const modeCount = characterDataList.length;

    if (modeCount === 1) {
        // Single mode logic handles the slices (Full, Top, Bottom)
        payload = processSingleMode(prompt, refImagePart, allParts, charDescriptions);
    } else if (modeCount === 2) {
        // Couple mode logic expects just 2 images (Full, Full) currently
        // If we want to support slices later, we need to update processCoupleMode
        payload = processCoupleMode(prompt, refImagePart, allParts, charDescriptions);
    } else {
        payload = processGroupMode(prompt, refImagePart, allParts, charDescriptions);
    }

    // 4. CONSTRUCT FINAL CONFIG
    const globalSystemInstruction = `
    CRITICAL OVERRIDE - PHOTOGRAPHY MODE:
    You are NOT an artist. You are a 3D RECONSTRUCTION ENGINE.
    
    [MANDATORY RULES]:
    1. **IDENTITY LOCK**: The output face must match the input image face.
    2. **OUTFIT LOCK**: The output clothes must match the input clothes pixel-for-pixel (Color, Style, Logos).
    3. **SHOE LOCK**: Look at the bottom of the input image(s). REPLICATE THE SHOES EXACTLY. Do not default to generic sneakers if the user wears boots/heels.
    4. **NO CREATIVITY**: Do not "improve" the outfit. Copy it.
    
    If multiple images are provided for one person, they are ZOOM-INS. Use them to fix blurry details.
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
        // Search mostly useful for background/context, not character replication
        if (useSearch && !refImagePart) {
            config.tools = [{ googleSearch: {} }];
        }
    }

    if (onProgress) onProgress("Running Digital Twin Protocol...");

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
