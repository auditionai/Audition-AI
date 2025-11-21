
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
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
        const { image } = JSON.parse(event.body || '{}');
        if (!image) return { statusCode: 400, body: JSON.stringify({ error: 'Image data required.' }) };

        // Retrieve API Key (Reuse existing key logic)
        const { data: apiKeyData } = await supabaseAdmin
            .from('api_keys')
            .select('key_value')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (!apiKeyData) return { statusCode: 503, body: JSON.stringify({ error: 'Service busy. Please try again.' }) };

        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        // Prepare image part
        const [header, base64] = image.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';

        const prompt = `
            Analyze this character image in extreme detail for the purpose of generating consistent comic book art.
            Describe the following visual features strictly:
            1. Hair: Color, style, length.
            2. Eyes: Color, shape.
            3. Clothing: Detailed outfit description (top, bottom, shoes, accessories, colors).
            4. Distinctive Features: Scars, tattoos, glasses, or unique traits.
            
            Output the description as a single, cohesive paragraph suitable for an AI image generation prompt (e.g., Stable Diffusion or Midjourney style).
            Do NOT describe the background or pose. Focus ONLY on the character's appearance.
            Keep the description under 100 words.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', // Using the Pro model for best analysis
            contents: {
                parts: [
                    { inlineData: { data: base64, mimeType } },
                    { text: prompt }
                ]
            }
        });

        const description = response.text;

        return {
            statusCode: 200,
            body: JSON.stringify({ description }),
        };

    } catch (error: any) {
        console.error("Character analysis failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
