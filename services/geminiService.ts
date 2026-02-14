
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

/**
 * generateImage - STRICT MULTI-CHARACTER MODE
 * 
 * @param prompt User prompt (Absolute Command)
 * @param aspectRatio Aspect ratio
 * @param styleRefBase64 TEMPLATE (Pose Only - The Blueprint)
 * @param characterDataList Array of Character Objects (Identity + Gender + Outfit)
 * @param resolution Image Size ('1K', '2K', '4K')
 * @param useSearch Enable Google Search
 */
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, // POSE BLUEPRINT
    characterDataList: CharacterData[] = [], // LIST OF CHARACTERS
    resolution: string = '2K',
    useSearch: boolean = false
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    const model = 'gemini-3-pro-image-preview'; 
    
    const parts: any[] = [];
    let imageIndexCounter = 0;
    
    // ==========================================
    // 1. ADD IMAGES TO PAYLOAD
    // ==========================================

    // A. Pose Reference (Always First if exists)
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

    // B. Character Identity Images (Dynamic List)
    // We map the Character ID to the Image Index for the Prompt
    const charIndexMap: Record<number, number> = {};

    for (const char of characterDataList) {
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

    const indexToWord = (idx: number) => {
        const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
        return words[idx - 1] || `${idx}th`;
    };

    // ==========================================
    // 2. CONSTRUCT SYSTEM PROMPT (The "Engine")
    // ==========================================
    
    const charCount = characterDataList.length;
    let fullPrompt = `ROLE: You are an expert 3D Character Artist and Anatomy Specialist.
    TASK: Generate a high-fidelity 3D render of a group of ${charCount} people.
    STYLE: Semi-realistic, Audition/Blind Box style, Unreal Engine 5, Octane Render.
    ANATOMY RULE: Each person MUST have exactly 2 arms and 2 legs. No extra limbs. No missing limbs. Hands must have 5 fingers.
    
    USER COMMAND: "${prompt}".`;

    // ==========================================
    // 3. POSE BLUEPRINT INSTRUCTION
    // ==========================================
    if (poseRefIndex > 0) {
        fullPrompt += `\n\n[IMAGE ${indexToWord(poseRefIndex)} IS THE POSE BLUEPRINT]:
        - STRICT COMPOSITION: You must copy the exact number of people, their positions, and their poses from this image.
        - IGNORE DETAILS: Do not look at the clothes, faces, or genders in this image. Only look at the skeletons/wireframes.
        - MAPPING: 
          * Person on Left/First = Player 1
          * Person next to them = Player 2
          * ... and so on.`;
    }

    // ==========================================
    // 4. CHARACTER ISOLATION & DEFINITION
    // ==========================================
    fullPrompt += `\n\n[CHARACTER DEFINITIONS - STRICT ISOLATION]:`;

    characterDataList.forEach((char) => {
        const imageIdx = charIndexMap[char.id];
        
        fullPrompt += `\n\n--- PLAYER ${char.id} ---`;
        fullPrompt += `\n- GENDER: ${char.gender.toUpperCase()}. (MUST RESPECT GENDER)`;
        
        if (imageIdx) {
            fullPrompt += `\n- SOURCE IMAGE: Image ${indexToWord(imageIdx)}.`;
            fullPrompt += `\n- FACE IDENTITY: Copy the face from Image ${indexToWord(imageIdx)} exactly.`;
            fullPrompt += `\n- OUTFIT: Copy the clothing/outfit from Image ${indexToWord(imageIdx)} exactly.`;
            fullPrompt += `\n- CONSTRAINT: Do NOT apply this outfit to any other player.`;
        } else {
            fullPrompt += `\n- APPEARANCE: Generate a beautiful, stylish 3D ${char.gender} character.`;
            fullPrompt += `\n- OUTFIT: High-fashion, futuristic or street style (matching the prompt theme).`;
        }
    });

    // ==========================================
    // 5. FINAL QUALITY & NEGATIVE CHECKS
    // ==========================================
    fullPrompt += `\n\n[FINAL QUALITY CHECKS]:
    1. COUNT CHECK: Are there exactly ${charCount} people? If not, regenerate.
    2. IDENTITY CHECK: Does Player 1 have Player 1's face? Does Player 2 have Player 2's face? NO MIXING.
    3. OUTFIT CHECK: Are the clothes distinct and correct for each source image?
    4. GENDER CHECK: Are the genders correct as defined above?
    5. ANATOMY CHECK: Scan for extra hands or legs. Fix immediately.`;

    parts.push({ text: fullPrompt });

    // ==========================================
    // 6. EXECUTE
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
    console.error("Gemini 3.0 Multi-Char Gen Error:", error);
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
