
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
        const { plot_summary, characters, style, genre, language } = JSON.parse(event.body || '{}');
        
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
            - The description must be a high-quality, detailed prompt for a comic book cover.
            - Focus on the main title composition, central characters, and dramatic lighting.
            - Layout Note should be "Full Page Poster".
            `;
        } else {
            panelInstruction = `
            **MODE: STORY PAGE**
            - Create exactly 3 to 5 panels based on the summary.
            - Break down the action logically.
            `;
        }

        const prompt = `
            You are a professional Comic Script Writer.
            
            **TASK:** Break down this Page Summary into detailed Panels for an AI image generator.
            
            **INPUT INFO:**
            - Page Summary: "${plot_summary}"
            - Genre: ${genre}
            - Style: ${style}
            - Language: ${targetLanguage}.
            - Characters:
            ${characterContext}
            
            ${panelInstruction}
            
            **STRICT RULES:**
            1. **description**: Must be a detailed visual instruction for an artist/AI. Describe the action, camera angle, background, and character expressions vividly. **MUST BE IN VIETNAMESE (TIẾNG VIỆT)**.
            2. **dialogues**: Must be natural conversation in **${targetLanguage}**. If it is a Cover Page, dialogue is usually empty or just the Title.
            3. **IMPORTANT**: Ensure every panel has a "description" and "dialogues" array.
            4. Output MUST be valid JSON matching the schema below.
            
            **JSON Schema:**
            {
              "layout_note": "String (e.g., 2x2 Grid, Dynamic Action, Full Page Poster)",
              "panels": [
                {
                  "panel_id": Integer,
                  "description": "String (Visual description in Vietnamese)",
                  "dialogues": [
                    { "speaker": "String (Character Name)", "text": "String (Dialogue Content)" }
                  ]
                }
              ]
            }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json"
            }
        });

        let resultJson = { layout_note: "Standard Layout", panels: [] };
        try {
            const text = response.text || '{}';
            // Extract JSON from potential markdown code blocks
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanText = jsonMatch ? jsonMatch[0] : text;
            
            const parsed = JSON.parse(cleanText);
            
            if (parsed && typeof parsed === 'object') {
                resultJson = parsed;
                // Normalize structure if AI wraps it weirdly
                if (!resultJson.panels || !Array.isArray(resultJson.panels)) {
                    if (Array.isArray((parsed as any).script?.panels)) resultJson = (parsed as any).script;
                    else if (Array.isArray((parsed as any).result?.panels)) resultJson = (parsed as any).result;
                    else {
                        // Fallback: If structure is weird, treat whole object as single panel context
                        resultJson.panels = [{ 
                            panel_id: 1, 
                            description: plot_summary + " (AI parsing fallback)", 
                            dialogues: [] 
                        }] as any;
                    }
                }
            }
        } catch (e) {
            console.error("JSON Parse Error:", e);
            // Fallback: If JSON fails completely, create a valid structure manually so the frontend doesn't crash
            resultJson.panels = [{ 
                panel_id: 1, 
                description: `Cảnh: ${plot_summary}. (Tự động tạo do lỗi định dạng AI).`, 
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
