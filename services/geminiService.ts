
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";

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
}

// --- NEW: ANALYSIS PHASE FUNCTION ---
/**
 * Analyzes a character image to extract clear text descriptions of outfit and features.
 * This prevents the "mixing" issue by converting visual data to strict text constraints.
 */
export const analyzeCharacterVisuals = async (base64Image: string, gender: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // Use Flash for fast text analysis
        const model = 'gemini-2.5-flash'; 
        
        const prompt = `Analyze the person in this image.
        Target Gender: ${gender}.
        
        OUTPUT ONLY a concise visual description in this format:
        "wearing [detailed outfit description including colors and textures], [hair style and color], [distinctive accessories]"
        
        Do not describe background or pose. Focus ONLY on clothing and physical appearance.`;

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
 * generateImage - ADVANCED PIPELINE (Analysis -> Synthesis)
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
    
    // ==========================================
    // PHASE 1: INDIVIDUAL CHARACTER ANALYSIS
    // ==========================================
    const processedCharList = [];

    for (const char of characterDataList) {
        if (char.image) {
            if (onProgress) onProgress(`Analyzing Player ${char.id} (Outfit & Identity)...`);
            
            // Artificial delay to prevent rate limits/timeouts if calling rapidly
            await new Promise(r => setTimeout(r, 1000));
            
            const description = await analyzeCharacterVisuals(char.image, char.gender);
            
            processedCharList.push({
                ...char,
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

    // ==========================================
    // PHASE 2: CONSTRUCT SYNTHESIS PROMPT
    // ==========================================
    const parts: any[] = [];
    let imageIndexCounter = 0;

    // A. Pose Reference (The Blueprint)
    let poseRefIndex = -1;
    if (styleRefBase64) {
      parts.push({
        inlineData: {
          data: styleRefBase64,
          mimeType: 'image/jpeg', 
        },
      });
      imageIndexCounter++;
      poseRefIndex = imageIndexCounter; 
    }

    // B. Add Character Images (For Face Identity mainly)
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

    // C. The Master System Prompt
    const charCount = processedCharList.length;
    let fullPrompt = `ROLE: Strict 3D Scene Renderer & Composition Expert.
    TASK: Render a group of EXACTLY ${charCount} characters. 
    
    USER COMMAND: "${prompt}".
    
    [CONFLICT RESOLUTION PROTOCOL]:
    1. PRIORITY 1 (HIGHEST): The Text Descriptions of outfits below.
    2. PRIORITY 2: The Face details from character images.
    3. PRIORITY 3 (LOWEST): The Pose Reference Image.
    
    **CRITICAL RULE**: The Pose Reference Image has INCORRECT CLOTHING and COLORS. It is for SKELETON/BONE POSITION only. 
    - If the Pose Reference shows BLACK pants, but the Text Description says WHITE pants, you MUST RENDER WHITE PANTS.
    - Ignore the texture and pixels of the Pose Reference. Use it only for geometry.`;

    // --- CRITICAL FIX FOR POSE REF ---
    if (poseRefIndex > 0) {
        fullPrompt += `\n\n[IMAGE ${indexToWord(poseRefIndex)} IS THE POSE BLUEPRINT]:
        - STATUS: GHOST REFERENCE (Washed out).
        - USAGE: Trace the human pose/position only.
        - FORBIDDEN: Do NOT copy the clothing colors (black/dark) from this image.
        - BACKGROUND: Ignore the room/rug in this image. Create a new environment.`;
    }

    // D. Inject Analyzed Descriptions
    fullPrompt += `\n\n[CHARACTER DEFINITIONS - STRICT LOCK]:`;

    processedCharList.forEach((char) => {
        const imageIdx = charIndexMap[char.id];
        
        fullPrompt += `\n\n--- PLAYER ${char.id} (${char.gender.toUpperCase()}) ---`;
        fullPrompt += `\n- POSITION: Matches figure ${char.id} in Pose Blueprint.`;
        
        // VISUAL ANCHOR (TEXT) - This overrides the visual reference's clothes
        fullPrompt += `\n- OUTFIT (ABSOLUTE TRUTH): ${char.description}. (IGNORE any conflicting clothes in the pose reference).`;
        
        // VISUAL ANCHOR (IMAGE) - Use only for Face
        if (imageIdx) {
            fullPrompt += `\n- FACE IDENTITY SOURCE: ${indexToWord(imageIdx)}.`;
            fullPrompt += `\n- CLOTHING SOURCE: ${indexToWord(imageIdx)} (Use this image for clothing texture, NOT the pose reference).`;
        }
    });

    fullPrompt += `\n\n[FINAL PRE-RENDER CHECKLIST]:
    1. Count: Are there exactly ${charCount} people?
    2. Background: Is it a NEW 3D background (not the reference room)?
    3. Outfits: Did you fix the outfit colors to match the text description (e.g. White instead of Black)?`;

    parts.push({ text: fullPrompt });

    // ==========================================
    // PHASE 3: EXECUTE
    // ==========================================
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
    console.error("Gemini 3.0 Multi-Char Pipeline Error:", error);
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
