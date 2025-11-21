
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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    try {
        const { plot_summary, characters, style, genre } = JSON.parse(event.body || '{}');
        
        if (!plot_summary) return { statusCode: 400, body: JSON.stringify({ error: 'Missing plot summary.' }) };

        // We don't deduct diamonds here, as it's part of the main script generation flow paid for in step 1.
        // Or we could charge micro-transactions, but for simplicity, we assume it's covered.

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
            `- ${c.name}: ${c.description}`
        ).join('\n');

        const prompt = `
            You are an expert comic artist and writer.
            
            **Task:** Expand a brief plot summary into a detailed panel description.
            **Genre:** ${genre}
            **Art Style:** ${style}
            
            **Character Visual Context (Use this to describe characters accurately):**
            ${characterContext}
            
            **Panel Plot Summary:** "${plot_summary}"
            
            **Requirements:**
            1.  **visual_description (English):** Write a highly detailed prompt for an AI Image Generator (like Stable Diffusion). 
                *   Describe the scene, background, lighting, camera angle.
                *   **CRITICAL:** You MUST describe the characters' appearance (hair, clothes, colors) explicitly in this prompt based on the Context provided above. Don't just say "Character Name", say "Character Name (blue hair, red jacket)...".
            2.  **dialogue (Vietnamese):** Write natural, engaging dialogue for the characters in this panel based on the plot.
            
            Return a single JSON object.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', // Use PRO for high quality details, single panel is fast enough
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
        } catch (e) {
            // Fallback if JSON is broken
            detailJson = { visual_description: plot_summary, dialogue: [] };
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
