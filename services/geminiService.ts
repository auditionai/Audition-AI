import { GoogleGenAI } from "@google/genai";
import { getSystemApiKey, reportKeyFailure } from "./economyService";
import { createTextureSheet, optimizePayload, createSolidFence, createMasterReferenceSheet } from "../utils/imageProcessor";

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

// --- HELPER: RETRY WITH BACKOFF ---
const retryWithBackoff = async <T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delay: number = 2000,
    label: string = "Operation",
    onLog?: (msg: string) => void
): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        // Check for 503 (Service Unavailable), 429 (Too Many Requests), or 403 (Quota/Auth)
        const isTransient = 
            error?.status === 503 || 
            error?.status === 429 || 
            error?.status === 403 ||
            error?.status === 500 ||
            error?.status === 502 ||
            error?.status === 504 ||
            error?.message?.includes('503') || 
            error?.message?.includes('429') ||
            error?.message?.includes('403') ||
            error?.message?.includes('500') ||
            error?.message?.includes('502') ||
            error?.message?.includes('504') ||
            error?.message?.includes('Overloaded') ||
            error?.message?.includes('quota') ||
            error?.message?.includes('fetch failed') ||
            error?.message?.includes('NetworkError') ||
            error?.message?.includes('Failed to fetch') ||
            error?.message?.includes('timed out') ||
            error?.message?.includes('Timeout');

        if (retries > 0 && isTransient) {
            const msg = `${label} gặp sự cố mạng/quá tải. Đang đổi API Key và thử lại... (Còn ${retries} lần)`;
            console.warn(msg, error.message);
            if (onLog) onLog(`🔄 ${msg}`);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryWithBackoff(operation, retries - 1, delay * 1.5, label, onLog);
        }
        throw error;
    }
};

// --- NEW: ANALYZE STYLE IMAGE (For Admin) ---
export const analyzeStyleImage = async (imageBase64: string): Promise<string> => {
    const model = 'gemini-3-flash-preview'; // Fast & Cheap for analysis

    const result = await retryWithBackoff(
        async () => {
            const freshAi = await getAiClient();
            try {
                return await freshAi.models.generateContent({
                    model: model,
                    contents: {
                        parts: [
                            { text: "Analyze this image's visual style for a 3D character generator. Describe the lighting, texture, rendering engine vibe (e.g. Octane, Unreal), and artistic mood. Keep it concise, comma-separated keywords." },
                            { inlineData: { mimeType: 'image/png', data: cleanBase64(imageBase64) } }
                        ]
                    }
                });
            } catch (e) {
                reportKeyFailure((freshAi as any)._internalApiKey);
                throw e;
            }
        },
        3,
        2000,
        "Style Analysis"
    );

    return result.text || "";
};

// --- NEW: SMART STYLE ROUTER ---
const selectBestStyle = async (prompt: string, styles: any[]): Promise<any | null> => {
    if (!styles || styles.length === 0) return null;
    if (styles.length === 1) return styles[0]; // Only one choice

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
        const result = await retryWithBackoff(
            async () => {
                const freshAi = await getAiClient();
                try {
                    return await freshAi.models.generateContent({
                        model: model,
                        contents: { parts: [{ text: routerPrompt }] }
                    });
                } catch (e) {
                    reportKeyFailure((freshAi as any)._internalApiKey);
                    throw e;
                }
            },
            3,
            1000,
            "Style Selection"
        );
        
        const selectedId = result.text?.trim() || '';
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
    if (specificKey) {
        const ai = new GoogleGenAI({ apiKey: specificKey });
        (ai as any)._internalApiKey = specificKey;
        return ai;
    }

    // 2. DB Key (Rotation System - Priority)
    // We prioritize the DB keys to enable the Load Balancing / Rotation mechanism
    const dbKey = await getSystemApiKey();
    if (dbKey) {
        const ai = new GoogleGenAI({ apiKey: dbKey });
        (ai as any)._internalApiKey = dbKey;
        return ai;
    }

    // 3. Env Key (Fallback)
    if (process.env.API_KEY) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        (ai as any)._internalApiKey = process.env.API_KEY;
        return ai;
    }

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
    const model = 'gemini-3-flash-preview'; 

    try {
        const result = await retryWithBackoff(
            async () => {
                const freshAi = await getAiClient();
                try {
                    return await runWithTimeout(
                        freshAi.models.generateContent({
                            model: model,
                            contents: {
                                parts: [
                                    { text: "Analyze this image. Describe ONLY the 'Skeleton Pose', 'Camera Angle', and 'Composition'. IGNORE the character's clothes, hair, gender, face, and colors. Output ONLY the structural description (e.g. 'sitting cross-legged', 'low angle shot')." },
                                    { inlineData: { mimeType: 'image/png', data: cleanBase64(base64Data) } }
                                ]
                            }
                        }),
                        60000, // Increased to 60s
                        "Ref Analysis"
                    );
                } catch (e) {
                    reportKeyFailure((freshAi as any)._internalApiKey);
                    throw e;
                }
            },
            3,
            2000,
            "Ref Analysis"
        );
        return result.text || "";
    } catch (e) {
        console.warn("Ref analysis failed", e);
        return "";
    }
};

// --- PROMPT REASONING ENGINE (STEEL DISCIPLINE) ---
const optimizePromptWithThinking = async (
    rawPrompt: string, 
    styleContext: string = "", 
    poseContext: string = "",
    masterSheetPart: any | null = null
): Promise<string> => {
    try {
        const response = await retryWithBackoff(
            async () => {
                const freshAi = await getAiClient();
                try {
                    const parts: any[] = [];
                    if (masterSheetPart) {
                        parts.push(masterSheetPart);
                    }
                    parts.push({
                        text: `ROLE: EXPERT IMAGE GENERATION PROMPT ENGINEER.
MISSION: CONVERT INPUTS AND THE MASTER REFERENCE SHEET INTO A HIGHLY DETAILED, MACHINE-READABLE PROMPT.

INPUT DATA:
1. USER_COMMAND: "${rawPrompt}"
2. STYLE_MANDATE: "${styleContext}"
3. POSE_CONSTRAINT: "${poseContext}"

The attached image is a MASTER REFERENCE SHEET containing multiple labeled sections:
1. STYLE REFERENCE: Defines the Lighting, Texture, Render Quality, and Art Style.
2. POSE REFERENCE: Defines the Bone structure, Camera Angle, and Composition.
3. CHARACTER REFERENCE: Defines the Character's Identity (Face), Outfit (Clothes), Hair, and Accessories.

STRICT RULES:
- Write ONLY the final image generation prompt. Do not include any explanations or conversational text.
- Make it highly descriptive, focusing on visual details, lighting, camera angle, character appearance, and atmosphere.
- Ensure the pose, style, and character details from the Master Reference Sheet are perfectly synthesized into the text prompt.
- CRITICAL: The character MUST wear the exact outfit from the CHARACTER REFERENCE unless the USER_COMMAND explicitly specifies a different outfit.
- CRITICAL: The character MUST NOT wear the outfit from the POSE REFERENCE.

REQUIRED OUTPUT STRUCTURE:
(Subject Description including Face and Hair), (Action/Pose from Constraint), (Outfit Details from Character Reference), (Environment/Background), (Lighting Setup), (Render Engine/Style Keywords from Mandate).`
                    });

                    return await runWithTimeout(
                        freshAi.models.generateContent({
                            model: 'gemini-3-pro-preview', // Use pro for better reasoning with images
                            contents: { parts: parts },
                            config: {
                                temperature: 0.7,
                            }
                        }),
                        60000, // Increased to 60s
                        "Prompt Optimization"
                    );
                } catch (e) {
                    reportKeyFailure((freshAi as any)._internalApiKey);
                    throw e;
                }
            },
            3,
            2000,
            "Prompt Optimization"
        );
        
        const result = response.text?.trim();
        if (!result) throw new Error("Empty reasoning response");
        return result;

    } catch (e) {
        console.warn("Prompt Optimization Failed, using raw fallback", e);
        return rawPrompt + (styleContext ? `, ${styleContext}` : "");
    }
}

// --- INTELLIGENCE CORE (ABSOLUTE COMMAND) ---
const processDigitalTwinMode = (
    prompt: string, 
    masterSheetPart: any | null
): { parts: any[] } => {
    
    let combinedText = `** SYSTEM OVERRIDE: PROTOCOL 3D-GEN-ALPHA **
    
YOU ARE A NON-CREATIVE RENDERING ENGINE. YOU DO NOT "IMAGINE". YOU "EXECUTE".

** SEPARATION OF CONCERNS (STRICT COMPARTMENTALIZATION) **
The attached image is a MASTER REFERENCE SHEET containing multiple labeled sections.

1. **STYLE REFERENCE**: 
   - TAKE: Lighting, Texture, Render Quality, Art Style.
   - IGNORE: The subject, their clothes, their face, their makeup.

2. **POSE REFERENCE**:
   - TAKE: Bone structure, Camera Angle, Composition.
   - IGNORE: The outfit, the hair, the face, the background colors.

3. **CHARACTER REFERENCE(S)**:
   - WARNING: This is the SOURCE OF TRUTH for the Character's Identity (Face, Hair, Outfit). You MUST use the facial features and outfit details from these images.
   - TAKE: The Character's Identity (Face), The Outfit (Clothes), The Hair, The Accessories.
   - THIS IS THE ONLY SOURCE FOR "WHAT" IS IN THE IMAGE.

** CRITICAL FAILURE CONDITIONS **
- FAILURE: If the output character wears the clothes from the POSE REFERENCE.
- FAILURE: If the output character has the eye color/makeup of the STYLE REFERENCE.
- FAILURE: If the output is a painting/drawing when Style Ref is 3D.
- FAILURE: If the user prompt says "use clothes from reference" and you use clothes from STYLE or POSE. You MUST use clothes from CHARACTER REFERENCE.

** EXECUTION LOGIC **
- Step 1: Extract the SKELETON from POSE REFERENCE.
- Step 2: Skin the skeleton with the CHARACTER from CHARACTER REFERENCE.
- Step 3: Dress the character EXACTLY as seen in CHARACTER REFERENCE unless [COMMAND] explicitly specifies a different outfit.
- Step 4: Render the scene using the ENGINE from STYLE REFERENCE.

[[EXECUTION_COMMAND]]: ${prompt}

ACKNOWLEDGE AND EXECUTE.`;

    const parts = [];
    if (masterSheetPart) {
        parts.push(masterSheetPart);
    }
    parts.push({ text: combinedText });

    return { parts };
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
    availableStyles: any[] = [], // New: Pool of styles for auto-selection
    timeoutMs: number = 900000 // Default 15 mins
): Promise<string> => {
    onLog("Initializing Gemini 3.0 Pro Pipeline...");
    
    const model = 'gemini-3-pro-image-preview'; 
    
    // 1. PROCESS REFERENCE IMAGE (VISUAL & TEXTUAL ANALYSIS)
    let cleanRefImage: string | null = null;
    let poseDescription = "";
    
    if (refImageBase64) {
        onLog("Step 1: Analyzing Reference Image (Pose & BG)...");
        if (refImageBase64.startsWith('data:') || refImageBase64.length > 100) {
             cleanRefImage = cleanBase64(refImageBase64);
            // Call AI to analyze pose
            poseDescription = await analyzeReferenceImage(cleanRefImage);
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
    let cleanStyleImage: string | null = null;
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
            
            cleanStyleImage = cleanBase64(styleData);
        } catch (e) {
            console.warn("Failed to load style reference", e);
        }
    }

    // 4. PREPARE CHARACTERS
    const charBase64s: string[] = [];
    for (const char of characters) {
        if (char.image && char.faceImage) {
            const sheetBase64 = await createTextureSheet(char.image, char.faceImage);
            charBase64s.push(cleanBase64(sheetBase64));
        } else if (char.image) {
            charBase64s.push(cleanBase64(char.image));
        } else if (char.faceImage) {
            charBase64s.push(cleanBase64(char.faceImage));
        }
    }

    // 5. CREATE MASTER REFERENCE SHEET
    onLog("Step 4: AI Synthesizing All Visual Data (Master Sheet)...");
    let masterSheetPart = null;
    const masterSheetBase64 = await createMasterReferenceSheet(
        cleanStyleImage ? `data:image/jpeg;base64,${cleanStyleImage}` : null,
        cleanRefImage ? `data:image/jpeg;base64,${cleanRefImage}` : null,
        charBase64s.map(b64 => `data:image/jpeg;base64,${b64}`)
    );

    if (masterSheetBase64) {
        const cleanMasterSheet = cleanBase64(masterSheetBase64);
        try {
            const fileUri = await uploadToGemini(cleanMasterSheet, 'image/jpeg');
            masterSheetPart = {
                fileData: {
                    mimeType: 'image/jpeg',
                    fileUri: fileUri
                }
            };
        } catch (e) {
            console.warn("Upload failed, falling back to inlineData", e);
            masterSheetPart = {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: cleanMasterSheet
                }
            };
        }
    }

    // 6. PROMPT OPTIMIZATION (MERGING ALL CONTEXTS)
    onLog("Step 5: Generating Perfect Image Prompt...");
    const optimizedPrompt = await optimizePromptWithThinking(prompt, styleKeywords, poseDescription, masterSheetPart);
    
    // 7. FINAL ASSEMBLY
    onLog("Step 6: Sending to Generation Grid (Gemini 3.0 Pro)...");
    
    // For the final image generation, we ONLY send the optimized prompt and the character's face/body as the subject reference.
    // We DO NOT send the Master Sheet to the image model, because it will confuse the image model (it's a grid).
    const finalParts: any[] = [];
    
    // Add character reference (just the first character's image) to ensure the face matches
    if (charBase64s.length > 0) {
        finalParts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: charBase64s[0]
            }
        });
    }
    
    finalParts.push({ text: optimizedPrompt });

    const config: any = {
        imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution
        }
    };

    if (useSearch) {
        config.tools = [{ google_search: {} }];
    }

    const response = await retryWithBackoff(
        async () => {
            const freshAi = await getAiClient();
            const currentKey = (freshAi as any)._internalApiKey;
            const shortKey = currentKey ? currentKey.substring(0, 4) + '...' + currentKey.slice(-4) : 'Default';
            onLog(`> Đang dùng API Key: ${shortKey}`);
            
            try {
                return await runWithTimeout(
                    freshAi.models.generateContent({
                        model: model,
                        contents: { parts: finalParts },
                        config: config
                    }),
                    timeoutMs, // Dynamic Timeout
                    "Image Generation"
                );
            } catch (e: any) {
                reportKeyFailure((freshAi as any)._internalApiKey);
                throw e;
            }
        },
        3,
        2000,
        "Image Generation",
        onLog
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
    // gemini-2.5-flash-image for standard editing per guidelines
    const model = 'gemini-2.5-flash-image'; 

    const response = await retryWithBackoff(
        async () => {
            const freshAi = await getAiClient();
            try {
                return await runWithTimeout(
                    freshAi.models.generateContent({
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
            } catch (e) {
                reportKeyFailure((freshAi as any)._internalApiKey);
                throw e;
            }
        },
        3,
        2000,
        "Image Editing"
    );

    const result = extractImage(response);
    if (!result) throw new Error("Editing failed: No image output");
    return result;
}
