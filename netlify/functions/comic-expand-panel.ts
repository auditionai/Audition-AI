
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Type } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await (supabaseAdmin.auth as any).getUser(token);
    
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    try {
        const { plot_summary, characters, style, genre, previous_panels } = JSON.parse(event.body || '{}');
        
        if (!plot_summary) return { statusCode: 400, body: JSON.stringify({ error: 'Missing plot summary.' }) };

        const { data: apiKeyData } = await supabaseAdmin
            .from('api_keys')
            .select('key_value')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (!apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Service busy.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // Inject the detailed AI analysis of characters here
        const characterContext = characters.map((c: any) => 
            `### Character: ${c.name}
             Visual Traits (Strictly adhere to this): ${c.description || "No specific description provided."}`
        ).join('\n\n');

        // Build Previous Context String (Story Memory)
        let memoryContext = "No previous context (Start of story).";
        if (previous_panels && Array.isArray(previous_panels) && previous_panels.length > 0) {
            // Take the last 3 panels to maintain context without overflowing tokens
            const recentPanels = previous_panels.slice(-3); 
            memoryContext = recentPanels.map((p: any) => 
                `[Panel ${p.panel_number}]: 
                 - Visual: ${p.visual_description}
                 - Dialogue: ${p.dialogue.map((d: any) => `${d.speaker}: ${d.text}`).join(' | ')}`
            ).join('\n');
        }

        const prompt = `
            You are an expert comic artist and writer.
            
            **Task:** Expand a brief plot summary into a detailed panel description and dialogue for the CURRENT PANEL.
            **Genre:** ${genre}
            **Art Style:** ${style}
            
            **STORY MEMORY (PREVIOUS CONTEXT):**
            The story so far (use this to maintain continuity, logic, and character psychology):
            ${memoryContext}
            
            **Character Visual Guide (MUST FOLLOW):**
            ${characterContext}
            
            **CURRENT Panel Plot Summary:** "${plot_summary}"
            
            **Requirements:**
            1.  **visual_description (English):** Write a highly detailed prompt for an AI Image Generator. 
                *   Describe the scene, background, lighting, camera angle.
                *   **CRITICAL:** When mentioning a character name (e.g., "${characters[0]?.name}"), you MUST explicitly include their visual traits from the guide above (e.g., "wearing white bucket hat", "pink hair"). Do not assume the renderer knows who they are.
                *   Ensure visual continuity with the previous panels if they are in the same scene.
            
            2.  **dialogue (Vietnamese):** Write natural, engaging dialogue for this panel.
                *   **MANDATORY:** Do NOT return an empty array. Every panel must have some text.
                *   If characters are speaking, use their names.
                *   If characters are silent or thinking, use "(Suy nghĩ)" or "(Nghĩ thầm)".
                *   If it is an action scene without speech, provide a **Narration Box** (Speaker: "Lời dẫn").
                *   Ensure dialogue flows logically from the "STORY MEMORY" provided above.
            
            Return a single JSON object.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        visual_description: { type: Type.STRING },
                        dialogue: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    speaker: { type: Type.STRING },
                                    text: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });

        let detailJson;
        try {
            const text = response.text || '{}';
            detailJson = JSON.parse(text);
            
            // Robustness check: Ensure dialogue is an array
            if (!Array.isArray(detailJson.dialogue)) {
                detailJson.dialogue = [{ speaker: "Lời dẫn", text: "..." }];
            }
        } catch (e) {
            // Fallback if JSON is broken
            detailJson = { 
                visual_description: plot_summary, 
                dialogue: [{ speaker: "Lời dẫn", text: "..." }] 
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(detailJson),
        };

    } catch (error: any) {
        console.error("Panel expansion failed:", error);
        // Return a failsafe object instead of 500 to prevent client crash loop if possible, 
        // or frontend handles 500 safely now. 
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
