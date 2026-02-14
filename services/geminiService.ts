
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

// --- MODULE 2: STRATEGY IMPLEMENTATIONS (PURE INSTRUCTIONAL) ---

/**
 * STRATEGY 1: SINGLE MODE
 * Logic: Strict Transfer from Source -> Target
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
        // Image 1: Scene (Background/Pose)
        // Image 2: Character Identity (Outfit/Face)
        parts.push(refImagePart); 
        if (charParts[0]) parts.push(charParts[0]); 

        systemPrompt = `** SYSTEM INSTRUCTION: CHARACTER TRANSFER **
        
        [ASSETS]:
        - IMAGE 1: Target Scene & Pose.
        - IMAGE 2: Source Character (Reference).
        
        [OPERATIONAL COMMANDS]:
        1. **ANALYZE** the outfit, skin tone, and face structure in IMAGE 2.
        2. **TRANSFER** these exact visual elements onto the character position in IMAGE 1.
        3. **PRESERVE** the background and lighting of IMAGE 1 strictly.
        4. **ADAPT** the Source Character (Image 2) to the pose found in IMAGE 1.
        
        [STRICT CONSTRAINTS]:
        - DO NOT generate new clothes. Use the clothing from IMAGE 2 pixels.
        - DO NOT change the background of IMAGE 1.
        
        [CONTEXT]: ${prompt}
        [OUTPUT]: High fidelity 3D render.`;
        
    } else {
        // SCENARIO: Text-to-Image with Character Ref
        if (charParts[0]) parts.push(charParts[0]);
        
        systemPrompt = `** SYSTEM INSTRUCTION: CHARACTER RENDERING **
        
        [ASSETS]:
        - IMAGE 1: Character Reference (Outfit & ID).
        
        [OPERATIONAL COMMANDS]:
        1. **REPLICATE** the character from IMAGE 1.
        2. **COPY** the clothing topology, texture, and accessories exactly from IMAGE 1.
        3. **POSE** the character according to the text command below.
        
        [USER COMMAND]: ${prompt}
        
        [STYLE]: Blind Box, 3D Render, Unreal Engine 5, Octane Render.`;
    }

    return { systemPrompt, parts };
};

/**
 * STRATEGY 2: COUPLE MODE
 * Logic: Multi-Source Mapping
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
        // Img 1: BG, Img 2: P1, Img 3: P2
        systemPrompt = `** SYSTEM INSTRUCTION: COUPLE COMPOSITION **
        
        [ASSETS]:
        - IMAGE 1: Master Scene (Background).
        - IMAGE 2: Source for Person A (${charDescriptions[0]}).
        - IMAGE 3: Source for Person B (${charDescriptions[1]}).
        
        [EXECUTION QUEUE]:
        1. LOAD IMAGE 1 as the immutable background.
        2. EXTRACT Person A from IMAGE 2 (Face + Outfit). INSERT into Scene.
        3. EXTRACT Person B from IMAGE 3 (Face + Outfit). INSERT into Scene.
        4. INTERACTION: Make them interact as: "${prompt}".
        
        [CRITICAL]:
        - CLOTHING MUST MATCH THE REFERENCE IMAGES EXACTLY. 
        - DO NOT HALLUCINATE NEW OUTFITS.
        
        Style: Romantic 3D Game Art.`;
    } else {
        // No BG ref, just 2 chars
        systemPrompt = `** SYSTEM INSTRUCTION: COUPLE GENERATION **
        
        [ASSETS]:
        - IMAGE 1: Source for Person A.
        - IMAGE 2: Source for Person B.
        
        [COMMAND]:
        Create a romantic 3D scene.
        - Person A must look exactly like IMAGE 1 (Same clothes, same face).
        - Person B must look exactly like IMAGE 2 (Same clothes, same face).
        - Action: "${prompt}"
        
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

    const startIndex = refImagePart ? 2 : 1;

    // Generate dynamic mapping instruction
    const memberInstructions = charDescriptions.map((gender, i) => 
        `- Member ${i+1} (${gender}): MUST USE VISUALS FROM IMAGE ${startIndex + i}.`
    ).join('\n');

    const systemPrompt = `** SYSTEM INSTRUCTION: SQUAD ASSEMBLY (${charDescriptions.length} Members) **
    
    [TASK]: Compose a group photo.
    
    [SOURCE MAPPING]:
    ${memberInstructions}
    
    [INSTRUCTIONS]:
    1. For each member, COPY the outfit and appearance strictly from their assigned Reference Image.
    2. Arrange them in a cohesive team pose.
    3. ${refImagePart ? 'Use IMAGE 1 as the exact background.' : `Background context: ${prompt}`}
    
    [CONSTRAINT]:
    - Identity consistency is top priority.
    - Clothing details (logos, patterns) must be preserved.
    
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
    
    if (onProgress) onProgress(`Engine: ${model} | Res: ${resolution}`);

    // 2. PREPARE COMMON ASSETS

    // A. Background/Scene Reference
    let refImagePart = null;
    if (styleRefBase64) {
        // Optimized to 1024px for structure reference
        const optimizedRef = await optimizePayload(styleRefBase64, 1024);
        refImagePart = {
            inlineData: { data: cleanBase64(optimizedRef), mimeType: 'image/jpeg' }
        };
    }

    // B. Character References
    const charParts: any[] = [];
    const charDescriptions: string[] = [];

    for (const char of characterDataList) {
        if (char.image) {
            if (onProgress) onProgress(`Processing Player ${char.id} inputs...`);
            
            // STEP 1: Solid Fence
            const fencedData = await createSolidFence(char.image, "1:1", false);
            
            // STEP 2: HIGH RES PAYLOAD (768px)
            // We give the AI a good look at the clothes.
            const optimizedFence = await optimizePayload(fencedData, 768);
            const cleanFenceBase64 = cleanBase64(optimizedFence);
            
            // PUSH IMAGE ONLY. DO NOT ANALYZE TEXT.
            charParts.push({
                inlineData: { data: cleanFenceBase64, mimeType: 'image/jpeg' }
            });
            
            // Description is just the gender/ID, not a visual description
            charDescriptions.push(char.gender);
        } else {
            // Fallback if no image provided for a slot
            charParts.push(null); // Keep index alignment
            charDescriptions.push(`${char.gender} (Generate Creative Outfit)`);
        }
    }

    // Filter nulls from parts list before sending (but logic inside process functions must handle alignment)
    // Actually, for alignment in prompts ("Image 1, Image 2"), we need to be careful.
    // The `process...` functions above simply push existing parts. 
    // We need to make sure `charParts` only contains valid parts for the payload construction.
    const validCharParts = charParts.filter(p => p !== null);

    // 3. ROUTE TO SPECIFIC STRATEGY
    let payload;
    const modeCount = characterDataList.length;

    if (modeCount === 1) {
        payload = processSingleMode(prompt, refImagePart, validCharParts, charDescriptions);
    } else if (modeCount === 2) {
        payload = processCoupleMode(prompt, refImagePart, validCharParts, charDescriptions);
    } else {
        payload = processGroupMode(prompt, refImagePart, validCharParts, charDescriptions);
    }

    // 4. EXECUTE REQUEST
    if (onProgress) onProgress("Executing Visual Transfer...");
    
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
    
    const cleanMain = cleanBase64(imageBase64);
    
    const parts: any[] = [{ inlineData: { data: cleanMain, mimeType: mimeType } }];
    let instructionText = `COMMAND: Edit this image. ${prompt}`;
    
    if (styleRefBase64) {
        const cleanStyle = cleanBase64(styleRefBase64);
        parts.push({ inlineData: { data: cleanStyle, mimeType: 'image/jpeg' } });
        instructionText += ` REFERENCE: Use Image 2 as the style/texture source.`;
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
