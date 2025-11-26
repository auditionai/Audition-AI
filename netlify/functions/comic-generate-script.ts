
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
        const { premise, genre, artStyle, pageCount, characters, language, coverPage, dialogueDensity } = JSON.parse(event.body || '{}');
        
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
        const contentPages = totalPages - 1;

        let densityInstruction = "Dialogue Density: Normal balanced conversation.";
        if (dialogueDensity === 'low') densityInstruction = "Dialogue Density: LOW. Focus on visual storytelling, minimal text.";
        if (dialogueDensity === 'high') densityInstruction = "Dialogue Density: HIGH. Detailed conversations and narration.";

        // NEW PROMPT STRATEGY: Chain of Consequence
        const prompt = `
            You are a professional Comic Script Director.
            
            **TASK:** Create a strictly causal, logical breakdown for a comic book based on the premise.
            **INPUT PREMISE:** "${premise}"
            **GENRE:** ${genre}
            **CHARACTERS:** ${characterNames}
            **LANGUAGE:** ${targetLanguage}.
            
            **STRUCTURE REQUIREMENTS:**
            Output an array of ${totalPages} objects.
            
            **CRITICAL LOGIC: CHAIN OF CONSEQUENCE**
            You must ensure a tight narrative flow. Page N must be the direct result of Page N-1.
            - **Beginning (Page 2-3):** Setup and Inciting Incident.
            - **Middle (Page 4...):** Rising Action. EACH page must physically and logically continue the previous action.
            - **End (Last Page):** Climax/Resolution.
            
            **EXAMPLE OF CAUSAL CHAIN:**
            - Page 2: Hero punches Villain. Villain stumbles back.
            - Page 3: Villain recovers from the stumble and counter-attacks. Hero dodges.
            *(Do NOT jump scenes randomly. Maintain time and space continuity.)*
            
            **STEP 2: GENERATE THE OUTPUT LIST**
            
            **Item 1 (Cover Page):**
            - panel_number: 1
            - plot_summary: "Trang bìa nghệ thuật: Tên truyện [Title], hình ảnh minh họa [Main Character Action], thể hiện không khí [Mood]."
            
            **Items 2 to ${totalPages} (Story Pages):**
            - panel_number: [Page Number]
            - plot_summary: [A concise 2-sentence summary. MUST explicitly state how it connects to the previous page action. MUST BE IN ${targetLanguage}.]
            
            ${densityInstruction}
            
            **Output Format:** JSON Array of objects.
        `;

        // Use gemini-2.5-flash for speed but instructed for logic
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

            if (Array.isArray(parsed)) {
                scriptJson = parsed;
            } else if (typeof parsed === 'object' && parsed !== null) {
                // Handle wrapped objects
                if (Array.isArray(parsed.outline)) scriptJson = parsed.outline;
                else if (Array.isArray(parsed.pages)) scriptJson = parsed.pages;
                else {
                    scriptJson = [parsed];
                }
            }
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            scriptJson = []; 
        }

        // Validation and Fallback
        if (!Array.isArray(scriptJson) || scriptJson.length === 0) {
             scriptJson = [];
             scriptJson.push({ panel_number: 1, plot_summary: `Trang Bìa: ${premise.substring(0,50)}...` });
             for(let i=2; i<=totalPages; i++) {
                scriptJson.push({ panel_number: i, plot_summary: `Trang ${i}: Diễn biến tiếp theo của câu chuyện.` });
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
