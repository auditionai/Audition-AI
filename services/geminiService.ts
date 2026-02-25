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
    const model = 'gemini-3.1-pro-preview'; // Use pro for stability

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
    const model = 'gemini-2.5-flash'; 

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
        // AGGRESSIVE FAIL-FAST: No retries, 5s timeout
        const freshAi = await getAiClient();
        const result = await runWithTimeout(
            freshAi.models.generateContent({
                model: model,
                contents: { parts: [{ text: routerPrompt }] }
            }),
            5000, // 5s Timeout
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

// --- NEW: TEST API KEY ---
export const testApiKey = async (): Promise<boolean> => {
    try {
        const freshAi = await getAiClient();
        await runWithTimeout(
            freshAi.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: { parts: [{ text: "Hello" }] }
            }),
            20000, // Increased to 20s
            "API Key Test"
        );
        return true;
    } catch (e) {
        console.warn("API Key Test Failed", e);
        return false;
    }
};

const uploadToGemini = async (input: string, mimeType: string): Promise<string> => {
    try {
        const ai = await getAiClient();
        let blob: Blob;

        // Check if input is a URL
        if (input.startsWith('http')) {
            const resp = await fetch(input);
            blob = await resp.blob();
        } else {
            // Assume Base64
            const byteCharacters = atob(cleanBase64(input));
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: mimeType });
        }

        // Add Timeout to Upload
        const uploadResult = await runWithTimeout(
            ai.files.upload({
                file: blob,
                config: { displayName: `ref_img_${Date.now()}` }
            }),
            30000, // Increased to 30s
            "File Upload"
        );

        const file = (uploadResult as any).file || uploadResult;
        const fileUri = file?.uri;
        
        if (!fileUri) throw new Error("No URI returned");

        // --- NEW: WAIT FOR ACTIVE STATE ---
        // Large files might be in 'PROCESSING' state. We must wait for 'ACTIVE'.
        let state = file.state;
        let attempts = 0;
        while (state === 'PROCESSING' && attempts < 10) {
            await new Promise(r => setTimeout(r, 2000)); // Wait 2s
            try {
                const fileStatus = await ai.files.get({ name: file.name });
                state = fileStatus.file.state;
                console.log(`[System] File ${file.name} state: ${state}`);
            } catch (e) {
                console.warn("Check file state failed", e);
            }
            attempts++;
        }

        if (state === 'FAILED') throw new Error("File processing failed on Google side");
        
        return fileUri;
    } catch (e) {
        console.warn("Cloud upload failed", e);
        throw e;
    }
};

export const checkConnection = async (key?: string): Promise<boolean> => {
    try {
        const ai = await getAiClient(key);
        // Add Timeout to Ping - INCREASED TO 15s
        await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
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
    const model = 'gemini-2.5-flash'; 

    try {
        // Optimize image before sending to reduce payload size and prevent 503
        const optimizedImage = await optimizePayload(`data:image/jpeg;base64,${cleanBase64(base64Data)}`, 768);
        const cleanOptimized = cleanBase64(optimizedImage);

        // AGGRESSIVE FAIL-FAST: No retries, short timeout (15s)
        // If analysis fails, we proceed without it rather than blocking generation.
        const freshAi = await getAiClient();
        try {
            const result = await runWithTimeout(
                freshAi.models.generateContent({
                    model: model,
                    contents: {
                        parts: [
                            { inlineData: { mimeType: 'image/jpeg', data: cleanOptimized } },
                            { text: "Analyze this image. Describe ONLY the 'Skeleton Pose', 'Camera Angle', and 'Composition'. IGNORE the character's clothes, hair, gender, face, and colors. Output ONLY the structural description (e.g. 'sitting cross-legged', 'low angle shot')." }
                        ]
                    }
                }),
                15000, // 15s timeout
                "Ref Analysis"
            );
            return result.text || "";
        } catch (e) {
            console.warn("Ref Analysis Skipped (Fail-Fast)", e);
            return ""; // Soft fail
        }
    } catch (e) {
        console.warn("Ref Analysis Setup Failed", e);
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
    // AGGRESSIVE FAIL-FAST: Use Flash for speed/stability. No retries. No key banning.
    // If this fails, we just use the raw prompt.
    const model = 'gemini-2.5-flash'; 

    try {
        const freshAi = await getAiClient();
        
        const parts: any[] = [];
        // Note: We intentionally IGNORE masterSheetPart here to prevent payload overload.
        // This step is purely text-based reasoning now.
        
        parts.push({
            text: `ROLE: PROMPT ENGINEER.
MISSION: Convert inputs into a detailed image generation prompt.

INPUTS:
1. COMMAND: "${rawPrompt}"
2. STYLE: "${styleContext}"
3. POSE: "${poseContext}"

RULES:
- Combine all inputs into a single, descriptive paragraph.
- Focus on visual details: lighting, camera angle, character appearance.
- Output ONLY the final prompt. No explanations.`
        });

        const result = await runWithTimeout(
            freshAi.models.generateContent({
                model: model,
                contents: { parts: parts },
                config: {
                    temperature: 0.7,
                }
            }),
            25000, // 25s Hard Timeout
            "Prompt Optimization"
        );

        const text = result.text?.trim();
        if (!text) throw new Error("Empty response");
        return text;

    } catch (e) {
        console.warn("Prompt Optimization Skipped (Fail-Fast)", e);
        // Fallback: Simple concatenation
        return `${rawPrompt}${styleContext ? ', ' + styleContext : ''}${poseContext ? ', ' + poseContext : ''}`;
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
    let refImageUri: string | null = null;
    
    if (refImageBase64) {
        onLog("Step 1: Analyzing Reference Image (Pose & BG)...");
        
        try {
            // Handle URL Input
            if (refImageBase64.startsWith('http')) {
                // For Analysis (needs Base64)
                const resp = await fetch(refImageBase64);
                const blob = await resp.blob();
                const reader = new FileReader();
                cleanRefImage = await new Promise((resolve) => {
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                
                // For Final Generation (use URL directly)
                refImageUri = await uploadToGemini(refImageBase64, 'image/jpeg');
            } 
            // Handle Base64 Input
            else if (refImageBase64.startsWith('data:') || refImageBase64.length > 100) {
                cleanRefImage = cleanBase64(refImageBase64);
                refImageUri = await uploadToGemini(cleanRefImage, 'image/jpeg');
            }

            if (cleanRefImage) {
                poseDescription = await analyzeReferenceImage(cleanRefImage);
                onLog(`> Pose Detected: ${poseDescription.substring(0, 50)}...`);
            }
        } catch (e) {
            console.warn("Ref Image Processing Failed", e);
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
    let styleImageUri: string | null = null;
    
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
            // Upload Style Image
            styleImageUri = await uploadToGemini(cleanStyleImage, 'image/jpeg');
            
        } catch (e) {
            console.warn("Failed to load/upload style reference", e);
        }
    }

    // 4. PREPARE CHARACTERS
    const charUris: string[] = [];
    
    for (const char of characters) {
        let finalCharBase64 = "";
        if (char.image && char.faceImage) {
            const sheetBase64 = await createTextureSheet(char.image, char.faceImage);
            const optimizedSheet = await optimizePayload(sheetBase64, 1024);
            finalCharBase64 = cleanBase64(optimizedSheet);
        } else if (char.image) {
            const optimized = await optimizePayload(char.image, 1024);
            finalCharBase64 = cleanBase64(optimized);
        } else if (char.faceImage) {
            const optimized = await optimizePayload(char.faceImage, 1024);
            finalCharBase64 = cleanBase64(optimized);
        }
        
        if (finalCharBase64) {
            try {
                const uri = await uploadToGemini(finalCharBase64, 'image/jpeg');
                charUris.push(uri);
            } catch (e) {
                console.warn("Failed to upload character sheet", e);
            }
        }
    }

    // 5. CREATE MASTER REFERENCE SHEET (SKIPPED - OPTIMIZATION)
    // We skip generating the Master Sheet to save time/bandwidth as it is not used in the final Pro generation
    // to avoid confusing the model with a grid layout.
    
    // 6. PROMPT OPTIMIZATION (MERGING ALL CONTEXTS)
    onLog("Step 4: Generating Perfect Image Prompt...");
    // REMOVED masterSheetPart from optimization to prevent 503 overload
    const optimizedPrompt = await optimizePromptWithThinking(prompt, styleKeywords, poseDescription);
    
    // 7. FINAL ASSEMBLY
    onLog("Step 5: Finalizing Data Payload (Integrity Check)...");
    
    // --- BRUTAL DATA VERIFICATION (THE IRONCLAD PROTOCOL) ---
    // 1. Verify Reference Image (CRITICAL)
    if (refImageBase64 && !refImageUri) {
         throw new Error("CRITICAL FAILURE: Reference Image (Pose) failed to upload. The pipeline cannot proceed without the Source of Truth.");
    }

    // 2. Verify Characters (CRITICAL)
    if (characters.length > 0) {
        if (charUris.length === 0) {
            throw new Error("CRITICAL FAILURE: Character assets failed to upload. Aborting to prevent ghost generation.");
        }
        if (charUris.length < characters.length) {
            onLog(`⚠️ WARNING: Partial Data. Only ${charUris.length}/${characters.length} characters were successfully uploaded.`);
        }
    }

    // 3. Verify Style (OPTIONAL but logged)
    if (finalStyleUrl && !styleImageUri) {
         onLog("⚠️ WARNING: Style Image failed to upload. Proceeding without Style Reference.");
    }

    const finalParts: any[] = [];
    
    // A. STYLE REFERENCE
    if (styleImageUri) {
        finalParts.push({ text: "🔴 IMAGE 1: STYLE REFERENCE (ART STYLE ONLY)\nINSTRUCTION: Extract ONLY the 3D rendering quality, lighting, texture, and artistic vibe. \nNEGATIVE CONSTRAINT: Do NOT copy the background, the characters, or any objects from this image. IGNORE the content of this image completely." });
        finalParts.push({
            fileData: {
                mimeType: 'image/jpeg',
                fileUri: styleImageUri
            }
        });
    }

    // B. POSE/STRUCTURE REFERENCE
    if (refImageUri) {
        finalParts.push({ text: "🔴 IMAGE 2: POSE & BACKGROUND REFERENCE (SOURCE OF TRUTH)\nINSTRUCTION: This image is the BLUEPRINT for the scene. \n1. BACKGROUND: You MUST use the background/environment from this image.\n2. POSE: You MUST match the character poses and camera angle exactly.\n3. COMPOSITION: The scene layout must be identical to this image." });
        finalParts.push({
            fileData: {
                mimeType: 'image/jpeg',
                fileUri: refImageUri
            }
        });
    }

    // C. CHARACTER REFERENCES
    let charPromptInstructions = "";
    if (charUris.length > 0) {
        finalParts.push({ text: "🔴 IMAGE 3+: CHARACTER REFERENCE(S)\nINSTRUCTION: These are the characters to be placed into the scene. Maintain their facial features and outfit details." });
        
        // Iterate through ALL uploaded character URIs
        charUris.forEach((uri, index) => {
            const charIndex = index + 1;
            const charInfo = characters[index]; // Get metadata (gender, id)
            
            finalParts.push({
                fileData: {
                    mimeType: 'image/jpeg',
                    fileUri: uri
                }
            });
            
            // Build specific mapping instruction
            charPromptInstructions += `\n- CHARACTER ${charIndex} (${charInfo.gender.toUpperCase()}): Use Face & Outfit from IMAGE ${index + 3}.`;
        });
    }
    
    // D. FINAL PROMPT
    const finalInstruction = `🔴 FINAL EXECUTION COMMAND:\n${optimizedPrompt}\n\nSTRICT SEPARATION OF CONCERNS:\n1. ART STYLE (Lighting, Texture, 3D Quality): MUST come from IMAGE 1.\n2. CONTENT (Background, Objects, Pose): MUST come from IMAGE 2.\n3. CHARACTERS (Face, Outfit): MUST come from IMAGE 3+.\n\nNEGATIVE PROMPT: Do not merge the background of Image 1 into the scene. Do not change the pose from Image 2.`;
    finalParts.push({ text: finalInstruction });

    // --- PAYLOAD SANITIZATION ---
    const sanitizedParts = finalParts.filter(p => {
        if (!p) return false;
        if (p.text && typeof p.text === 'string' && p.text.trim().length > 0) return true;
        if (p.fileData && p.fileData.fileUri) return true;
        return false;
    });

    if (sanitizedParts.length === 0) throw new Error("CRITICAL: Final payload is empty! Data assembly failed.");

    onLog(`Step 5: Sending Payload (${sanitizedParts.length} parts) to Gemini 3.0 Pro...`);

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
                // NO FALLBACK to Flash. User demands Pro quality.
                // We rely on retryWithBackoff to switch keys/wait on 503.
                
                const isOverload = e.message?.includes('503') || e.message?.includes('Overloaded') || e.status === 503;
                const isRateLimit = e.message?.includes('429') || e.status === 429;

                // If it's a 503 or 429, log it clearly but DO NOT kill the key immediately
                if (isOverload) {
                     console.warn("Gemini 3 Pro 503 (Overload). Retrying...");
                } else if (isRateLimit) {
                     console.warn("Gemini 3 Pro 429 (Rate Limit). Retrying...");
                } else {
                    // For other errors (400, 401, etc.), report key failure
                    reportKeyFailure((freshAi as any)._internalApiKey);
                }
                
                throw e;
            }
        },
        5, // INCREASED RETRIES: 5 attempts
        5000, // INCREASED DELAY: 5s initial wait
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
