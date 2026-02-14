
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";
import { createSolidFence, optimizePayload } from "../utils/imageProcessor";

// Helper to get the best available API Key ASYNC
const getDynamicApiKey = async (): Promise<string> => {
    const dbKey = await getSystemApiKey();
    if (dbKey && dbKey.trim().length > 0) {
        return dbKey.trim();
    }
    return process.env.API_KEY || "";
};

const getAiClient = async () => {
    const key = await getDynamicApiKey();
    if (!key) throw new Error("Hệ thống chưa có API Key. Vui lòng cấu hình trong Admin > Hệ thống.");
    return new GoogleGenAI({ apiKey: key });
};

const extractImage = (response: any): string | null => {
  if (response.candidates && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  return null;
}

// Interface for character data
interface CharacterData {
    id: number;
    gender: 'male' | 'female';
    image: string | null; // Base64 of identity/outfit reference
    description?: string;
}

// --- STEP 1: SPRITE ISOLATION GENERATOR ---
// Generates a single 3D character sprite on a Green Screen to prevent Concept Bleeding
const generateSprite = async (char: CharacterData, stylePrompt: string): Promise<string | null> => {
    try {
        const ai = await getAiClient();
        // FIX: Must use an IMAGE GENERATION model, not a text model.
        const model = 'gemini-2.5-flash-image'; 
        
        const parts: any[] = [];
        
        // Input Image (Face/Body) - Used for img2img guidance
        if (char.image) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: char.image } });
        }

        // EXACT AUDITION AI PROMPT FOR ISOLATION
        // Applied strict constraints from technical documentation
        const prompt = `** TASK: ** Generate a single 3D Character Sprite.
        ** STRICT CONSTRAINT: **
        1. [GENDER]: **${char.gender.toUpperCase()}**. DO NOT SWAP GENDER. (Khóa cứng giới tính)
        2. [ISOLATION]: Ignore any other context. Focus ONLY on this single character. (Bỏ qua mọi thứ khác)
        3. [BACKGROUND]: Solid Green (#00FF00). (Vẽ trên nền xanh lá cây - giống quay phim Hollywood)
        
        [STYLE]: ${stylePrompt || "3D Game Character, Blind Box Style, Unreal Engine 5"}.
        [ACTION]: Full body shot, standing or posing neutrally.`;

        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: parts },
            config: {
                imageConfig: {
                    aspectRatio: "3:4", // Tall aspect for character sprites
                    imageSize: "1K"
                }
            }
        });

        const spriteBase64 = extractImage(response);
        if (spriteBase64) {
            return spriteBase64.split(',')[1]; // Return raw base64 data
        }
        return null;
    } catch (error) {
        console.error(`Sprite Gen Error for Char ${char.id}:`, error);
        return null;
    }
};

export const analyzeCharacterVisuals = async (base64Image: string, gender: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // FIX: Use Gemini 3 Flash for better multimodal understanding
        const model = 'gemini-3-flash-preview'; 
        
        const prompt = `Analyze the person inside the border.
        Target Gender: ${gender}.
        Output concise description of: Top, Bottom, Shoes. Colors MUST be exact.`;

        const response = await ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: prompt }
                ]
            }
        });

        return response.text?.trim() || `wearing stylish ${gender} clothes`;
    } catch (error) {
        console.warn("Analysis failed, using fallback desc", error);
        return `wearing fashion ${gender} outfit`;
    }
};

/**
 * generateImage - ADVANCED PIPELINE (Audition AI Protocol)
 * - Single Mode: Direct Generation with Solid Fence.
 * - Multi Mode: Sprite Isolation -> Context Assembly.
 */
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, // POSE BLUEPRINT
    characterDataList: CharacterData[] = [], // LIST OF CHARACTERS
    resolution: string = '2K',
    useSearch: boolean = false,
    onProgress?: (msg: string) => void // Callback for UI updates
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    const model = 'gemini-3-pro-image-preview'; 
    const isMultiChar = characterDataList.length > 1;

    // ==========================================
    // PATH 1: MULTI-CHARACTER PIPELINE (ISOLATION -> ASSEMBLY)
    // ==========================================
    if (isMultiChar) {
        if (onProgress) onProgress(`Phase 1: Isolating ${characterDataList.length} Sprites (Parallel)...`);
        
        // --- STEP 1: PARALLEL SPRITE GENERATION ---
        // Generate "Green Screen Sprite" for each character first.
        const spritePromises = characterDataList.map(async (char) => {
            const spriteData = await generateSprite(char, prompt);
            return { id: char.id, sprite: spriteData, gender: char.gender };
        });

        const sprites = await Promise.all(spritePromises);
        
        const validSprites = sprites.filter(s => s.sprite !== null);
        
        // CRITICAL CHECK: If Sprite Gen failed (e.g. API Error), stop here.
        if (validSprites.length === 0) {
            console.error("All sprite generations failed.");
            throw new Error("Failed to generate character sprites (Phase 1).");
        }

        if (onProgress) onProgress("Phase 2: Context Assembly (Compositing)...");

        // --- STEP 2: CONTEXT ASSEMBLY ---
        // Feed Sprites + Background Reference to Pro Model.
        
        let processedPoseRef = null;
        if (styleRefBase64) {
            // isPoseRef=true passed to utility (now cleaned to NOT bleach image)
            const ghostData = await createSolidFence(styleRefBase64, aspectRatio, true);
            processedPoseRef = ghostData.split(',')[1];
        }

        const parts: any[] = [];
        let imageIndexCounter = 0;

        // A. Input: Master Canvas (Pose Ref)
        let masterCanvasIndex = -1;
        if (processedPoseRef) {
            parts.push({ inlineData: { data: processedPoseRef, mimeType: 'image/jpeg' } });
            imageIndexCounter++;
            masterCanvasIndex = imageIndexCounter;
        }

        // B. Input: Generated Sprites
        const spriteMap: Record<number, number> = {};
        for (const s of validSprites) {
            if (s.sprite) {
                parts.push({ inlineData: { data: s.sprite, mimeType: 'image/jpeg' } });
                imageIndexCounter++;
                spriteMap[s.id] = imageIndexCounter;
            }
        }

        // C. Prompt: SUPREME SYSTEM COMMAND (EXACT FROM DOCS)
        let assemblyPrompt = `** SUPREME SYSTEM COMMAND: COMPOSITION **
        
        I have provided pre-generated character sprites labeled ${validSprites.map(s => `[SPRITE_${s.id}]`).join(', ')}.
        
        [INPUT MAPPING]:
        ${masterCanvasIndex > 0 ? `- [MASTER_CANVAS] (Image ${masterCanvasIndex}): STRICT REFERENCE for Scene, Background, Lighting, and Camera Angle.` : ''}
        ${validSprites.map(s => `- [SPRITE_${s.id}] (Image ${spriteMap[s.id]}): Character ${s.id} on GREEN SCREEN.`).join('\n')}
        
        [MISSION]:
        Composit the sprites into a scene that MATCHES [MASTER_CANVAS].
        1. **BACKGROUND**: Recreate the environment shown in [MASTER_CANVAS] (e.g. if it's a bedroom, make it a bedroom).
        2. **POSE**: Position the characters exactly as shown in [MASTER_CANVAS].
        3. **SPRITES**: Use the visual features of [SPRITE_X] (Outfit/Face) but adapt their pose to match the reference.
        
        **RULE:** DO NOT regenerate character features (Face/Clothes). USE THE SPRITE'S VISUALS.
        Blend them into the lighting of the scene.
        
        [SCENE DESCRIPTION]: ${prompt}`;

        parts.push({ text: assemblyPrompt });

        const config: any = {
            imageConfig: { aspectRatio: aspectRatio, imageSize: resolution }
        };

        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: parts },
            config: config
        });

        return extractImage(response);
    }

    // ==========================================
    // PATH 2: SINGLE CHARACTER PIPELINE (DIRECT - SOLID FENCE)
    // ==========================================
    
    // 1. Prepare Pose Ref (The Ghost)
    let processedPoseRef = null;
    if (styleRefBase64) {
        if (onProgress) onProgress("Processing Pose Blueprint (Ghosting)...");
        const ghostData = await createSolidFence(styleRefBase64, aspectRatio, true);
        processedPoseRef = ghostData.split(',')[1];
    }

    // 2. Prepare Characters (The Solid Fence)
    const processedCharList = [];
    for (const char of characterDataList) {
        if (char.image) {
            if (onProgress) onProgress(`Building Solid Fence for Player ${char.id}...`);
            
            const fencedData = await createSolidFence(char.image, "1:1", false);
            const fencedBase64 = fencedData.split(',')[1];
            const description = await analyzeCharacterVisuals(fencedBase64, char.gender);
            
            processedCharList.push({
                ...char,
                image: fencedBase64, 
                description: description
            });
        } else {
            processedCharList.push({
                ...char,
                description: `wearing high-fashion ${char.gender} clothes matching the theme "${prompt}"`
            });
        }
    }

    if (onProgress) onProgress("Synthesizing Final Scene...");

    const parts: any[] = [];
    let imageIndexCounter = 0;

    // A. Add Pose Reference (Ghost)
    let poseRefIndex = -1;
    if (processedPoseRef) {
      parts.push({
        inlineData: {
          data: processedPoseRef,
          mimeType: 'image/jpeg', 
        },
      });
      imageIndexCounter++;
      poseRefIndex = imageIndexCounter; 
    }

    // B. Add Character Images (Fenced)
    const charIndexMap: Record<number, number> = {};
    for (const char of processedCharList) {
        if (char.image) {
            parts.push({
                inlineData: {
                    data: char.image,
                    mimeType: 'image/jpeg',
                }
            });
            imageIndexCounter++;
            charIndexMap[char.id] = imageIndexCounter;
        }
    }

    const indexToWord = (idx: number) => `Image ${idx}`;

    // C. The Master System Prompt (Single Character Logic)
    const charCount = processedCharList.length;
    let fullPrompt = `*** SYSTEM COMMAND: OUTPAINTING & EXPANSION ***
    
    1. [INPUT ANALYSIS]: The images labeled 'INPUT_CANVAS' (Images ${imageIndexCounter > 0 ? '1 to ' + imageIndexCounter : 'Provided'}) contain subjects placed on a GRAY (#808080) background with a SOLID BORDER.
    
    2. [MANDATORY ACTION]: The GRAY area (#808080) is VOID space. You must NOT preserve it. You must REGENERATE the scene to fill the canvas.
    
    3. [GENERATION TASK]:
       - USER SCENE: "${prompt}".
       - Render exactly ${charCount} character into this scene.
    
    4. [SUBJECT PRESERVATION]: 
       - For the character provided with a solid border, keep the character's Pose, Outfit, and Identity EXACTLY as shown inside the border.
       - Treat the bordered area as a "Texture Stamp".`;

    if (poseRefIndex > 0) {
        fullPrompt += `\n\n5. [POSE BLUEPRINT - IMAGE ${indexToWord(poseRefIndex)}]:
        - This image is a GHOST/BLEACHED guide.
        - Use it ONLY for skeleton/bone positioning.`;
    }

    processedCharList.forEach((char) => {
        const imageIdx = charIndexMap[char.id];
        
        fullPrompt += `\n\n--- PLAYER ${char.id} (${char.gender.toUpperCase()}) ---`;
        if (imageIdx) {
            fullPrompt += `\n- SOURCE: ${indexToWord(imageIdx)} (Inside Solid Fence).`;
            fullPrompt += `\n- CONSTRAINT: COPY Outfit from Source -> PASTE onto Scene.`;
            fullPrompt += `\n- CLARIFICATION: ${char.description}.`;
        }
    });

    parts.push({ text: fullPrompt });

    const config: any = {
        imageConfig: {
          aspectRatio: aspectRatio, 
          imageSize: resolution
        }
    };

    if (useSearch) {
        config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: parts },
      config: config
    });

    return extractImage(response);

  } catch (error) {
    console.error("Gemini 3.0 Pipeline Error:", error);
    throw error;
  }
};

export const editImageWithInstructions = async (
  imageBase64: string,
  prompt: string,
  mimeType: string = "image/jpeg",
  styleRefBase64?: string
): Promise<string | null> => {
  try {
    const ai = await getAiClient();
    const model = 'gemini-3-pro-image-preview'; 
    
    const parts: any[] = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      }
    ];

    let instructionText = `Task: Professional Image Editing.
    Instruction: ${prompt}. 
    Style: Keep the output high quality. If the input is a 3D character, maintain the 3D texture.`;

    if (styleRefBase64) {
        parts.push({
            inlineData: {
                data: styleRefBase64,
                mimeType: 'image/jpeg',
            }
        });
        instructionText += `\nUse the second image as a style reference.`;
    }

    parts.push({ text: instructionText });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: parts },
      config: {
        imageConfig: {
            imageSize: "2K" 
        }
      }
    });

    return extractImage(response);
  } catch (error) {
    console.error("Gemini 3.0 Image Edit Error:", error);
    throw error;
  }
};

export const suggestPrompt = async (currentInput: string, lang: string, featureName: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        const systemInstruction = `You are an AI Prompt Expert for 3D Art. 
        Current Tool: "${featureName}".
        Task: Refine the user's input into a prompt for a 3D Game Character.
        Keywords to add: 3D render, c4d, blender, unreal engine, blind box style, cute, detailed.
        Language: Keep response in ${lang === 'vi' ? 'Vietnamese' : 'English'}.
        Return ONLY the prompt text.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: currentInput || `Create a 3D character concept for ${featureName}`,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
            }
        });

        return response.text?.trim() || currentInput;
    } catch (error) {
        return currentInput;
    }
}

export const checkConnection = async (testKey?: string): Promise<boolean> => {
  try {
    const key = testKey ? testKey.trim() : (await getDynamicApiKey()).trim();
    if (!key) return false;
    const ai = new GoogleGenAI({ apiKey: key });
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: 'ping' }] },
      config: { maxOutputTokens: 1 }
    });
    return true;
  } catch (error) {
    return false;
  }
}
