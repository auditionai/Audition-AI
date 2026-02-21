import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey } from "./economyService";
import { createTextureSheet, optimizePayload, createSolidFence } from "../utils/imageProcessor";

export interface CharacterData {
  id: number;
  gender: 'male' | 'female';
  image: string | null;
  faceImage?: string | null;
  shoesImage?: string | null;
  description?: string;
}

// --- HELPER: CLEAN BASE64 ---
const cleanBase64 = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, "");

// --- NEW: ANALYZE STYLE IMAGE (For Admin) ---
export const analyzeStyleImage = async (imageBase64: string): Promise<string> => {
    const ai = await getAiClient();
    const model = 'gemini-3-flash-preview'; // Fast & Cheap for analysis

    const result = await ai.models.generateContent({
        model: model,
        contents: {
            parts: [
                { text: "Analyze this image's visual style for a 3D character generator. Describe the lighting, texture, rendering engine vibe (e.g. Octane, Unreal), and artistic mood. Keep it concise, comma-separated keywords." },
                { inlineData: { mimeType: 'image/png', data: cleanBase64(imageBase64) } }
            ]
        }
    });

    return result.text || "";
};

// --- NEW: SMART STYLE ROUTER ---
const selectBestStyle = async (prompt: string, styles: any[]): Promise<any | null> => {
    if (!styles || styles.length === 0) return null;
    if (styles.length === 1) return styles[0]; // Only one choice

    const ai = await getAiClient();
    // Use Flash for fast routing
    const model = 'gemini-3-flash-preview'; 

    const styleList = styles.map(s => `- ID: ${s.id} | Name: ${s.name} | Keywords: ${s.trigger_prompt}`).join('\n');

    const routerPrompt = `
    User Prompt: "${prompt}"

    Available Styles:
    ${styleList}

    Task: Select the ONE best matching style ID for this prompt. 
    If the prompt asks for a specific vibe (e.g. "cute", "dark", "neon"), pick the closest match.
    If unsure, pick the one marked "Default" or the most generic one.
    
    Return ONLY the ID.
    `;

    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: routerPrompt }] }
        });
        
        const selectedId = result.text?.trim();
        const match = styles.find(s => s.id === selectedId || selectedId.includes(s.id));
        return match || styles[0]; // Fallback to first
    } catch (e) {
        console.warn("Style routing failed, using default", e);
        return styles[0];
    }
};

// --- INTELLIGENCE CORE ---
const runWithTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out (${ms/1000}s)`)), ms);
    });
    return Promise.race([
        promise.then(val => { clearTimeout(timer); return val; }),
        timeoutPromise
    ]);
};

// Cấu hình timeout cao hơn cho Client (mặc định fetch là ngắn)
const getAiClient = async (specificKey?: string) => {
    // 1. Specific key (testing)
    if (specificKey) return new GoogleGenAI({ apiKey: specificKey });

    // 2. DB Key (Rotation System - Priority)
    // We prioritize the DB keys to enable the Load Balancing / Rotation mechanism
    const dbKey = await getSystemApiKey();
    if (dbKey) return new GoogleGenAI({ apiKey: dbKey });

    // 3. Env Key (Fallback)
    if (process.env.API_KEY) return new GoogleGenAI({ apiKey: process.env.API_KEY });

    throw new Error("API Key missing. Set process.env.API_KEY or configure in Admin.");
};

// --- ERROR HANDLER & EXTRACTOR ---
const extractImage = (response: any): string | null => {
    // 1. Kiểm tra cấu trúc cơ bản
    if (!response) {
        throw new Error("No response from server");
    }

    // 2. Kiểm tra Safety Block (Lỗi phổ biến nhất)
    if (response.promptFeedback?.blockReason) {
        console.warn("Blocked by Safety:", response.promptFeedback);
        throw new Error(`Safety Block: ${response.promptFeedback.blockReason}`);
    }

    // 3. Kiểm tra Candidates
    if (!response.candidates || response.candidates.length === 0) {
        console.warn("No candidates returned.");
        throw new Error("No candidates returned (Safety or Server Error)");
    }

    const candidate = response.candidates[0];

    // 4. Kiểm tra Finish Reason của Candidate
    if (candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
        // Nếu bị chặn ở mức candidate
        if (candidate.finishReason === "SAFETY") {
             throw new Error("Safety Block: Content Violation");
        }
        console.warn("Abnormal finish reason:", candidate.finishReason);
    }

    // 5. Trích xuất ảnh an toàn
    if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    }

    throw new Error("No image data found in response");
};

const uploadToGemini = async (base64Data: string, mimeType: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        const byteCharacters = atob(cleanBase64(base64Data));
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });

        // Add Timeout to Upload
        const uploadResult = await runWithTimeout(
            ai.files.upload({
                file: blob,
                config: { displayName: `ref_img_${Date.now()}` }
            }),
            20000, // 20s
            "File Upload"
        );

        const fileUri = (uploadResult as any).file?.uri || (uploadResult as any).uri;
        if (!fileUri) throw new Error("No URI returned");
        
        return fileUri;
    } catch (e) {
        console.warn("Cloud upload failed, falling back to inline", e);
        throw e;
    }
};

export const checkConnection = async (key?: string): Promise<boolean> => {
    try {
        const ai = await getAiClient(key);
        // Add Timeout to Ping - INCREASED TO 15s
        await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: 'ping'
            }),
            15000,
            "Ping Connection"
        );
        return true;
    } catch (e) {
        console.error("Gemini Connection Check Failed", e);
        return false;
    }
};

// --- NEW: ANALYZE REFERENCE IMAGE (POSE/BG) ---
const analyzeReferenceImage = async (base64Data: string): Promise<string> => {
    const ai = await getAiClient();
    const model = 'gemini-3-flash-preview'; 

    try {
        const result = await runWithTimeout(
            ai.models.generateContent({
                model: model,
                contents: {
                    parts: [
                        { text: "Analyze this image. Describe ONLY the 'Character Pose', 'Camera Angle', and 'Background Environment'. Do not describe the art style or colors. Keep it concise." },
                        { inlineData: { mimeType: 'image/png', data: cleanBase64(base64Data) } }
                    ]
                }
            }),
            15000,
            "Ref Analysis"
        );
        return result.text || "";
    } catch (e) {
        console.warn("Ref analysis failed", e);
        return "";
    }
};

// --- PROMPT REASONING ENGINE ---
const optimizePromptWithThinking = async (rawPrompt: string, styleContext: string = "", poseContext: string = ""): Promise<string> => {
    try {
        const ai = await getAiClient();
        // Add Timeout to Thinking
        const response = await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `You are a Technical Prompt Engineer. Convert user input into professional 3D art keywords.
                
                INPUTS:
                - User Prompt: "${rawPrompt}"
                - Target Style: "${styleContext}"
                - Reference Pose/BG: "${poseContext}"

                INSTRUCTIONS:
                1. Merge User Prompt with the Reference Pose/BG (if any).
                2. Apply the Target Style keywords.
                3. Ensure the output describes the Subject, Action, Outfit, Environment, and Lighting clearly.
                
                OUTPUT: [Subject] + [Action] + [Outfit] + [Environment] + [Lighting] + [Style Tags].
                `,
            }),
            15000, // 15s
            "Prompt Optimization"
        );
        
        const result = response.text?.trim();
        if (!result) throw new Error("Empty reasoning response");
        return result;

    } catch (e) {
        console.warn("Prompt Optimization Failed/Timed out, using raw prompt", e);
        return rawPrompt + (styleContext ? `, ${styleContext}` : "");
    }
}

// --- INTELLIGENCE CORE ---
const processDigitalTwinMode = (
    prompt: string, 
    refImagePart: any | null, 
    charParts: any[], 
    styleReferencePart: any | null = null // New: Style Anchor
): { systemPrompt: string, parts: any[] } => {
    
    const parts = [];
    
    // 1. STYLE REFERENCE (HIGHEST PRIORITY)
    if (styleReferencePart) {
        parts.push({ text: "INPUT 1: STYLE REFERENCE IMAGE (VISUAL STANDARD). You MUST replicate this image's rendering style, lighting, and texture exactly." });
        parts.push(styleReferencePart);
    }

    // 2. POSE / COMPOSITION
    if (refImagePart) {
        parts.push({ text: "INPUT 2: POSE REFERENCE IMAGE. Follow this camera angle and character pose." });
        parts.push(refImagePart);
    }
    
    // 3. FACE IDENTITY
    if (charParts.length > 0) {
        parts.push({ text: `INPUT 3: CHARACTER FACE IDENTITY. Use these facial features.` });
        parts.push(...charParts);
    }
    
    parts.push({ text: `GENERATE COMMAND: ${prompt}` });

    const systemPrompt = `** SYSTEM DIRECTIVE: 3D CHARACTER GENERATION ENGINE **
    
    You are an advanced AI Image Generator. You have received multiple image inputs.
    
    **PRIORITY ORDER:**
    1. **STYLE**: The 'STYLE REFERENCE IMAGE' is the Absolute Truth for visual aesthetics (Lighting, Texture, Render Engine). Do not deviate.
    2. **IDENTITY**: The 'CHARACTER FACE IDENTITY' must be preserved in the final output.
    3. **POSE**: The 'POSE REFERENCE IMAGE' dictates the structure.
    4. **CONTENT**: The text prompt describes the outfit and scene details.

    **EXECUTION RULES:**
    - If the Style Reference is 3D, the output MUST be 3D.
    - If the Style Reference is Anime, the output MUST be Anime.
    - Ignore any style keywords in the text prompt if they conflict with the Style Reference Image.
    - Output must be High Resolution (8K).
    `;

    return { systemPrompt, parts };
};

export const generateImage = async (
    prompt: string,
    aspectRatio: string,
    refImageBase64: string | undefined,
    characters: any[],
    resolution: '1K' | '2K' | '4K' = '1K',
    modelType: 'flash' | 'pro' = 'pro',
    useSearch: boolean = false,
    useCloudRef: boolean = false,
    onLog: (msg: string) => void = () => {},
    styleReferenceUrl: string | null = null, // Manual override
    availableStyles: any[] = [] // New: Pool of styles for auto-selection
): Promise<string> => {
    onLog("Initializing Gemini 3.0 Pro Pipeline...");
    const ai = await getAiClient();
    
    const model = 'gemini-3-pro-image-preview'; 
    
    // 1. PROCESS REFERENCE IMAGE (VISUAL & TEXTUAL ANALYSIS)
    let refImagePart = null;
    let poseDescription = "";
    
    if (refImageBase64) {
        onLog("Step 1: Analyzing Reference Image (Pose & BG)...");
        if (refImageBase64.startsWith('data:') || refImageBase64.length > 100) {
             const cleanRef = cleanBase64(refImageBase64);
             refImagePart = {
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanRef
                }
            };
            // Call AI to analyze pose
            poseDescription = await analyzeReferenceImage(cleanRef);
            onLog(`> Pose Detected: ${poseDescription.substring(0, 50)}...`);
        }
    }

    // 2. SMART STYLE SELECTION
    let finalStyleUrl = styleReferenceUrl;
    let styleKeywords = "";
    
    if (!finalStyleUrl && availableStyles && availableStyles.length > 0) {
        onLog("Step 2: AI Selecting Best Style...");
        const bestStyle = await selectBestStyle(prompt, availableStyles);
        if (bestStyle) {
            onLog(`> Selected Style: ${bestStyle.name}`);
            finalStyleUrl = bestStyle.image_url;
            styleKeywords = bestStyle.trigger_prompt || "";
        }
    } else if (finalStyleUrl) {
        // If manual style, try to find keywords if possible, or just proceed
        const match = availableStyles.find(s => s.image_url === finalStyleUrl);
        if (match) styleKeywords = match.trigger_prompt || "";
    }

    // 3. LOAD STYLE IMAGE (VISUAL)
    let styleReferencePart = null;
    if (finalStyleUrl) {
        onLog("Step 3: Loading Style Reference Image...");
        try {
            let styleData = finalStyleUrl;
            if (finalStyleUrl.startsWith('http')) {
                const resp = await fetch(finalStyleUrl);
                const blob = await resp.blob();
                const reader = new FileReader();
                styleData = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            }
            
            styleReferencePart = {
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanBase64(styleData)
                }
            };
        } catch (e) {
            console.warn("Failed to load style reference", e);
        }
    }

    // 4. PREPARE CHARACTERS
    const charParts: any[] = [];
    for (const char of characters) {
        if (char.faceImage) {
            charParts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanBase64(char.faceImage)
                }
            });
        }
        if (char.image && !char.faceImage) { 
             charParts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanBase64(char.image)
                }
            });
        }
    }

    // 5. PROMPT OPTIMIZATION (MERGING ALL CONTEXTS)
    onLog("Step 4: Optimizing Prompt with Style & Pose Context...");
    const optimizedPrompt = await optimizePromptWithThinking(prompt, styleKeywords, poseDescription);
    
    // 6. FINAL ASSEMBLY
    const { systemPrompt, parts } = processDigitalTwinMode(optimizedPrompt, refImagePart, charParts, styleReferencePart);
    
    onLog("Step 5: Sending to Generation Grid (Gemini 3.0 Pro)...");

    const config: any = {
        imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution
        },
        systemInstruction: systemPrompt
    };

    if (useSearch) {
        config.tools = [{ googleSearch: {} }];
    }

    const response = await runWithTimeout(
        ai.models.generateContent({
            model: model,
            contents: { parts },
            config: config
        }),
        90000, // 90s for final gen
        "Image Generation"
    );

    onLog("Downloading result...");
    const result = extractImage(response);
    if (!result) throw new Error("Generation failed: No image output");
    return result;
};

export const editImageWithInstructions = async (
    base64Data: string, 
    instruction: string, 
    mimeType: string
): Promise<string> => {
    const ai = await getAiClient();
    
    // gemini-2.5-flash-image for standard editing per guidelines
    const model = 'gemini-2.5-flash-image'; 

    const response = await runWithTimeout(
        ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType || 'image/png',
                            data: cleanBase64(base64Data)
                        }
                    },
                    {
                        text: instruction
                    }
                ]
            }
        }),
        45000,
        "Image Editing"
    );

    const result = extractImage(response);
    if (!result) throw new Error("Editing failed: No image output");
    return result;
}
