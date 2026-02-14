
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
    // We process each character strictly one by one to ensure no data leakage.
    
    const characterDescriptions: Record<number, string> = {};
    const processedCharList = [];

    for (const char of characterDataList) {
        if (char.image) {
            if (onProgress) onProgress(`Analyzing Player ${char.id} (Outfit & Identity)...`);
            
            // Artificial delay to prevent rate limits/timeouts if calling rapidly
            await new Promise(r => setTimeout(r, 1000));
            
            const description = await analyzeCharacterVisuals(char.image, char.gender);
            characterDescriptions[char.id] = description;
            
            // We keep the image for the main prompt too (Double Reference: Text + Image)
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
    let fullPrompt = `ROLE: Strict 3D Scene Renderer.
    TASK: Render a group of ${charCount} characters.
    
    [GLOBAL RULES]:
    1. ANATOMY: Absolute strictness. Each human has 2 arms, 2 legs. No fused bodies. No extra fingers.
    2. SEPARATION: Characters must be distinct entities. Do not blend their clothes.
    3. STYLE: 3D Render, Unreal Engine 5, Octane Render, Blind Box / Audition Game Style.
    
    USER COMMAND: "${prompt}".`;

    if (poseRefIndex > 0) {
        fullPrompt += `\n\n[COMPOSITION SOURCE: ${indexToWord(poseRefIndex)}]:
        - Use this image ONLY for POSE and POSITIONING.
        - MAPPING: 
          * Leftmost figure = Player 1.
          * Next figure to the right = Player 2.
          * ...and so on sequentially from Left to Right.`;
    }

    // D. Inject Analyzed Descriptions (The Solution to Mixing)
    fullPrompt += `\n\n[CHARACTER DEFINITIONS]:`;

    processedCharList.forEach((char) => {
        const imageIdx = charIndexMap[char.id];
        
        fullPrompt += `\n\n--- PLAYER ${char.id} (${char.gender.toUpperCase()}) ---`;
        fullPrompt += `\n- POSITION: This character is the ${char.id === 1 ? '1st from Left' : char.id === 2 ? '2nd from Left' : char.id + 'th from Left'}.`;
        
        // VISUAL ANCHOR (TEXT)
        fullPrompt += `\n- OUTFIT RULE: Must wear ${char.description}.`;
        
        // VISUAL ANCHOR (IMAGE)
        if (imageIdx) {
            fullPrompt += `\n- FACE SOURCE: Copy face features exactly from ${indexToWord(imageIdx)}.`;
            fullPrompt += `\n- OUTFIT SOURCE: Refer to ${indexToWord(imageIdx)} for clothing texture details, but DO NOT apply this outfit to other players.`;
        }
    });

    fullPrompt += `\n\n[FINAL QUALITY CHECK]:
    - Verify: Are there exactly ${charCount} people?
    - Verify: Does Player 1 have the correct outfit? Does Player 2 have the correct outfit?
    - Verify: Are genders correct?
    - Fix: Remove any extra limbs or distorted hands.`;

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
