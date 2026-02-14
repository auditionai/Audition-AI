
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
    // Remove data:image/...;base64, prefix if present
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

// --- MODULE 1: VISUAL ANALYSIS (Low Cost, High Speed) ---
export const analyzeCharacterVisuals = async (base64Image: string, gender: string): Promise<string> => {
    try {
        const ai = await getAiClient();
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
                    { inlineData: { mimeType: 'image/jpeg', data: cleanBase64(base64Image) } },
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
 * STRATEGY 1: SINGLE MODE
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
 * STRATEGY 2: COUPLE MODE
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
        - P1 (${charDescriptions[0]?.split('|')[0]}): ${charDescriptions[0]?.split('|')[1]}
        - P2 (${charDescriptions[1]?.split('|')[0]}): ${charDescriptions[1]?.split('|')[1]}
        
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
    
    // 1. SELECT MODEL
    // Force Pro for high quality, but Flash if resolution is set to '1K' specifically to save cost
    const isPro = resolution === '2K' || resolution === '4K';
    const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    if (onProgress) onProgress(`Engine: ${model} | Res: ${resolution}`);

    // 2. PREPARE COMMON ASSETS

    // A. Background/Scene Reference
    let refImagePart = null;
    if (styleRefBase64) {
        // CRITICAL FIX: Limit background ref to 1024px to prevent Payload Too Large
        const optimizedRef = await optimizePayload(styleRefBase64, 1024);
        refImagePart = {
            inlineData: { data: cleanBase64(optimizedRef), mimeType: 'image/jpeg' }
        };
    }

    // B. Character References
    const charParts: any[] = [];
    const charDescriptions: string[] = [];

    for (const char of characterDataList) {
        let desc = `${char.gender}`;
        if (char.image) {
            // STEP 1: Solid Fence (1024x1024)
            const fencedData = await createSolidFence(char.image, "1:1", false);
            
            // STEP 2: CRITICAL DOWN-SAMPLING (512x512)
            // We reduce the fenced character to 512px. The AI still sees the "fence" structure
            // but the data size is 4x smaller, preventing Error 400.
            const optimizedFence = await optimizePayload(fencedData, 512);
            const cleanFenceBase64 = cleanBase64(optimizedFence);
            
            // Analyze for text backup (using the smaller image is fine)
            if (onProgress) onProgress(`Analyzing Player ${char.id}...`);
            const visualDesc = await analyzeCharacterVisuals(cleanFenceBase64, char.gender);
            
            desc += `|${visualDesc}`;
            charParts.push({
                inlineData: { data: cleanFenceBase64, mimeType: 'image/jpeg' }
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
  try {
    const ai = await getAiClient();
    const model = 'gemini-2.5-flash-image'; 
    
    // Optimize input for edit too
    const cleanMain = cleanBase64(imageBase64);
    
    const parts: any[] = [{ inlineData: { data: cleanMain, mimeType: mimeType } }];
    let instructionText = `Edit this image. Instruction: ${prompt}`;
    
    if (styleRefBase64) {
        const cleanStyle = cleanBase64(styleRefBase64);
        parts.push({ inlineData: { data: cleanStyle, mimeType: 'image/jpeg' } });
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
