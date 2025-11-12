import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Type } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }
        
        const authHeader = event.headers['authorization'];
        if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        const token = authHeader.split(' ')[1];
        if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };

        const { story } = JSON.parse(event.body || '{}');
        if (!story) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Story text is required.' }) };
        }
        
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.from('api_keys').select('id, key_value').eq('status', 'active').order('usage_count', { ascending: true }).limit(1).single();
        if (apiKeyError || !apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                scenes: {
                    type: Type.ARRAY,
                    description: "An array of 3 to 5 scenes that dramatize the user's story.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: {
                                type: Type.STRING,
                                description: "A short, cinematic title for the scene (e.g., 'A Rainy Encounter')."
                            },
                            moments: {
                                type: Type.ARRAY,
                                description: "Exactly two distinct, visual moments from this scene.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        description: {
                                            type: Type.STRING,
                                            description: "A one-sentence narrative description of the moment (e.g., 'Their hands touch as they reach for the same book.')."
                                        },
                                        prompt: {
                                            type: Type.STRING,
                                            description: "A detailed, visually rich prompt for an AI image generator to create this moment. Use descriptive language about composition, lighting, character expressions, and setting. Refer to characters as 'the female character' and 'the male character'."
                                        }
                                    },
                                    required: ["description", "prompt"]
                                }
                            }
                        },
                        required: ["title", "moments"]
                    }
                }
            },
            required: ["scenes"]
        };

        const response = await ai.models.generateContent({
           model: "gemini-2.5-pro",
           contents: `Based on the following love story, create a screenplay with 3-5 scenes. For each scene, provide two key moments with detailed image generation prompts. Story: "${story}"`,
           config: {
             responseMimeType: "application/json",
             responseSchema,
           },
        });

        // Increment API key usage in the background
        supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id }).then();
        
        let jsonStr = response.text.trim();
        const parsedJson = JSON.parse(jsonStr);

        return {
            statusCode: 200,
            body: JSON.stringify(parsedJson),
        };

    } catch (error: any) {
        console.error("Generate love story script function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'AI không thể tạo kịch bản từ câu chuyện này.' }) };
    }
};

export { handler };