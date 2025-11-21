
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
        const { premise, genre, artStyle, dialogueAmount, pageCount, characters } = JSON.parse(event.body || '{}');
        
        if (!premise) return { statusCode: 400, body: JSON.stringify({ error: 'Missing premise.' }) };

        // 1. Check & Deduct Cost (2 Diamonds for Scripting)
        const COST = 2;
        const { data: userData } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        if (!userData || userData.diamonds < COST) {
            return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương. Cần 2 Kim Cương để tạo kịch bản.' }) };
        }

        // 2. Get API Key
        const { data: apiKeyData } = await supabaseAdmin
            .from('api_keys')
            .select('key_value, id')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (!apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Service busy.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // 3. Construct Prompt
        const characterDescriptions = characters.map((c: any) => 
            `- ${c.name}: ${c.description}`
        ).join('\n');

        const prompt = `
            You are a professional comic book writer and director.
            
            **Task:** Create a panel-by-panel comic script based on the user's idea.
            
            **Input Story:** "${premise}"
            **Genre:** ${genre}
            **Style:** ${artStyle}
            **Dialogue Density:** ${dialogueAmount}
            **Target Length:** Approximately ${pageCount} pages (each page typically has 4-6 panels).
            
            **Characters (VISUAL CONTEXT - STRICTLY ENFORCE):**
            ${characterDescriptions}
            
            **Requirements:**
            1.  **Structure:** Break the story down into a logical sequence of panels.
            2.  **Visuals:** For each panel, write a highly detailed "visual_description" in English (optimized for AI Image Generators like Stable Diffusion/Midjourney). 
                *   IMPORTANT: You MUST include the character's physical appearance details (hair, clothes) in every single panel description to ensure consistency. Do not just say "Character A", say "Character A (blue hair, red hoodie)...".
                *   Describe the background, lighting, and camera angle.
            3.  **Dialogue:** Write natural, engaging dialogue in **VIETNAMESE** matching the character's personality.
            
            **Output Format:** Return a JSON Array where each item is a Panel.
        `;

        // 4. Call AI with JSON Schema
        // Switch to 'gemini-2.5-flash' for speed to avoid 10s Netlify timeout
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            panel_number: { type: Type.INTEGER },
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
            }
        });

        let scriptJson;
        try {
            const text = response.text || '[]';
            // Clean up any potential markdown formatting even in JSON mode
            const cleanText = text.replace(/```json|```/g, '').trim();
            scriptJson = JSON.parse(cleanText);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            return { statusCode: 500, body: JSON.stringify({ error: 'AI returned invalid format. Please try again.' }) };
        }

        // 5. Deduct Gems
        await supabaseAdmin.rpc('increment_user_diamonds', { user_id_param: user.id, diamond_amount: -COST });
        await supabaseAdmin.from('diamond_transactions_log').insert({
            user_id: user.id,
            amount: -COST,
            transaction_type: 'COMIC_SCRIPT',
            description: `Tạo kịch bản truyện tranh: ${premise.substring(0, 20)}...`
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ script: scriptJson, newDiamondCount: userData.diamonds - COST }),
        };

    } catch (error: any) {
        console.error("Script generation failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
