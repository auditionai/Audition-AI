
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
            : "This is a Traditional Comic Page. Describe a FULL PAGE LAYOUT consisting of AT LEAST 5-7 distinct panels arranged in a dynamic grid (e.g., wide establishing shot at top, smaller action panels below).";

        // 1. Prepare Character Context (Consistency)
        const characterContext = characters.map((c: any) => 
            `### ${c.name}: ${c.description || "N/A"}`
        ).join('\n');

        // 2. Prepare Story Memory (Context Awareness) - STRICTLY LIMIT TO LAST 3 ITEMS to reduce payload size
        let memoryContext = "No previous context.";
        if (previous_panels && Array.isArray(previous_panels) && previous_panels.length > 0) {
            // Ensure we only process valid panels and take only the last 3
            const recentPanels = previous_panels
                .filter((p: any) => p.visual_description && !p.visual_description.startsWith('[')) // Filter out errors
                .slice(-3); 
            
            if (recentPanels.length > 0) {
                memoryContext = recentPanels.map((p: any) => 
                    `[Page ${p.panel_number}]: ${p.visual_description.substring(0, 200)}...`
                ).join('\n');
            }
        }

        const prompt = `
            You are an expert manga/comic script writer.
            
            **CRITICAL INSTRUCTION: PACING & LAYOUT**
            1.  **PACING:** SLOW DOWN. Do not rush the plot. Focus on small details, facial expressions, and atmospheric shots. The user wants depth, not just action summaries.
            2.  **LAYOUT:** The user requires a dense, detailed page. You MUST describe a layout with **AT LEAST 5-7 PANELS** for this single page (unless it is a splash page).
            3.  **CONTENT:** Break the 'Plot Summary' down into these 5-7 panels. Include specific visual descriptions for each panel (e.g., "Panel 1: Wide shot of...", "Panel 2: Close up on...").
            
            **Genre:** ${genre} | **Style:** ${style}
            **Layout Guidance:** ${layoutContext}
            
            **Context (Last 3 Pages for Continuity):**
            ${memoryContext}
            
            **Characters:**
            ${characterContext}
            
            **CURRENT PAGE PLOT SUMMARY:** "${plot_summary}"
            
            **Output JSON:**
            {
              "visual_description": "Detailed English prompt for AI Image Gen. Explicitly describe the panel layout (e.g. 'A comic page with 6 panels. Panel 1 shows... Panel 2 shows...'). Describe characters, setting, and action in high detail.",
              "dialogue": [ 
                  {"speaker": "Name", "text": "Vietnamese dialogue corresponding to Panel 1"},
                  {"speaker": "Name", "text": "Vietnamese dialogue corresponding to Panel 2"},
                  ...
              ]
            }
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
