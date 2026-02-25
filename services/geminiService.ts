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
                model: 'gemini-2.5-flash', // Use Flash for fast ping
                contents: { parts: [{ text: "Hello" }] }
            }),
            15000, // 15s is enough for Flash
            "API Key Test"
        );
        return true;
    } catch (e) {
        console.warn("API Key Test Failed", e);
        return false;
    }
};

const uploadToGemini = async (input: string, mimeType: string): Promise<string> => {
    return retryWithBackoff(
        async () => {
            try {
                const ai = await getAiClient();
                let blob: Blob;

                // Check if input is a URL
                if (input.startsWith('http')) {
                    const resp = await fetch(input);
                    if (!resp.ok) throw new Error(`Failed to fetch URL: ${resp.statusText}`);
                    blob = await resp.blob();
                } else {
                    // Assume Base64
                    const cleanData = cleanBase64(input);
                    const byteCharacters = atob(cleanData);
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
                        config: { displayName: `asset_${Date.now()}_${Math.random().toString(36).substring(7)}` }
                    }),
                    45000, // Increased to 45s for stability
                    "File Upload"
                );

                const file = (uploadResult as any).file || uploadResult;
                const fileUri = file?.uri;
                
                if (!fileUri) throw new Error("No URI returned from upload");

                // --- WAIT FOR ACTIVE STATE (POLLING) ---
                let state = file.state;
                let attempts = 0;
                while (state === 'PROCESSING' && attempts < 15) { // Increased attempts
                    await new Promise(r => setTimeout(r, 2000)); // Wait 2s
                    try {
                        const fileStatus = await ai.files.get({ name: file.name });
                        state = fileStatus.file.state;
                        // console.log(`[System] File ${file.name} state: ${state}`);
                    } catch (e) {
                        console.warn("Check file state failed (transient)", e);
                    }
                    attempts++;
                }

                if (state === 'FAILED') throw new Error("File processing failed on Google side");
                
                return fileUri;
            } catch (e) {
                console.warn("Cloud upload attempt failed", e);
                throw e;
            }
        },
        3, // 3 Retries
        2000, // 2s Delay
        "Cloud Asset Upload"
    );
};

export const checkConnection = async (key?: string): Promise<boolean> => {
    try {
        const ai = await getAiClient(key);
        // Add Timeout to Ping - INCREASED TO 15s
        await runWithTimeout(
            ai.models.generateContent({
                model: 'gemini-2.5-flash', // Use Flash for fast ping
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
    onLog("Initializing Gemini 3.0 Pro Pipeline (Brutal Mode)...");
    
    const model = 'gemini-3-pro-image-preview'; 
    
    // --- STEP 1: PARALLEL ASSET AGGREGATION (THE BRUTAL PART) ---
    onLog("Step 1: Mass Aggregating Assets (Parallel Uploads)...");

    // We run ALL uploads and processing in parallel to maximize speed and expose failures early.
    // This includes: Style Image, Reference Image, and All Characters.

    const aggregationStart = Date.now();

    const [styleResult, refResult, charResults, optimizedPrompt] = await Promise.all([
        // A. STYLE IMAGE TASK
        (async () => {
            let finalStyleUrl = styleReferenceUrl;
            let styleKeywords = "";

            // 1. Select Style (if needed)
            if (!finalStyleUrl && availableStyles && availableStyles.length > 0) {
                const bestStyle = await selectBestStyle(prompt, availableStyles);
                if (bestStyle) {
                    finalStyleUrl = bestStyle.image_url;
                    styleKeywords = bestStyle.trigger_prompt || "";
                    onLog(`> [Style] Auto-selected: ${bestStyle.name}`);
                }
            } else if (finalStyleUrl) {
                const match = availableStyles.find(s => s.image_url === finalStyleUrl);
                if (match) styleKeywords = match.trigger_prompt || "";
            }

            // 2. Upload Style (if exists)
            let styleUri: string | null = null;
            if (finalStyleUrl) {
                try {
                    styleUri = await uploadToGemini(finalStyleUrl, 'image/jpeg');
                    onLog("> [Style] Uploaded ✅");
                } catch (e) {
                    console.warn("Style upload failed", e);
                    onLog("> [Style] Upload Failed (Non-Critical) ⚠️");
                }
            }
            return { uri: styleUri, keywords: styleKeywords };
        })(),

        // B. REFERENCE IMAGE TASK (CRITICAL)
        (async () => {
            if (!refImageBase64) return { uri: null, poseDesc: "" };
            
            try {
                // 1. Normalize & Optimize Image (CRITICAL FIX)
                // We MUST convert to JPEG and resize to prevent MIME type mismatches (PNG vs JPEG)
                // and reduce payload size.
                const optimizedRef = await optimizePayload(refImageBase64, 1024);
                const cleanRef = cleanBase64(optimizedRef);

                // 2. Analyze Pose (Best Effort)
                let poseDesc = "";
                try {
                    poseDesc = await analyzeReferenceImage(cleanRef);
                    if (poseDesc) onLog(`> [Ref] Pose Detected: ${poseDesc.substring(0, 30)}...`);
                } catch (e) { console.warn("Pose analysis failed", e); }

                // 3. Upload Reference (Always JPEG now)
                const uri = await uploadToGemini(cleanRef, 'image/jpeg');
                onLog("> [Ref] Source Image Uploaded ✅");
                return { uri, poseDesc };
            } catch (e) {
                console.error("Ref upload failed", e);
                throw new Error("CRITICAL: Failed to upload Reference Image.");
            }
        })(),

        // C. CHARACTERS TASK (CRITICAL)
        (async () => {
            if (characters.length === 0) return [];
            
            const results = await Promise.all(characters.map(async (char, idx) => {
                try {
                    let finalCharBase64 = "";
                    // Optimization Logic (Always returns JPEG)
                    if (char.image && char.faceImage) {
                        const sheetBase64 = await createTextureSheet(char.image, char.faceImage);
                        finalCharBase64 = await optimizePayload(sheetBase64, 1024);
                    } else if (char.image) {
                        finalCharBase64 = await optimizePayload(char.image, 1024);
                    } else if (char.faceImage) {
                        finalCharBase64 = await optimizePayload(char.faceImage, 1024);
                    }

                    if (!finalCharBase64) return null;

                    const uri = await uploadToGemini(cleanBase64(finalCharBase64), 'image/jpeg');
                    onLog(`> [Char ${idx + 1}] Uploaded ✅`);
                    return { uri, gender: char.gender, id: char.id };
                } catch (e) {
                    console.error(`Char ${idx + 1} failed`, e);
                    return null;
                }
            }));
            return results;
        })(),

        // D. PROMPT OPTIMIZATION TASK
        (async () => {
             // We pass empty context first, then merge later? 
             // Or we wait? 
             // Actually, prompt optimization needs style keywords and pose desc.
             // So this cannot be fully parallel if we want those inputs.
             // BUT, to be "Brutal", we can run it in parallel with just the raw prompt 
             // and append the other details manually later. This saves ~5-10s.
             return optimizePromptWithThinking(prompt, "", ""); 
        })()
    ]);

    const aggregationTime = ((Date.now() - aggregationStart) / 1000).toFixed(1);
    onLog(`Step 2: Aggregation Complete in ${aggregationTime}s.`);

    // --- STEP 2: PAYLOAD ASSEMBLY (SYNC) ---
    onLog("Step 3: Assembling Final Payload (Direct Command Mode)...");

    const styleUri = styleResult.uri;
    const styleKeywords = styleResult.keywords;
    const refUri = refResult.uri;
    const poseDesc = refResult.poseDesc;
    const validChars = charResults.filter(c => c !== null) as { uri: string, gender: string, id: number }[];

    // Validate Critical Data
    if (refImageBase64 && !refUri) throw new Error("CRITICAL: Reference Image missing after aggregation.");
    if (characters.length > 0 && validChars.length === 0) throw new Error("CRITICAL: No characters uploaded successfully.");

    // Construct Final Prompt (Merge Contexts)
    // Simplify the text prompt to focus on the visual outcome
    const finalContextPrompt = `
    COMMAND: ${prompt}
    ${styleKeywords ? `STYLE: ${styleKeywords}` : ''}
    ${poseDesc ? `POSE: ${poseDesc}` : ''}
    `;

    const finalParts: any[] = [];

    // A. STYLE REFERENCE (Stronger Instruction)
    if (styleUri) {
        finalParts.push({ text: "Input 1 [STYLE]: Transfer the art style, lighting, and rendering quality from this image. DO NOT copy the content." });
        finalParts.push({ fileData: { mimeType: 'image/jpeg', fileUri: styleUri } });
    }

    // B. POSE/STRUCTURE REFERENCE (Stronger Instruction)
    if (refUri) {
        finalParts.push({ text: "Input 2 [STRUCTURE]: COPY the camera angle, character pose, and scene composition from this image EXACTLY. This is the skeleton of the image." });
        finalParts.push({ fileData: { mimeType: 'image/jpeg', fileUri: refUri } });
    }

    // C. CHARACTER REFERENCES (Stronger Instruction)
    if (validChars.length > 0) {
        finalParts.push({ text: "Input 3+ [IDENTITY]: These are the characters in the scene. You MUST use their Face and Outfit." });
        validChars.forEach((char, index) => {
            finalParts.push({ fileData: { mimeType: 'image/jpeg', fileUri: char.uri } });
            finalParts.push({ text: `Target ${index + 1} (${char.gender}): REPLICATE the face and clothes from the image above.` });
        });
    }

    // D. FINAL INSTRUCTION (The "Binder")
    const finalInstruction = `
    GENERATE IMAGE REQUEST:
    1. BASE: Start with the composition and pose from Input 2 [STRUCTURE].
    2. CONTENT: Place the characters from Input 3+ [IDENTITY] into that pose.
    3. APPEARANCE: Dress them EXACTLY as shown in Input 3+. Keep their faces.
    4. RENDER: Apply the visual style from Input 1 [STYLE].
    
    PROMPT: ${finalContextPrompt}
    
    NEGATIVE PROMPT: changing the pose, changing the clothes, changing the face, cartoon, drawing, low quality.
    `;
    finalParts.push({ text: finalInstruction });

    // --- STEP 3: EXECUTION ---
    onLog(`Step 4: Sending Payload (${finalParts.length} parts) to Gemini 3.0 Pro...`);

    const config: any = {
        imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution
        }
    };
    if (useSearch) config.tools = [{ google_search: {} }];

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
                    timeoutMs, 
                    "Image Generation"
                );
            } catch (e: any) {
                const isOverload = e.message?.includes('503') || e.message?.includes('Overloaded') || e.status === 503;
                const isRateLimit = e.message?.includes('429') || e.status === 429;

                if (isOverload) console.warn("Gemini 3 Pro 503 (Overload). Retrying...");
                else if (isRateLimit) console.warn("Gemini 3 Pro 429 (Rate Limit). Retrying...");
                else reportKeyFailure((freshAi as any)._internalApiKey);
                
                throw e;
            }
        },
        5, 5000, "Image Generation", onLog
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
