// /netlify/functions/text-to-speech.ts
import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { text } = JSON.parse(event.body || '{}');
        if (!text || typeof text !== 'string') {
            return { statusCode: 400, body: JSON.stringify({ error: 'Text input is required.' }) };
        }

        // Fetch a working API key from the database
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
            .from('api_keys')
            .select('key_value')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (apiKeyError || !apiKeyData) {
            return { statusCode: 503, body: JSON.stringify({ error: 'AI resources are currently unavailable.' }) };
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }, // A pleasant voice
                    },
                },
            },
        });
        
        const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType.startsWith('audio/'));
        if (!audioPart || !audioPart.inlineData) {
            throw new Error("AI did not return audio data.");
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ audioContent: audioPart.inlineData.data }),
        };

    } catch (error: any) {
        console.error("Text-to-speech function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error generating speech.' }) };
    }
};

export { handler };