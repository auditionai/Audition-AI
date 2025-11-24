
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

        // 1. Prepare Character Context
        const characterContext = characters.map((c: any) => 
            `### ${c.name}: ${c.description || "N/A"}`
        ).join('\n');

        const prompt = `
            You are a professional Comic Script Writer (Kịch bản gia truyện tranh chuyên nghiệp).
            
            **TASK:** Convert the 'Plot Summary' of a single Comic Page into a DETAILED SCRIPT broken down into PANELS (Khung tranh).
            
            **INPUT INFORMATION:**
            - **Genre:** ${genre}
            - **Art Style:** ${style}
            - **Page Plot:** "${plot_summary}"
            - **Characters:** 
            ${characterContext}
            
            **CRITICAL INSTRUCTIONS:**
            1.  **Model Behavior:** Act as **Gemini 3 Pro** logic. Think deeply about pacing, camera angles, and emotion.
            2.  **Language:** ALL Output (Descriptions, Dialogues) MUST be in **VIETNAMESE** (Tiếng Việt).
            3.  **Structure:** Break this Page into **3 to 5 Panels** (Khung).
            4.  **Detail:** For each panel, describe the "Visual Action" (Bối cảnh, hành động nhân vật) and "Dialogues" (Lời thoại).
            5.  **Formatting:** Return strictly valid JSON.
            
            **OUTPUT JSON SCHEMA:**
            {
              "layout_note": "Short note about page layout (e.g., 'Bố cục lưới 2x2', 'Trang có panel lớn ở giữa')",
              "panels": [
                {
                  "panel_id": 1,
                  "description": "Chi tiết hình ảnh: Ai đang làm gì? Góc máy (Toàn cảnh/Cận cảnh)? Biểu cảm? Bối cảnh?",
                  "dialogues": [
                    { "speaker": "Tên nhân vật", "text": "Lời thoại tiếng Việt..." }
                  ]
                },
                ...
              ]
            }
        `;

        // Using gemini-3-pro-preview for highest reasoning capabilities
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
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

        let resultJson;
        try {
            const text = response.text || '{}';
            resultJson = JSON.parse(text);
        } catch (e) {
            // Fallback if JSON fails
            resultJson = { 
                layout_note: "Bố cục tiêu chuẩn",
                panels: [
                    { 
                        panel_id: 1, 
                        description: plot_summary, 
                        dialogues: [] 
                    }
                ]
            };
        }

        // Wrap in the expected format for the frontend to store in 'visual_description'
        // We stringify it because the DB column is text, and frontend will parse it.
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                // We pass the object directly, the frontend will decide how to store/display it
                script_data: resultJson 
            }),
        };

    } catch (error: any) {
        console.error("Panel expansion failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
