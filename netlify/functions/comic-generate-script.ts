
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

        // --- LOGIC TRANG BÌA ---
        // Người dùng chọn X trang truyện.
        // Hệ thống tạo X + 1 trang. Trang 1 là Bìa. Trang 2 -> X+1 là nội dung.
        const totalPages = typeof pageCount === 'number' ? pageCount + 1 : 2;

        let coverInstruction = "";
        if (coverPage === 'start' || coverPage === 'both') {
            coverInstruction = `
            CRITICAL STRUCTURE REQUIREMENT:
            - You MUST create exactly ${totalPages} items in the output array.
            - Item 1 (panel_number: 1) MUST be the "Comic Cover" (Trang bìa). Plot Summary: "Trang bìa nghệ thuật với tên truyện: [${premise.substring(0, 20)}...], hình ảnh minh họa chính của nhân vật và không khí của bộ truyện."
            - Items 2 to ${totalPages} are the actual story pages based on the premise.
            `;
        } else {
            // Fallback if no cover selected (rare based on UI)
             coverInstruction = `Create exactly ${pageCount} story pages.`;
        }

        // Prompt optimized for OUTLINING
        const prompt = `
            You are a professional Comic Script Writer.
            **Task:** Create a structural outline for a comic script.
            
            **Input Story:** "${premise}"
            **Genre:** ${genre}
            **Total Output Length:** ${totalPages} PAGES.
            **Characters:** ${characterNames}
            **Language:** ${targetLanguage} (Strictly).
            
            ${coverInstruction}
            
            **Requirement:**
            - For each PAGE, provide a **concise 'plot_summary'** (2-3 sentences max).
            - Focus on the key event of the page.
            - **Do not** write detailed panels yet.
            
            **Output Format:** JSON Array of objects.
        `;

        // Use gemini-2.5-flash for speed
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

        let scriptJson: any[] = [];
        try {
            const text = response.text || '[]';
            const cleanText = text.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanText);

            // ROBUSTNESS: Handle different AI return formats
            if (Array.isArray(parsed)) {
                scriptJson = parsed;
            } else if (typeof parsed === 'object' && parsed !== null) {
                // Check for wrapped keys
                if (Array.isArray(parsed.outline)) scriptJson = parsed.outline;
                else if (Array.isArray(parsed.pages)) scriptJson = parsed.pages;
                else if (Array.isArray(parsed.panels)) scriptJson = parsed.panels;
                else if (Array.isArray(parsed.result)) scriptJson = parsed.result;
                else {
                    // Only one object? Wrap it
                    scriptJson = [parsed];
                }
            }
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            // Don't throw, return empty array to prevent crash
            scriptJson = []; 
        }

        // FINAL SAFETY CHECK: Must be an array
        if (!Array.isArray(scriptJson)) {
            scriptJson = [];
        }

        // If empty, create dummy data so user doesn't lose money for nothing
        if (scriptJson.length === 0) {
            scriptJson.push({ panel_number: 1, plot_summary: `Trang Bìa: Tên truyện và hình ảnh chủ đạo.` });
            for(let i=2; i<=totalPages; i++) {
                scriptJson.push({ panel_number: i, plot_summary: `Trang ${i}: (AI chưa tạo được nội dung, bạn hãy nhập thủ công)` });
            }
        }

        await supabaseAdmin.rpc('increment_user_diamonds', { user_id_param: user.id, diamond_amount: -COST });
        await supabaseAdmin.from('diamond_transactions_log').insert({
            user_id: user.id,
            amount: -COST,
            transaction_type: 'COMIC_SCRIPT',
            description: `Tạo kịch bản truyện tranh (${pageCount} trang + 1 bìa)`
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
