
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

        // Determine Layout Type for Context
        const lowerStyle = style.toLowerCase();
        const isWebtoon = lowerStyle.includes('webtoon') || lowerStyle.includes('manhwa');
        const layoutContext = isWebtoon 
            ? "This is a Webtoon/Manhwa. Describe a SINGLE, large vertical image (Long Strip format). Focus on the main action/emotion of this section."
            : "This is a Traditional Comic Page. Describe a FULL PAGE LAYOUT consisting of 3-6 distinct panels arranged in a dynamic grid (e.g., wide establishing shot at top, smaller action panels below).";

        // 1. Prepare Character Context (Consistency)
        const characterContext = characters.map((c: any) => 
            `### Character Name: ${c.name}
             Visual Description (MUST FOLLOW): ${c.description || "No specific description provided."}`
        ).join('\n\n');

        // 2. Prepare Story Memory (Context Awareness)
        let memoryContext = "No previous context (Start of story).";
        if (previous_panels && Array.isArray(previous_panels) && previous_panels.length > 0) {
            // Use last 3 pages for immediate context
            const recentPanels = previous_panels.slice(-3); 
            memoryContext = recentPanels.map((p: any) => 
                `[Page ${p.panel_number}]: 
                 - Visual Context: ${p.visual_description}
                 - Dialogue: ${p.dialogue ? p.dialogue.map((d: any) => `${d.speaker}: ${d.text}`).join(' | ') : 'None'}`
            ).join('\n');
        }

        const prompt = `
            You are an expert comic artist and writer specializing in ${genre} stories.
            
            **Task:** Expand a brief plot summary into a detailed visual description (Prompt for AI Image Gen) and dialogue.
            
            **LAYOUT CONTEXT:** ${layoutContext}
            
            **STORY MEMORY (PREVIOUS CONTEXT):**
            Use this to maintain continuity, logic flow, and character state:
            ${memoryContext}
            
            **CHARACTER VISUAL GUIDE (STRICT CONSISTENCY):**
            ${characterContext}
            
            **CURRENT PAGE SUMMARY:** "${plot_summary}"
            **ART STYLE:** ${style}
            
            **Requirements:**
            1.  **visual_description (English):** Write a highly detailed prompt for an AI Image Generator (Midjourney/Stable Diffusion style). 
                *   **CRITICAL:** Describe the **Layout** (e.g., "A comic page split into 4 panels...").
                *   Describe what happens in each panel within the page.
                *   When mentioning a character, you MUST explicitly repeat their visual traits from the guide (e.g., "pink hair", "wearing hoodie").
                *   Ensure visual continuity with previous pages.
            
            2.  **dialogue (Vietnamese):** Write natural, engaging dialogue for this PAGE.
                *   If characters are speaking, use their names.
                *   If characters are silent or thinking, use "(Suy nghĩ)".
                *   If it is a narration box, use Speaker: "Lời dẫn".
                *   Ensure dialogue flows logically.
            
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
            
            if (!Array.isArray(detailJson.dialogue)) {
                detailJson.dialogue = [];
            }
        } catch (e) {
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
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
