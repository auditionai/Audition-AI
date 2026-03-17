import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { createMasterReferenceSheet, optimizePayload } from "../utils/imageProcessor";
import { getSystemApiKey, reportKeyFailure } from "./economyService";

export interface CharacterData { id: number; gender: 'male' | 'female'; image: string | null; faceImage?: string | null; shoesImage?: string | null; description?: string; }
const cleanBase64 = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, "");

const retryWithBackoff = async <T>(op: () => Promise<T>, retries = 10, delay = 5000, label = "Op", onLog?: (m: string) => void): Promise<T> => {
    try { return await op(); } catch (e: any) {
        const isTrans = [503, 429, 403, 500, 502, 504].includes(e?.status) || /503|429|403|500|502|504|Overloaded|quota|fetch failed|NetworkError|timed out|Timeout/.test(e?.message);
        if (retries > 0 && isTrans) {
            const isRate = e?.status === 429 || /429|quota/.test(e?.message);
            if (onLog) onLog(`🔄 ${label} retry...`);
            await new Promise(r => setTimeout(r, isRate ? 1000 : delay));
            return retryWithBackoff(op, retries - 1, delay, label, onLog);
        }
        throw e;
    }
};

const runWithTimeout = <T>(p: Promise<T>, ms: number, l: string): Promise<T> => {
    let t: any;
    const tp = new Promise<T>((_, r) => t = setTimeout(() => r(new Error(`${l} timeout`)), ms));
    return Promise.race([p.then(v => { clearTimeout(t); return v; }), tp]);
};

const getAiClient = async (tier: 'flash' | 'pro' = 'flash', key?: string) => {
    let apiKey = key || await getSystemApiKey(tier);
    if (!apiKey) throw new Error("No API Key");
    const isSA = apiKey.includes('project_id');
    if (!isSA) {
        const ai = new GoogleGenAI({ apiKey });
        return { ...ai, models: { generateContent: async (p: any) => { try { return await ai.models.generateContent(p); } catch (e: any) { if (e.status === 429 || e.status === 403) reportKeyFailure(apiKey!); throw e; } } } } as any;
    }
    return {
        models: {
            generateContent: async (p: any) => {
                const tr = await fetch('/api/get-vertex-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_account_json: apiKey }) });
                const { accessToken, projectId, location } = await tr.json();
                let m = p.model, v = 'v1beta1', g = false;
                if (m.includes('image')) { v = 'v1'; g = true; m = m.includes('flash') ? 'gemini-3.1-flash-image-preview' : 'gemini-3-pro-image-preview'; }
                else { m = m.includes('flash') ? 'gemini-3-flash-preview' : 'gemini-3.1-pro-preview'; }
                const url = g ? `https://aiplatform.googleapis.com/${v}/projects/${projectId}/locations/global/publishers/google/models/${m}:generateContent` : `https://${location}-aiplatform.googleapis.com/${v}/projects/${projectId}/locations/${location}/publishers/google/models/${m}:generateContent`;
                const payload: any = { contents: Array.isArray(p.contents) ? p.contents : [p.contents], generationConfig: p.config ? { ...p.config } : {} };
                if (p.config?.thinkingConfig) {
                    payload.generationConfig.thinking_config = { include_thoughts: true, ...p.config.thinkingConfig };
                    delete payload.generationConfig.thinkingConfig;
                }
                if (g) { payload.generationConfig.response_modalities = ["TEXT", "IMAGE"]; if (p.config?.imageConfig) payload.generationConfig.image_config = { aspect_ratio: p.config.imageConfig.aspectRatio, image_size: p.config.imageConfig.imageSize }; }
                const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error?.message || `Vertex Error: ${res.status}`);
                return { text: data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '', candidates: data.candidates };
            }
        }
    } as any;
};

const extractImage = (r: any): string | null => {
    const p = r?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    return p ? `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` : null;
};

const analyzeReferenceImage = async (b64: string): Promise<string> => {
    try {
        const opt = await optimizePayload(`data:image/jpeg;base64,${cleanBase64(b64)}`, 768);
        const ai = await getAiClient('flash');
        const res: any = await runWithTimeout(ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: cleanBase64(opt) } }, { text: "Analyze framing, pose, BG." }] } }), 30000, "Ref");
        return res.text || "";
    } catch (e) { return ""; }
};

const optimizePromptWithThinking = async (p: string, s = "", po = "", m: any = null): Promise<string> => {
    try {
        const ai = await getAiClient('pro');
        const pts: any[] = m ? [m] : [];
        pts.push({ text: `Optimize for 3D render: "${p}". Style: ${s}. Pose: ${po}.` });
        const res: any = await runWithTimeout(ai.models.generateContent({ 
            model: 'gemini-3.1-pro-preview', 
            contents: { parts: pts }, 
            config: { 
                temperature: 0.7,
                thinkingConfig: { thinkingLevel: 'HIGH' }
            } 
        }), 60000, "Opt");
        return res.text?.trim() || p;
    } catch (e) { return p; }
};

export const generateImage = async (prompt: string, aspectRatio: string, refImageBase64: string | undefined, characters: any[], resolution: any = '1K', modelType: 'flash' | 'pro' = 'pro', useSearch = false, useCloudRef = false, onLog?: (m: string) => void, styleUrl: string | null = null, styles: any[] = [], timeoutMs: number = 180000): Promise<string> => {
    const model = modelType === 'flash' ? 'gemini-3.1-flash-image-preview' : 'gemini-3-pro-image-preview';
    if (onLog) onLog(`Pipeline: ${model}`);
    let cleanRef = refImageBase64 ? cleanBase64(refImageBase64) : null;
    let pose = cleanRef ? await analyzeReferenceImage(cleanRef) : "";
    let styleK = "";
    if (styleUrl) { const s = styles.find(x => x.image_url === styleUrl); if (s) styleK = s.trigger_prompt || ""; }
    const charB64s = await Promise.all(characters.map(async c => cleanBase64(await optimizePayload(c.image || c.faceImage, 2048))));
    let msPart = null;
    if (charB64s.length > 0) { const ms = await createMasterReferenceSheet(null, null, charB64s); if (ms) msPart = { inlineData: { mimeType: 'image/jpeg', data: cleanBase64(ms) } }; }
    const optP = await optimizePromptWithThinking(prompt, styleK, pose, msPart);
    const pts: any[] = charB64s.map((b, i) => ([{ text: `Char ${i+1}:` }, { inlineData: { mimeType: 'image/jpeg', data: b } }])).flat();
    if (cleanRef) pts.push({ text: "Pose:" }, { inlineData: { mimeType: 'image/jpeg', data: cleanRef } });
    pts.push({ text: `Prompt: ${optP}. 3D game render, 8k.` });
    const res = await retryWithBackoff(async () => {
        const ai = await getAiClient(modelType);
        return await runWithTimeout(ai.models.generateContent({ model, contents: { parts: pts }, config: { imageConfig: { aspectRatio, imageSize: resolution } } }), timeoutMs, "Gen");
    }, 10, 8000, "Gen", onLog);
    return extractImage(res) || "";
};

export const analyzeStyleImage = async (b64: string): Promise<string> => {
    try {
        const ai = await getAiClient('pro');
        const res: any = await retryWithBackoff(() => ai.models.generateContent({ model: 'gemini-3.1-pro-preview', contents: { parts: [{ text: "Analyze style." }, { inlineData: { mimeType: 'image/png', data: cleanBase64(b64) } }] } }), 3, 2000, "Style");
        return res.text || "";
    } catch (e) { return ""; }
};

export const testApiKey = async (t: 'flash' | 'pro' = 'flash'): Promise<boolean> => {
    try { const ai = await getAiClient(t); await runWithTimeout(ai.models.generateContent({ model: t === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview', contents: { parts: [{ text: "Ping" }] } }), 15000, "Test"); return true; }
    catch (e) { return false; }
};

export const checkConnection = async (k?: string): Promise<{ success: boolean; message?: string }> => {
    try { const ai = await getAiClient('flash', k); await runWithTimeout(ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: { parts: [{ text: "Ping" }] } }), 15000, "Check"); return { success: true }; }
    catch (e: any) { return { success: false, message: e.message }; }
};

export const editImageWithInstructions = async (b64: string, inst: string, mime: string): Promise<string> => {
    const res = await retryWithBackoff(async () => { const ai = await getAiClient('flash'); return await ai.models.generateContent({ model: 'gemini-3.1-flash-image-preview', contents: { parts: [{ inlineData: { mimeType: mime || 'image/png', data: cleanBase64(b64) } }, { text: inst }] } }); }, 3, 2000, "Edit");
    return extractImage(res) || "";
};
