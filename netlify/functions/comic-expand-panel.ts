
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
        const { plot_summary, characters, style, genre, language, story_context } = JSON.parse(event.body || '{}');
        
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

        const characterContext = characters.map((c: any) => 
            `- ${c.name}: ${c.description ? c.description.substring(0, 100) + '...' : "N/A"}`
        ).join('\n');

        const targetLanguage = language || 'Tiếng Việt';

        // DETECT IF THIS IS A COVER PAGE
        const isCover = plot_summary.toLowerCase().includes('trang bìa') || 
                        plot_summary.toLowerCase().includes('cover') || 
                        plot_summary.toLowerCase().includes('poster');

        let panelInstruction = "";
        if (isCover) {
            panelInstruction = `
            **SPECIAL MODE: COVER PAGE / POSTER**
            - You MUST create EXACTLY 1 (ONE) Panel.
            - Layout Note should be "Full Page Poster".
            - Focus on title composition and main character introduction.
            `;
        } else {
            panelInstruction = `
            **MODE: STORY PAGE**
            - Create exactly 3 to 5 panels.
            - **CRITICAL - STAGING DIRECTIONS:** In the 'description' for each panel, you MUST specify where characters stand relative to each other (e.g., "Character A (Left) shouting at Character B (Right)"). This is required for the renderer to place speech bubbles correctly.
            `;
        }

        const prompt = `
            You are a professional Comic Script Writer (Layout & Staging Specialist).
            
            **TASK:** Break down this Page Summary into detailed Panels.
            
            **INPUT INFO:**
            - Page Summary: "${plot_summary}"
            - Genre: ${genre}
            - Style: ${style}
            - Language: ${targetLanguage}.
            - Characters:
            ${characterContext}
            
            **STORY CONTEXT (PREVIOUS EVENTS):**
            ${story_context || "Start of story."}
            *Use this context to ensure continuity (e.g., if they were injured in the previous page, they should look injured here).*
            
            ${panelInstruction}
            
            **STRICT RULES:**
            1. **description**: Detailed visual instruction in **VIETNAMESE (TIẾNG VIỆT)**. Include Staging directions (Left/Right/Center).
            2. **dialogues**: Natural conversation in **${targetLanguage}**.
            3. Output JSON.
            
            **JSON Schema:**
            {
              "layout_note": "String (e.g., Dynamic Action, 3-Tier Grid)",
              "panels": [
                {
                  "panel_id": Integer,
                  "description": "String (Visual description + Staging)",
                  "dialogues": [
                    { "speaker": "String", "text": "String" }
                  ]
                }
              ]
            }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: { responseMimeType: "application/json" }
        });

        let resultJson = { layout_note: "Standard Layout", panels: [] };
        try {
            const text = response.text || '{}';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanText = jsonMatch ? jsonMatch[0] : text;
            const parsed = JSON.parse(cleanText);
            
            if (parsed && typeof parsed === 'object') {
                resultJson = parsed;
                // Normalization logic
                if (!resultJson.panels || !Array.isArray(resultJson.panels)) {
                    if (Array.isArray((parsed as any).result?.panels)) resultJson = (parsed as any).result;
                    else resultJson.panels = [];
                }
            }
        } catch (e) {
            console.error("JSON Parse Error:", e);
             resultJson.panels = [{ 
                panel_id: 1, 
                description: `Cảnh: ${plot_summary}. (Lỗi phân tích AI).`, 
                dialogues: [] 
            }] as any;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ script_data: resultJson }),
        };

    } catch (error: any) {
        console.error("Panel expansion failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
