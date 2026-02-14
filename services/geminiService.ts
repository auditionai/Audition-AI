
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
    
    [CRITICAL SECURITY PROTOCOLS - READ CAREFULLY]:
    1. CHARACTER COUNT LOCK: There must be EXACTLY ${charCount} people in this image. NO MORE, NO LESS. If you see empty space, DO NOT fill it with extra people. Leave it empty or fill with background scenery.
    2. NO EXTRA LIMBS: Every character implies strict human anatomy. 2 arms, 2 legs.
    3. SEPARATION OF IDENTITY: Do not blend features between characters.
    
    USER COMMAND: "${prompt}".`;

    // --- CRITICAL FIX FOR POSE REF ---
    if (poseRefIndex > 0) {
        fullPrompt += `\n\n[IMAGE ${indexToWord(poseRefIndex)} IS THE POSE BLUEPRINT]:
        - FUNCTION: This image is ONLY for Skeleton/Pose data.
        - IGNORE PIXELS: Do NOT copy the background pixels. Do NOT copy the clothing pixels from this image.
        - BACKGROUND RULE: The background in this reference image is "Void/Null". You MUST replace it entirely with a NEW 3D environment based on the User Command.
        - ASPECT RATIO: Generate the image filling the full canvas. Extend the *new* background to the edges. Do NOT letterbox.`;
    }

    // D. Inject Analyzed Descriptions
    fullPrompt += `\n\n[CHARACTER DEFINITIONS - STRICT LOCK]:`;

    processedCharList.forEach((char) => {
        const imageIdx = charIndexMap[char.id];
        
        fullPrompt += `\n\n--- PLAYER ${char.id} (${char.gender.toUpperCase()}) ---`;
        fullPrompt += `\n- POSITION: Maps to the ${char.id === 1 ? 'Leftmost' : char.id === 2 ? 'Next' : char.id + 'th'} figure in the Pose Blueprint.`;
        
        // VISUAL ANCHOR (TEXT) - This overrides the visual reference's clothes
        fullPrompt += `\n- OUTFIT (ABSOLUTE TRUTH): ${char.description}. (You MUST render this outfit exactly. Do not change it. Do not be creative with the clothes).`;
        
        // VISUAL ANCHOR (IMAGE) - Use only for Face
        if (imageIdx) {
            fullPrompt += `\n- FACE IDENTITY SOURCE: ${indexToWord(imageIdx)}. Copy the face structure and features.`;
            fullPrompt += `\n- IGNORE SOURCE CLOTHES: Do not look at the clothes in ${indexToWord(imageIdx)} if they contradict the text description above.`;
        }
    });

    fullPrompt += `\n\n[FINAL PRE-RENDER CHECKLIST]:
    1. Count: Are there exactly ${charCount} people? (Delete any extras).
    2. Background: Is it a NEW 3D background? (Do not copy reference background).
    3. Outfits: Do they match the text descriptions for each player? (Do not swap clothes).
    4. Composition: Is the scene filling the whole ${aspectRatio} frame?`;

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
