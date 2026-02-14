
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

// --- ANALYZE VISUALS ---
export const analyzeCharacterVisuals = async (base64Image: string, gender: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // Use Gemini 3 Flash for speed/cost effectiveness in analysis
        const model = 'gemini-3-flash-preview'; 
        
        const prompt = `Analyze the fashion and appearance of the person inside the frame.
        Target Gender: ${gender}.
        Output a concise visual description suitable for an art prompt (e.g., "A girl with long silver hair wearing a white elegant evening gown").`;

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
 * generateImage - STRICT RE-IMPLEMENTATION
 * This function now strictly separates logic:
 * 1. Has Reference Image -> "Scene Preservation Mode" (Img2Img)
 * 2. No Reference Image -> "Creative Generation Mode" (Text2Img)
 */
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, // THIS IS THE MASTER SCENE REFERENCE
    characterDataList: CharacterData[] = [], 
    resolution: string = '2K',
    useSearch: boolean = false,
    onProgress?: (msg: string) => void
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    const model = 'gemini-3-pro-image-preview'; 
    const hasReference = !!styleRefBase64;

    const parts: any[] = [];
    let imageCounter = 0;

    // ============================================================
    // STEP 1: PREPARE INPUTS (IMAGES)
    // ============================================================

    // A. REFERENCE IMAGE (SCENE MASTER)
    // CRITICAL FIX: Use optimizePayload ONLY. Do NOT use createSolidFence. 
    // We want the AI to see the FULL context, no gray bars, no borders.
    let refIndex = -1;
    if (hasReference && styleRefBase64) {
        if (onProgress) onProgress("Processing Reference Scene...");
        
        // Optimize to max 1024px to ensure token efficiency but keep quality
        const optimizedRef = await optimizePayload(styleRefBase64, 1024);
        
        parts.push({
            inlineData: {
                data: optimizedRef.split(',')[1],
                mimeType: 'image/jpeg',
            }
        });
        imageCounter++;
        refIndex = imageCounter;
    }

    // B. CHARACTER SOURCE IMAGES (OUTFIT/FACE)
    // These DO use Solid Fence because we want to isolate the character features.
    const processedCharList = [];
    for (const char of characterDataList) {
        let charImageIndex = -1;
        let visualDesc = "";

        if (char.image) {
            if (onProgress) onProgress(`Analyzing Character ${char.id}...`);
            
            // Create "Solid Fence" for the character source to tell AI: "Look inside this box"
            const fencedData = await createSolidFence(char.image, "1:1", false);
            const fencedBase64 = fencedData.split(',')[1];
            
            // Analyze outfit for better text prompting backup
            visualDesc = await analyzeCharacterVisuals(fencedBase64, char.gender);

            parts.push({
                inlineData: {
                    data: fencedBase64,
                    mimeType: 'image/jpeg',
                }
            });
            imageCounter++;
            charImageIndex = imageCounter;
        } else {
            visualDesc = `wearing high-fashion ${char.gender} clothes matching the theme`;
        }

        processedCharList.push({
            ...char,
            imageIndex: charImageIndex,
            description: visualDesc
        });
    }

    // ============================================================
    // STEP 2: CONSTRUCT THE MASTER PROMPT
    // ============================================================
    
    if (onProgress) onProgress("Sending Instructions to Core...");

    let systemPrompt = "";

    if (hasReference) {
        // --- MODE 1: STRICT SCENE PRESERVATION (Fixes "Wrong Background" issue) ---
        systemPrompt = `** SYSTEM COMMAND: PHOTOREALISTIC CHARACTER SWAP **
        
        [INPUTS]:
        - IMAGE 1: [MASTER_SCENE]. This is the GROUND TRUTH.
        ${processedCharList.map(c => c.imageIndex > 0 ? `- IMAGE ${c.imageIndex}: [SOURCE_CHAR_${c.id}] (Inside Black Border).` : '').join('\n')}
        
        [CRITICAL RULES]:
        1. **BACKGROUND & LIGHTING**: You MUST PRESERVE the environment, lighting, furniture, colors, and camera angle of [MASTER_SCENE] EXACTLY. Do NOT regenerate the room. Do NOT change the time of day.
        2. **POSE**: The characters in the output MUST mimic the exact poses shown in [MASTER_SCENE].
        3. **CHARACTER APPEARANCE**: Replace the characters in [MASTER_SCENE] with the visual identity (Face/Outfit) provided in [SOURCE_CHAR_x].
        
        [EXECUTION]:
        - If [MASTER_SCENE] shows a bedroom with candles, the output MUST be a bedroom with candles.
        - Apply the outfit from [SOURCE_CHAR] onto the body in [MASTER_SCENE].
        - Style: 3D Render, Audition Game Style, High Quality.
        
        [USER DESCRIPTION]: ${prompt}`; // Append user prompt as flavor text, but secondary to the image ref.

    } else {
        // --- MODE 2: CREATIVE GENERATION (Text-to-Image) ---
        // This is used when user does NOT upload a reference background
        systemPrompt = `** SYSTEM COMMAND: 3D CHARACTER GENERATION **
        
        [INPUTS]:
        ${processedCharList.map(c => c.imageIndex > 0 ? `- IMAGE ${c.imageIndex}: [SOURCE_CHAR_${c.id}] (Inside Black Border).` : '').join('\n')}
        
        [MISSION]:
        Generate a high-quality 3D render based on the description below.
        
        [CHARACTER DETAILS]:
        ${processedCharList.map(c => `- Character ${c.id} (${c.gender}): ${c.imageIndex > 0 ? `Use Outfit/Face from IMAGE ${c.imageIndex}.` : c.description}`).join('\n')}
        
        [SCENE DESCRIPTION]: "${prompt}"
        Style: Semi-realistic 3D, Blind Box, Unreal Engine 5, Octane Render.`;
    }

    parts.push({ text: systemPrompt });

    // ============================================================
    // STEP 3: EXECUTE
    // ============================================================

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
