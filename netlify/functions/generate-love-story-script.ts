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
                    description: "Một mảng từ 3 đến 5 cảnh, kịch tính hóa câu chuyện của người dùng.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: {
                                type: Type.STRING,
                                description: "Tiêu đề ngắn, đậm chất điện ảnh cho cảnh (ví dụ: 'Cuộc Gặp Dưới Mưa'). Phải bằng tiếng Việt."
                            },
                            moments: {
                                type: Type.ARRAY,
                                description: "Chính xác hai khoảnh khắc trực quan, khác biệt trong cảnh này.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        description: {
                                            type: Type.STRING,
                                            description: "Mô tả tường thuật trong một câu về khoảnh khắc (ví dụ: 'Tay họ chạm nhau khi cùng vươn tới một cuốn sách.'). Phải bằng tiếng Việt."
                                        },
                                        prompt: {
                                            type: Type.STRING,
                                            description: "Prompt chi tiết, giàu hình ảnh cho AI tạo ảnh để dựng lại khoảnh khắc này. Dùng ngôn ngữ mô tả về bố cục, ánh sáng, biểu cảm, bối cảnh. Phải bằng tiếng Việt. Dùng 'nhân vật nữ' và 'nhân vật nam' để chỉ các nhân vật."
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

        // NEW: Implement retry logic and switch to a more available model
        const maxRetries = 3;
        let response;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                response = await ai.models.generateContent({
                   model: "gemini-2.5-flash", // Changed from gemini-2.5-pro for better availability
                   contents: `Dựa trên câu chuyện tình yêu sau, hãy tạo một kịch bản phân cảnh gồm 3-5 cảnh. Với mỗi cảnh, hãy cung cấp hai khoảnh khắc chính kèm theo prompt chi tiết để tạo hình ảnh. Toàn bộ kịch bản và prompt phải bằng tiếng Việt. Câu chuyện: "${story}"`,
                   config: {
                     responseMimeType: "application/json",
                     responseSchema,
                   },
                });
                break; // Success, exit loop
            } catch (error: any) {
                console.warn(`Attempt ${attempt} failed: ${error.message}`);
                if (attempt === maxRetries) {
                    // If this was the last attempt, re-throw a more user-friendly error
                    throw new Error('Mô hình AI hiện đang quá tải sau nhiều lần thử. Vui lòng thử lại sau ít phút.');
                }
                // Wait before the next attempt (e.g., 1s, 2s)
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        
        if (!response) {
            throw new Error('AI không thể tạo phản hồi sau nhiều lần thử.');
        }

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