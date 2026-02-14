
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
 * Specifically targets PANTS/SHOES colors to override the pose reference.
 */
export const analyzeCharacterVisuals = async (base64Image: string, gender: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        // Use Flash for fast text analysis
        const model = 'gemini-2.5-flash'; 
        
        const prompt = `Analyze the person in this image.
        Target Gender: ${gender}.
        
        I need a strict visual breakdown for a 3D render.
        Identify the specific color and type of:
        1. Top/Shirt
        2. Bottom/Pants/Skirt (CRITICAL)
        3. Shoes (CRITICAL)
        
        OUTPUT format:
        "wearing [Top Color] [Top Type], [Bottom Color] [Bottom Type], [Shoe Color] [Shoe Type], [Hair Style]"
        
        Example: "wearing white suit jacket, white dress pants, white sneakers, silver hair"`;

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
            if (onProgress) onProgress(`Analyzing Player ${char.id} (Extracting Colors)...`);
            
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
    let fullPrompt = `ROLE: Strict 3D Scene Renderer.
    TASK: Render a group of ${charCount} characters. 
    
    USER COMMAND: "${prompt}".
    
    [STRICT COLOR OVERRIDE RULES]:
    The text descriptions below are the ABSOLUTE TRUTH for clothing colors.
    The Reference Images may contain conflicting colors. IGNORE THEM.
    If Text says "White Pants" and Image says "Black Pants", YOU MUST RENDER WHITE PANTS.`;

    // --- CRITICAL FIX FOR POSE REF ---
    if (poseRefIndex > 0) {
        fullPrompt += `\n\n[IMAGE ${indexToWord(poseRefIndex)} IS A 'GHOST' POSE GUIDE]:
        - This image has been chemically washed out (bleached).
        - It contains NO valid color information. It is faint grey/white.
        - USE IT ONLY FOR SKELETON POSITION (Where arms/legs are).
        - DO NOT USE IT FOR CLOTHING DARKNESS. Treat it as a transparent wireframe.`;
    }

    // D. Inject Analyzed Descriptions
    fullPrompt += `\n\n[CHARACTER SPECIFICATIONS]:`;

    processedCharList.forEach((char) => {
        const imageIdx = charIndexMap[char.id];
        
        fullPrompt += `\n\n--- PLAYER ${char.id} (${char.gender.toUpperCase()}) ---`;
        fullPrompt += `\n- POSITION: Matches figure ${char.id} in Ghost Guide.`;
        
        // VISUAL ANCHOR (TEXT) - High Priority
        fullPrompt += `\n- OUTFIT COMMAND: ${char.description}. (Apply these colors EXACTLY. Do not darken them based on shadows).`;
        
        // VISUAL ANCHOR (IMAGE) - Use only for Face
        if (imageIdx) {
            fullPrompt += `\n- FACE SOURCE: ${indexToWord(imageIdx)}.`;
            fullPrompt += `\n- CLOTHING TEXTURE SOURCE: ${indexToWord(imageIdx)} (Take fabric details from here, NOT the ghost guide).`;
        }
    });

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
