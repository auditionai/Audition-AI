
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
        const { plot_summary, characters, style, genre, previous_panels, language } = JSON.parse(event.body || '{}');
        
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
            ? "This is a Webtoon/Manhwa (Vertical Scroll). Break the scene into 3-4 vertical flowing panels."
            : "This is a Traditional Comic Page. Break the scene into 4-6 distinct panels in a grid.";

        // 1. Prepare Character Context (Consistency)
        const characterContext = characters.map((c: any) => 
            `### ${c.name}: ${c.description || "N/A"}`
        ).join('\n');

        // 2. Prepare Story Memory
        let memoryContext = "No previous context.";
        if (previous_panels && Array.isArray(previous_panels) && previous_panels.length > 0) {
            const recentPanels = previous_panels
                .filter((p: any) => p.visual_description && !p.visual_description.startsWith('[')) // Filter out errors
                .slice(-3); 
            
            if (recentPanels.length > 0) {
                memoryContext = recentPanels.map((p: any) => 
                    `[Prev Page ${p.panel_number}]: ${p.visual_description.substring(0, 100)}...`
                ).join('\n');
            }
        }
        
        const targetLang = language || 'Tiếng Việt';

        const prompt = `
            You are a world-class comic script writer.
            
            **LANGUAGE REQUIREMENT:**
            - **CRITICAL:** You MUST write the content in **${targetLang}**.
            
            **TASK:**
            Expand the provided plot summary into a detailed comic script for ONE PAGE (Trang).
            Break it down into specific **PANELS** (Khung tranh).
            
            **INPUT:**
            - Plot Summary: "${plot_summary}"
            - Genre: ${genre}
            - Style: ${style}
            - Characters: ${characterContext}
            
            **OUTPUT FORMAT (JSON):**
            {
              "visual_description": "String containing the full script layout.",
              "dialogue": [
                { "speaker": "Name", "text": "Dialogue content" }
              ]
            }
            
            **GUIDELINES FOR 'visual_description':**
            - Use this EXACT format for the text string (use 'KHUNG' instead of 'PANEL' if Vietnamese):
              LAYOUT: [Describe the page layout, e.g., 5 panels, diagonal split...]
              KHUNG 1: [Visual description: Action, Camera Angle, Background, Lighting, Character Expressions...]
              KHUNG 2: [Visual description...]
              ...
            - The description MUST be detailed, cinematic, and describe WHAT IS HAPPENING visually.
            - Do NOT include dialogue lines in 'visual_description'. Keep it purely visual.
            
            **GUIDELINES FOR 'dialogue':**
            - Extract all dialogue lines.
            - Map them to the characters.
            - **IMPORTANT:** In the 'speaker' field, prefix with the Panel Number so we know where it goes.
              Example: "KHUNG 1 - Conan", "KHUNG 2 - Ran".
            - If a panel has no dialogue, skip it.
        `;

        // USE GEMINI 2.5 FLASH FOR SCRIPTING/TEXT GENERATION
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
