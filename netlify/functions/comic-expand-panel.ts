
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

        // Prompt optimized for single page expansion
        const prompt = `
            Act as a Comic Script Writer.
            **TASK:** Expand this Page Plot into 3-5 detailed panels.
            
            **Info:**
            - Plot: "${plot_summary}"
            - Genre: ${genre}
            - Style: ${style}
            - Language: ${targetLanguage} (Strictly).
            - Characters:
            ${characterContext}
            
            **Rules:**
            1. Output strict JSON.
            2. Create 3, 4, or 5 panels.
            3. Descriptions must be concise visual instructions (max 40 words/panel).
            4. Dialogues must be natural and in ${targetLanguage}.
            
            **JSON Schema:**
            {
              "layout_note": "String (e.g., 2x2 Grid)",
              "panels": [
                {
                  "panel_id": Integer,
                  "description": "String (Visuals)",
                  "dialogues": [
                    { "speaker": "String", "text": "String" }
                  ]
                }
              ]
            }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                // Explicit schema helps the model generate faster and strictly
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

        let resultJson;
        try {
            resultJson = JSON.parse(response.text || '{}');
        } catch (e) {
            // Fallback
            resultJson = { 
                layout_note: "Standard Layout",
                panels: [{ panel_id: 1, description: plot_summary, dialogues: [] }]
            };
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
