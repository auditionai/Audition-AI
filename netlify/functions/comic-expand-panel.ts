
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

        // 1. Prepare Character Context
        const characterContext = characters.map((c: any) => 
            `### ${c.name}: ${c.description || "N/A"}`
        ).join('\n');

        const targetLang = language || 'Tiếng Việt';

        const prompt = `
            You are a professional comic script writer.
            
            **TASK:**
            Convert the provided Plot Summary into a detailed Comic Script for a SINGLE PAGE.
            **CRITICAL REQUIREMENT:** You MUST break this page down into **4 to 6 DISTINCT PANELS** (Khung tranh). Do not create a single panel page.
            
            **INPUT:**
            - Plot Summary: "${plot_summary}"
            - Genre: ${genre}
            - Style: ${style}
            - Characters: ${characterContext}
            
            **OUTPUT FORMAT (Strict JSON):**
            You must return a JSON object with this exact structure:
            {
              "layout_description": "Describe the overall page layout (e.g., 'Dynamic layout with diagonal cuts', 'Traditional 2x3 grid').",
              "panels": [
                {
                  "id": 1,
                  "visual": "Detailed visual description of what is seen in this specific panel. Describe character action, camera angle, background.",
                  "dialogue": [
                    { "speaker": "Character Name", "text": "Dialogue content" }
                  ]
                },
                ... (Repeat for 4-6 panels)
              ]
            }

            **LANGUAGE:** 
            - The 'visual' and 'layout_description' should be in English (for better AI Image Generation accuracy).
            - The 'dialogue' text MUST be in **${targetLang}**.
        `;

        // USE GEMINI 2.5 FLASH FOR STRUCTURED JSON
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        layout_description: { type: Type.STRING },
                        panels: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.INTEGER },
                                    visual: { type: Type.STRING },
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
                    }
                }
            }
        });

        const text = response.text || '{}';
        // No parsing needed if SDK handles it, but safe to parse just in case of raw string return
        let detailJson = JSON.parse(text);

        // Safety check for panel count
        if (!detailJson.panels || detailJson.panels.length < 1) {
             detailJson.panels = [
                 { id: 1, visual: plot_summary, dialogue: [] }
             ];
        }

        // We wrap this in the structure expected by the frontend (storing JSON in visual_description string for now to avoid DB migration)
        const frontendPayload = {
            visual_description: JSON.stringify(detailJson), 
            dialogue: [] // Legacy field, now inside visual_description JSON
        };

        return {
            statusCode: 200,
            body: JSON.stringify(frontendPayload),
        };

    } catch (error: any) {
        console.error("Panel expansion failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
