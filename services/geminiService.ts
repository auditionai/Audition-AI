

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
 * generateImage - Enhanced for "3D Game Character" Training
 * 
 * @param prompt User prompt
 * @param aspectRatio Aspect ratio
 * @param styleRefBase64 This is now treated as "STRUCTURAL/POSE REFERENCE" (e.g., the template image)
 * @param faceRefBase64 This is the "IDENTITY/FACE REFERENCE" (User upload)
 */
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string, // TEMPLATE IMAGE (Structure/Pose)
    faceRefBase64?: string  // USER UPLOAD (Face/Identity)
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    const model = 'gemini-3-pro-image-preview';
    
    const parts: any[] = [];
    let imageIndexCounter = 0;
    let structureRefIndex = -1;
    let identityRefIndex = -1;
    
    // 1. ADD STRUCTURAL REFERENCE (The Template/Sample Image)
    // This dictates Pose, Composition, Lighting angle.
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
    // This dictates Face features, and potentially clothing style if user wants.
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

    // 3. CONSTRUCT "EXPERT 3D ARTIST" PROMPT
    let fullPrompt = `You are a Senior 3D Character Artist for a high-end game studio. 
    Your task is to create a "3D Game Character Render" (Not a real photo).
    
    Target Style: Semi-realistic 3D, similar to 'Audition' or 'Blind Box' figures. 
    - Skin: Smooth, plastic/silicone texture, subsurface scattering.
    - Lighting: Studio softbox, rim lighting, volumetric fog.
    - Engine: Unreal Engine 5, Octane Render.
    - DO NOT generate: Real human skin texture, pores, imperfections, noise, grain.
    
    User Request: "${prompt}".`;

    // 4. INJECT "SOLID FENCE" LOGIC (Structure)
    if (structureRefIndex > 0) {
        fullPrompt += `\n\n[STRUCTURAL CONDITIONING - STAGE 1]:
        Look at the ${indexToWord(structureRefIndex)} image. This is the "MASTER POSE".
        - You MUST copy the exact pose, camera angle, and composition of this image.
        - Ignore the face in this image. Only use the body structure and background environment.
        - Use the area inside the black border (if visible) as the solid composition guide.`;
    }

    // 5. INJECT "FACE ID" LOGIC (Identity)
    if (identityRefIndex > 0) {
        fullPrompt += `\n\n[IDENTITY INJECTION - STAGE 2]:
        Look at the ${indexToWord(identityRefIndex)} image. This is the "FACE SOURCE".
        - Extract facial features (eyes, nose shape, mouth) from this image.
        - "Sprite Injection": Transplant these facial features onto the character in the Structural image.
        - CRITICAL: Adapt the face to the "3D Game Character" style. Do not paste a photorealistic face on a 3D body. Stylize the face to match the target aesthetic (bigger eyes, smoother skin).`;
    } else {
        // If no face uploaded, ensure the style is still 3D
        fullPrompt += `\n\nEnsure the character face is stylized, beautiful, 3D aesthetic.`;
    }

    parts.push({ text: fullPrompt });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio, 
          imageSize: "2K" 
        }
      }
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
