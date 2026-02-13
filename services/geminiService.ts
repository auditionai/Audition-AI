
import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";

// Helper to get the best available API Key ASYNC
const getDynamicApiKey = async (): Promise<string> => {
    // 1. Check Database (Supabase 'system_config')
    const dbKey = await getSystemApiKey();
    if (dbKey && dbKey.trim().length > 0) return dbKey.trim();
    
    // 2. Fallback to Environment Variable
    return process.env.API_KEY || "";
};

// Helper to create a fresh client instance ASYNC
const getAiClient = async () => {
    const key = await getDynamicApiKey();
    if (!key) throw new Error("API Key missing. Please configure in Admin > System.");
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
    // Model: gemini-3-pro-image-preview
    // Using Pro model is essential for understanding the "Solid Fence" structural conditioning.
    const model = 'gemini-3-pro-image-preview';
    
    const parts: any[] = [];
    let imageIndexCounter = 0;
    let styleRefIndex = -1;
    let faceRefIndex = -1;
    
    // 1. Add "Solid Fence" Body/Structure Reference
    // This image has already been pre-processed with the #808080 background and black border.
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

    // 2. Add Face Reference (Face ID Pipeline)
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

    // 3. Construct Contextual Prompt with STRUCTURAL CONDITIONING instructions
    let fullPrompt = `Generate a photorealistic 3D masterpiece based on: "${prompt}".`;
    
    const indexToWord = (idx: number) => idx === 1 ? 'first' : 'second';

    if (styleRefIndex > 0) {
        // Advanced instruction for the Vision Encoder to interpret the Solid Fence
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
    let ai;
    // Ensure key is trimmed to avoid whitespace issues
    const key = testKey ? testKey.trim() : (await getDynamicApiKey()).trim();
    
    if (!key) return false;

    ai = new GoogleGenAI({ apiKey: key });
    
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: 'ping' }] }, // Use explicit structure
      config: { maxOutputTokens: 1 }
    });
    return true;
  } catch (error) {
    console.error("Gemini Health Check Failed:", error);
    return false;
  }
}
