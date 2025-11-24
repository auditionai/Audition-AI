
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
        const { premise, genre, artStyle, pageCount, characters, language, coverPage } = JSON.parse(event.body || '{}');
        
        if (!premise) return { statusCode: 400, body: JSON.stringify({ error: 'Missing premise.' }) };

        const COST = 2;
        const { data: userData } = await supabaseAdmin.from('users').select('diamonds').eq('id', user.id).single();
        if (!userData || userData.diamonds < COST) {
            return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương. Cần 2 Kim Cương để tạo kịch bản.' }) };
        }

        const { data: apiKeyData } = await supabaseAdmin
            .from('api_keys')
            .select('key_value')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (!apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Service busy.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        const characterNames = characters.map((c: any) => c.name).join(', ');
        const targetLanguage = language || 'Tiếng Việt';

        let coverInstruction = "";
        if (coverPage === 'start' || coverPage === 'both') {
            coverInstruction += `\n- Page 1 MUST be a 'Title Cover Page' (Trang bìa). Summary: 'Trang bìa ấn tượng với tên truyện: [${premise.substring(0, 20)}...] và hình ảnh minh họa chính'.`;
        }

        // Prompt optimized for OUTLINING
        const prompt = `
            You are a professional Comic Script Writer.
            **Task:** Create a structural outline for a comic script.
            
            **Input Story:** "${premise}"
            **Genre:** ${genre}
            **Length:** ${pageCount} PAGES.
            **Characters:** ${characterNames}
            **Language:** ${targetLanguage} (Strictly).
            
            ${coverInstruction}
            
            **Requirement:**
            - Break the story into ${pageCount} PAGES.
            - For each PAGE, provide a **concise 'plot_summary'** (2-3 sentences max).
            - Focus on the key event of the page.
            - **Do not** write detailed panels yet.
            
            **Output Format:** JSON Array of objects.
        `;

        // Use gemini-2.5-flash for speed to avoid Netlify 10s timeout
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            panel_number: { type: Type.INTEGER },
                            plot_summary: { type: Type.STRING },
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

            // ROBUSTNESS FIX: Ensure it's an array
            if (!Array.isArray(scriptJson) && typeof scriptJson === 'object') {
                // Sometimes AI wraps result in { "result": [...] } or { "pages": [...] }
                const possibleKeys = ['outline', 'pages', 'panels', 'script', 'result'];
                for (const key of possibleKeys) {
                    if (Array.isArray(scriptJson[key])) {
                        scriptJson = scriptJson[key];
                        break;
                    }
                }
            }
            
            // If still not an array (e.g. single object), wrap it
            if (!Array.isArray(scriptJson) && scriptJson) {
                scriptJson = [scriptJson];
            }
            
            // Fallback if empty or null
            if (!scriptJson || !Array.isArray(scriptJson)) {
                scriptJson = [];
            }

        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            return { statusCode: 500, body: JSON.stringify({ error: 'AI returned invalid format. Please try again.' }) };
        }

        await supabaseAdmin.rpc('increment_user_diamonds', { user_id_param: user.id, diamond_amount: -COST });
        await supabaseAdmin.from('diamond_transactions_log').insert({
            user_id: user.id,
            amount: -COST,
            transaction_type: 'COMIC_SCRIPT',
            description: `Tạo kịch bản truyện tranh (${pageCount} trang)`
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
