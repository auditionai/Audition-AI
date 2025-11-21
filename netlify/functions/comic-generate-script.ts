
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
        const { premise, genre, artStyle, pageCount, characters } = JSON.parse(event.body || '{}');
        
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

        // 3. Construct Prompt - PHASE 1: OUTLINE ONLY
        // We ask for a skeletal structure. This is very fast.
        const characterNames = characters.map((c: any) => c.name).join(', ');

        const prompt = `
            You are a professional comic book writer.
            **Task:** Create a structural outline for a comic script based on the user's idea.
            
            **Input Story:** "${premise}"
            **Genre:** ${genre}
            **Target Length:** Approximately ${pageCount} pages (Total 4-6 panels).
            **Characters:** ${characterNames}
            
            **Requirement:**
            Break the story down into a sequence of panels. For each panel, provide a brief 'plot_summary' of what happens.
            Do NOT write detailed visual descriptions or dialogue yet. Just the story beats.
            
            **Output Format:** JSON Array of objects.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // Flash is perfect for outlining
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
                            plot_summary: { type: Type.STRING, description: "Brief summary of the action in this panel" },
                        }
                    }
                }
            }
        });

        let scriptJson;
        try {
            const text = response.text || '[]';
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
            body: JSON.stringify({ outline: scriptJson, newDiamondCount: userData.diamonds - COST }),
        };

    } catch (error: any) {
        console.error("Script outline failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
