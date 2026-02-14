
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

// --- MODULE 1: VISUAL ANALYSIS (Low Cost, High Speed) ---
// Tách riêng module phân tích để AI "hiểu" quần áo trước khi vẽ.
export const analyzeCharacterVisuals = async (base64Image: string, gender: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // Dùng Flash cho tác vụ text (nhanh, rẻ, chính xác cho text)
        const model = 'gemini-2.5-flash'; 
        
        const prompt = `Analyze the person in this image.
        Target Gender: ${gender}.
        Describe strictly: 
        1. Hairstyle and Hair Color.
        2. Top clothing (Color, Type, Texture).
        3. Bottom clothing (Color, Type).
        4. Footwear.
        Output format: A concise comma-separated art prompt describing the outfit.`;

        const response = await ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: prompt }
                ]
            }
        });

        return response.text?.trim() || `stylish ${gender} outfit`;
    } catch (error) {
        return `fashionable ${gender} clothes`;
    }
};

// --- MODULE 2: STRATEGY IMPLEMENTATIONS ---

/**
 * STRATEGY 1: SINGLE MODE (Focus on Detail & Character Fidelity)
 */
const processSingleMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[]
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    let systemPrompt = "";

    if (refImagePart) {
        // SCENARIO: Editing/Replacing Character in a Scene
        parts.push(refImagePart); // Image 1: Background
        if (charParts[0]) parts.push(charParts[0]); // Image 2: Character Source

        systemPrompt = `** MODE: SINGLE CHARACTER REPLACEMENT **
        
        [INPUTS]:
        - IMAGE 1: [MASTER_SCENE] (Background Reference).
        ${charParts[0] ? '- IMAGE 2: [IDENTITY_SOURCE] (Face/Outfit Reference).' : ''}
        
        [INSTRUCTION]:
        1. **BACKGROUND**: You MUST PRESERVE the [MASTER_SCENE] exactly. Keep the room, lighting, and furniture 100% identical.
        2. **ACTION**: Replace the person in [MASTER_SCENE] (or insert one if empty) with the character described below.
        3. **APPEARANCE**: 
           - Gender: ${charDescriptions[0].split('|')[0]}
           - Outfit/Look: ${charDescriptions[0].split('|')[1]}
           ${charParts[0] ? '- Use [IDENTITY_SOURCE] for face structure and outfit details.' : ''}
        
        [USER PROMPT]: ${prompt}
        [STYLE]: 3D Game Render, Audition Style, 8K Resolution.`;
        
    } else {
        // SCENARIO: Text-to-Image Generation
        if (charParts[0]) parts.push(charParts[0]);
        
        systemPrompt = `** MODE: SINGLE CHARACTER GENERATION **
        
        Generate a high-quality 3D character.
        - Description: ${charDescriptions[0].split('|')[1]}
        - Context: ${prompt}
        ${charParts[0] ? '- Reference: Use the provided image for outfit/face texture.' : ''}
        
        Style: Blind Box, 3D Render, Unreal Engine 5, Octane Render.`;
    }

    return { systemPrompt, parts };
};

/**
 * STRATEGY 2: COUPLE MODE (Focus on Interaction & Chemistry)
 */
const processCoupleMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    charDescriptions: string[]
): { systemPrompt: string, parts: any[] } => {

    const parts = [];
    let systemPrompt = "";

    // Add Background first (Ground Truth)
    if (refImagePart) parts.push(refImagePart);

    // Add Character Refs
    charParts.forEach(p => parts.push(p));

    if (refImagePart) {
        systemPrompt = `** MODE: COUPLE SCENE EDITING **
        
        [TASK]: Render a couple inside the provided [MASTER_SCENE] (Image 1).
        
        [CRITICAL RULES]:
        1. **DO NOT CHANGE THE BACKGROUND**. The room/environment in Image 1 is fixed.
        2. **INTERACTION**: The two characters must be interacting (e.g., holding hands, hugging, dancing) as described in: "${prompt}".
        
        [CHARACTERS]:
        - P1 (${charDescriptions[0].split('|')[0]}): ${charDescriptions[0].split('|')[1]}
        - P2 (${charDescriptions[1].split('|')[0]}): ${charDescriptions[1].split('|')[1]}
        
        Use the provided character reference images (if any) for their specific outfits.
        Style: Romantic 3D Game Art, Soft Lighting.`;
    } else {
        systemPrompt = `** MODE: COUPLE GENERATION **
        
        Generate a romantic 3D scene with 2 characters.
        [SCENE]: "${prompt}"
        
        [CHARACTERS]:
        - P1: ${charDescriptions[0]}
        - P2: ${charDescriptions[1]}
        
        Focus on emotional connection, eye contact, and body language.
        Style: 3D Render, High Fidelity.`;
    }

    return { systemPrompt, parts };
};

/**
 * STRATEGY 3: GROUP MODE (Focus on Composition & Non-overlapping)
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

    const systemPrompt = `** MODE: GROUP SQUAD PHOTO (${charDescriptions.length} Members) **
    
    [TASK]: Create a group photo of a game clan/squad.
    
    [COMPOSITION]:
    - Characters should be standing/posing together like a team.
    - Ensure faces are distinct and not overlapping.
    ${refImagePart ? '- **BACKGROUND**: Keep the environment from Image 1.' : `- Background: ${prompt}`}
    
    [MEMBERS]:
    ${charDescriptions.map((desc, i) => `- Member ${i+1}: ${desc}`).join('\n')}
    
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
    
    // 1. SELECT MODEL (User Choice is Absolute)
    // Pro = 2K/4K, Flash = 1K. We NEVER switch this automatically.
    const isPro = resolution === '2K' || resolution === '4K';
    const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    // 2. PREPARE COMMON ASSETS
    if (onProgress) onProgress(`Preparing Assets for ${model}...`);

    // A. Background/Scene Reference (The "Ground Truth")
    let refImagePart = null;
    if (styleRefBase64) {
        // Optimize ONLY. NO SOLID FENCE for background.
        // We need the AI to see the full context of the room.
        const optimizedRef = await optimizePayload(styleRefBase64, isPro ? 1280 : 1024);
        refImagePart = {
            inlineData: { data: optimizedRef.split(',')[1], mimeType: 'image/jpeg' }
        };
    }

    // B. Character References (The "Identity/Outfit")
    const charParts: any[] = [];
    const charDescriptions: string[] = [];

    for (const char of characterDataList) {
        let desc = `${char.gender}`;
        if (char.image) {
            // Use Solid Fence for Characters to isolate them from their original photo's background
            const fencedData = await createSolidFence(char.image, "1:1", false);
            const fencedBase64 = fencedData.split(',')[1];
            
            // Analyze for text backup
            if (onProgress) onProgress(`Analyzing Player ${char.id}...`);
            const visualDesc = await analyzeCharacterVisuals(fencedBase64, char.gender);
            
            desc += `|${visualDesc}`;
            charParts.push({
                inlineData: { data: fencedBase64, mimeType: 'image/jpeg' }
            });
        } else {
            desc += `|High fashion ${char.gender} game outfit`;
        }
        charDescriptions.push(desc);
    }

    // 3. ROUTE TO SPECIFIC STRATEGY
    let payload;
    const modeCount = characterDataList.length;

    if (modeCount === 1) {
        payload = processSingleMode(prompt, refImagePart, charParts, charDescriptions);
    } else if (modeCount === 2) {
        payload = processCoupleMode(prompt, refImagePart, charParts, charDescriptions);
    } else {
        payload = processGroupMode(prompt, refImagePart, charParts, charDescriptions);
    }

    // 4. EXECUTE REQUEST
    if (onProgress) onProgress("Rendering final image...");
    
    // Final Payload Construction
    const finalParts = [...payload.parts, { text: payload.systemPrompt }];

    const config: any = {
        imageConfig: { aspectRatio: aspectRatio }
    };

    if (isPro) {
        config.imageConfig.imageSize = resolution;
        // Only enable search if strictly needed and NO reference image (to avoid conflict)
        if (useSearch && !refImagePart) {
            config.tools = [{ googleSearch: {} }];
        }
    }

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

// --- OTHER UTILS ---

export const editImageWithInstructions = async (
  imageBase64: string,
  prompt: string,
  mimeType: string = "image/jpeg",
  styleRefBase64?: string
): Promise<string | null> => {
  // Editing always uses Flash Image for best "Instruction-following" on pixels
  // unless we specifically want to reimagine the image.
  // For now, sticking to Flash Image as it's the most stable "Editor".
  try {
    const ai = await getAiClient();
    const model = 'gemini-2.5-flash-image'; 
    
    const parts: any[] = [{ inlineData: { data: imageBase64, mimeType: mimeType } }];
    let instructionText = `Edit this image. Instruction: ${prompt}`;
    if (styleRefBase64) {
        parts.push({ inlineData: { data: styleRefBase64, mimeType: 'image/jpeg' } });
        instructionText += ` Use the second image as a style reference.`;
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
