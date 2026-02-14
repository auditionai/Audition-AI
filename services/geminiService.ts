
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

/**
 * generateImage - STRICT MODE + PRO FEATURES
 * 
 * @param prompt User prompt
 * @param aspectRatio Aspect ratio
 * @param styleRefBase64 TEMPLATE (Pose Only)
 * @param faceRefBase64 IDENTITY (Face + Outfit)
 * @param resolution Image Size ('1K', '2K', '4K') - Only for Pro
 * @param useSearch Enable Google Search Grounding - Only for Pro
 */
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, 
    faceRefBase64?: string,
    resolution: string = '2K',
    useSearch: boolean = false
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    // Default to Pro for high quality character gen
    const model = 'gemini-3-pro-image-preview'; 
    
    const parts: any[] = [];
    let imageIndexCounter = 0;
    let structureRefIndex = -1;
    let identityRefIndex = -1;
    
    // 1. ADD STRUCTURAL REFERENCE (The Template/Sample Image)
    if (styleRefBase64) {
      parts.push({
        inlineData: {
          data: styleRefBase64,
          mimeType: 'image/jpeg', 
        },
      });
      imageIndexCounter++;
      structureRefIndex = imageIndexCounter; 
    }

    // 2. ADD IDENTITY REFERENCE (The User's Uploaded Photo)
    if (faceRefBase64) {
        parts.push({
            inlineData: {
                data: faceRefBase64,
                mimeType: 'image/jpeg',
            }
        });
        imageIndexCounter++;
        identityRefIndex = imageIndexCounter;
    }

    const indexToWord = (idx: number) => idx === 1 ? 'first' : 'second';

    // 3. CONSTRUCT "ABSOLUTE COMMAND" PROMPT
    let fullPrompt = `ROLE: You are a strict 3D Rendering Engine. You must follow instructions precisely without creative deviation.
    
    TASK: Generate a 3D Game Character (Audition/Blind Box style).
    render_engine: Unreal Engine 5, Octane Render.
    skin_texture: Smooth, semi-realistic, doll-like.
    lighting: Studio softbox.
    
    USER COMMAND: "${prompt}".`;

    // 4. INJECT "STRICT POSE" LOGIC (Sample Image)
    if (structureRefIndex > 0) {
        fullPrompt += `\n\n[IMAGE ${indexToWord(structureRefIndex)} IS THE POSE REFERENCE]:
        - COMMAND: Use ONLY the pose, skeleton, camera angle, and background composition from this image.
        - FORBIDDEN: DO NOT COPY the clothing, outfit, colors, or hair from this image.
        - FORBIDDEN: DO NOT use the face from this image.
        - TREAT AS: A gray mannequin/wireframe for structure only.`;
    }

    // 5. INJECT "STRICT IDENTITY" LOGIC (User Upload)
    if (identityRefIndex > 0) {
        fullPrompt += `\n\n[IMAGE ${indexToWord(identityRefIndex)} IS THE CHARACTER SOURCE]:
        - IDENTITY COMMAND: You MUST copy the face, eyes, and facial features exactly from this image. 
        - EXPRESSION COMMAND: Keep the facial expression exactly as it is in this image unless the prompt explicitly says "smile" or "angry". Do not invent expressions.
        - OUTFIT COMMAND: Unless the User Command explicitly describes a new dress/outfit, you MUST COPY the clothing/outfit from THIS image.
        - LOGIC: Apply the Face and Outfit from Image ${indexToWord(identityRefIndex)} onto the Pose of Image ${indexToWord(structureRefIndex)}.`;
    } else {
        fullPrompt += `\n\nEnsure the character face is stylized, beautiful, 3D aesthetic.`;
    }

    // 6. FINAL OVERRIDE CHECKS
    fullPrompt += `\n\n[FINAL CHECKS]:
    1. Did you copy the clothes from the Pose Reference? IF YES -> STOP. REVERT. Use the Character Source clothes.
    2. Output must be 3D Render style, NOT photorealistic.`;

    parts.push({ text: fullPrompt });

    // 7. CONFIGURATION (Resolution & Search)
    const config: any = {
        imageConfig: {
          aspectRatio: aspectRatio, 
          imageSize: resolution // '1K', '2K', '4K'
        }
    };

    // Add Google Search Tool if enabled
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
    console.error("Gemini 3.0 Image Generation Error:", error);
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
