
import { getSystemApiKey } from "./economyService";

// Helper to get the best available API Key ASYNC
const getDynamicApiKey = async (): Promise<string> => {
    const dbKey = await getSystemApiKey();
    if (dbKey && dbKey.trim().length > 0) {
        return dbKey.trim();
    }
    return process.env.API_KEY || "";
};

// DYNAMIC IMPORT HELPER
// We do not import { GoogleGenAI } at the top level to avoid app crash on load.
const loadGeminiSDK = async () => {
    try {
        // Use a PINNED version to avoid 404s on @latest redirects
        // @ts-ignore
        const module = await import("https://esm.sh/@google/genai@0.1.2");
        return module.GoogleGenAI;
    } catch (e) {
        console.warn("Primary CDN failed, trying fallback...", e);
        try {
            // Fallback to generic URL if version specific fails
            // @ts-ignore
            const module = await import("https://esm.sh/@google/genai");
            return module.GoogleGenAI;
        } catch (e2) {
            console.error("CRITICAL: Failed to load Google GenAI SDK.", e2);
            throw new Error("Không thể tải thư viện AI. Vui lòng kiểm tra kết nối mạng.");
        }
    }
};

// Helper to create a fresh client instance ASYNC
const getAiClient = async () => {
    const key = await getDynamicApiKey();
    if (!key) throw new Error("Hệ thống chưa có API Key. Vui lòng cấu hình trong Admin > Hệ thống.");
    
    const GoogleGenAI = await loadGeminiSDK();
    return new GoogleGenAI({ apiKey: key });
};

// Helper to construct image output from response
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

export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    styleRefBase64?: string,
    faceRefBase64?: string
): Promise<string | null> => {
  
  try {
    const ai = await getAiClient();
    const model = 'gemini-3-pro-image-preview';
    
    const parts: any[] = [];
    let imageIndexCounter = 0;
    let styleRefIndex = -1;
    let faceRefIndex = -1;
    
    if (styleRefBase64) {
      parts.push({
        inlineData: {
          data: styleRefBase64,
          mimeType: 'image/jpeg', 
        },
      });
      imageIndexCounter++;
      styleRefIndex = imageIndexCounter; 
    }

    if (faceRefBase64) {
        parts.push({
            inlineData: {
                data: faceRefBase64,
                mimeType: 'image/jpeg',
            }
        });
        imageIndexCounter++;
        faceRefIndex = imageIndexCounter;
    }

    let fullPrompt = `Generate a photorealistic 3D masterpiece based on: "${prompt}".`;
    
    const indexToWord = (idx: number) => idx === 1 ? 'first' : 'second';

    if (styleRefIndex > 0) {
        fullPrompt += `\n[STRUCTURAL CONDITIONING]: Look at the ${indexToWord(styleRefIndex)} image. This is the master layout.
        - The area inside the BLACK BORDER is the "Visual Anchor". You must preserve the pose, composition, and structure of the subject inside this border exactly.
        - The GREY AREA (#808080) surrounding the border is the "Outpainting Zone". Fill this area with background details matching the prompt description.
        - Blend the subject seamlessly into the new environment while keeping their pose locked.`;
    }

    if (faceRefIndex > 0) {
        fullPrompt += `\n[FACE ID INJECTION]: Use the ${indexToWord(faceRefIndex)} attached image as the Face ID source.
        - "Sprite Injection": Extract the facial features from this reference and apply them to the main character in the structural layout.
        - Maintain identity, skin tone, and expression.`;
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

    let instructionText = `Instruction: ${prompt}. \nOutput: Please generate a high quality image that follows this instruction exactly.`;

    if (styleRefBase64) {
        parts.push({
            inlineData: {
                data: styleRefBase64,
                mimeType: 'image/jpeg',
            }
        });
        instructionText += `\nSTYLE GUIDE: Use the second attached image as a reference for color grading and texture.`;
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
        const systemInstruction = `You are an AI Prompt Expert. 
        Current Tool: "${featureName}".
        Task: Refine the user's input into a professional, detailed image generation prompt.
        Language: Keep the response in ${lang === 'vi' ? 'Vietnamese' : 'English'}.
        Constraint: Return ONLY the prompt text. No quotes, no explanations.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: currentInput || `Create a creative concept for ${featureName}`,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
            }
        });

        return response.text?.trim() || currentInput;
    } catch (error) {
        console.error("Prompt Suggestion Error:", error);
        return currentInput;
    }
}

export const checkConnection = async (testKey?: string): Promise<boolean> => {
  try {
    const key = testKey ? testKey.trim() : (await getDynamicApiKey()).trim();
    if (!key) return false;

    // Use dynamic import here too
    const GoogleGenAI = await loadGeminiSDK();
    const ai = new GoogleGenAI({ apiKey: key });
    
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: 'ping' }] }, 
      config: { maxOutputTokens: 1 }
    });
    return true;
  } catch (error) {
    console.error("Gemini Health Check Failed:", error);
    return false;
  }
}
