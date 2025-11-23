
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

        const prompt = `
            You are an expert comic script writer using Gemini 2.5 Pro logic.
            
            **CRITICAL TASK:**
            Break down the 'Page Plot Summary' into a specific list of **PANELS** (Frames).
            The 'visual_description' MUST be formatted strictly for the Image Generator to understand the layout.
            
            **FORMAT FOR 'visual_description':**
            LAYOUT: [Describe overall grid, e.g. "5 Panels, Dynamic Grid"]
            PANEL 1: [Shot type (Close-up/Wide), Characters present, Action, Emotion, Background]
            PANEL 2: [Description...]
            PANEL 3: [Description...]
            ...
            
            **Genre:** ${genre} | **Style:** ${style}
            **Layout Mode:** ${layoutContext}
            
            **Context:**
            ${memoryContext}
            
            **Characters:**
            ${characterContext}
            
            **PAGE SUMMARY TO EXPAND:** "${plot_summary}"
            
            **Dialogues:**
            For each panel, if there is speech, provide the exact Vietnamese text.
            
            **Output JSON:**
            {
              "visual_description": "The full structured text with PANEL 1, PANEL 2... breakdown (as requested above)",
              "dialogue": [ 
                  {"speaker": "PANEL 1 - [Character Name]", "text": "[Vietnamese dialogue]"},
                  {"speaker": "PANEL 2 - [Character Name]", "text": "[Vietnamese dialogue]"},
                  ...
              ]
            }
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
