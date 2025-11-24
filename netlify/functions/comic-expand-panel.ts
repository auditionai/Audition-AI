
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

        const prompt = `
            You are a professional Comic Script Writer.
            
            **TASK:** Break down this Page Summary into detailed Panels for an AI image generator and comic creation.
            
            **INPUT INFO:**
            - Page Summary: "${plot_summary}"
            - Genre: ${genre}
            - Style: ${style}
            - Language: ${targetLanguage} (The output dialogue must be in this language).
            - Characters:
            ${characterContext}
            
            **STRICT RULES:**
            1. Create exactly 3 to 5 panels based on the summary.
            2. **description**: Must be a detailed visual instruction for an artist/AI. Describe the action, camera angle, background, and character expressions vividly. (Use English for descriptions if possible for better AI generation later, but Vietnamese is acceptable).
            3. **dialogues**: Must be natural conversation in **${targetLanguage}**.
            4. **IMPORTANT**: Ensure every panel has a "description" and "dialogues" array (can be empty if silent).
            5. Output MUST be valid JSON matching the schema below.
            
            **JSON Schema:**
            {
              "layout_note": "String (e.g., 2x2 Grid, Dynamic Action)",
              "panels": [
                {
                  "panel_id": Integer,
                  "description": "String (Visual description of scene, action, angle)",
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
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        layout_note: { type: Type.STRING },
                        panels: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    panel_id: { type: Type.INTEGER },
                                    description: { type: Type.STRING },
                                    dialogues: {
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
                    }
                }
            }
        });

        let resultJson = { layout_note: "Standard Layout", panels: [] };
        try {
            const text = response.text || '{}';
            const cleanText = text.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanText);
            
            if (parsed && typeof parsed === 'object') {
                resultJson = parsed;
                // Ensure panels array exists
                if (!resultJson.panels || !Array.isArray(resultJson.panels)) {
                    // Check wrappers
                    if (Array.isArray((parsed as any).script?.panels)) resultJson = (parsed as any).script;
                    else if (Array.isArray((parsed as any).result?.panels)) resultJson = (parsed as any).result;
                    else {
                        // Fallback
                        resultJson.panels = [{ panel_id: 1, description: plot_summary, dialogues: [] }] as any;
                    }
                }
            }
        } catch (e) {
            // Parsing failed, use fallback
            resultJson.panels = [{ panel_id: 1, description: plot_summary, dialogues: [] }] as any;
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
