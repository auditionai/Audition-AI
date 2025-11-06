import type { Handler, HandlerEvent } from "@netlify/functions";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';

const COST_PER_REMOVAL = 1;

const handler: Handler = async (event: HandlerEvent) => {
    console.log('[SERVER-DEBUG] Step 1: `process-background` function invoked.');

    try {
        if (event.httpMethod !== 'POST') {
            console.log('[SERVER-DEBUG] Error at Step 1: Invalid HTTP method.');
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }

        const authHeader = event.headers['authorization'];
        if (!authHeader) {
            console.log('[SERVER-DEBUG] Error at Step 1: Missing Authorization header.');
            return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log('[SERVER-DEBUG] Error at Step 1: Missing Bearer token.');
            return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };
        }

        console.log('[SERVER-DEBUG] Step 2: Authenticating user with Supabase...');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            console.log('[SERVER-DEBUG] Error at Step 2: Authentication failed.', authError);
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }
        console.log(`[SERVER-DEBUG] Step 2 SUCCESS: User ${user.id} authenticated.`);

        const { image: imageDataUrl } = JSON.parse(event.body || '{}');
        if (!imageDataUrl) {
            console.log('[SERVER-DEBUG] Error at Step 2: Image data is missing from request body.');
            return { statusCode: 400, body: JSON.stringify({ error: 'Image data is required.' }) };
        }

        console.log('[SERVER-DEBUG] Step 3: Fetching user profile and diamond balance...');
        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('diamonds')
            .eq('id', user.id)
            .single();
        
        if (userError || !userData) {
            console.log('[SERVER-DEBUG] Error at Step 3: Failed to fetch user profile.', userError);
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (userData.diamonds < COST_PER_REMOVAL) {
            console.log(`[SERVER-DEBUG] Error at Step 3: Insufficient diamonds. Needed: ${COST_PER_REMOVAL}, Has: ${userData.diamonds}`);
            return { statusCode: 402, body: JSON.stringify({ error: 'Không đủ kim cương.' }) };
        }
        console.log(`[SERVER-DEBUG] Step 3 SUCCESS: User has ${userData.diamonds} diamonds.`);

        console.log('[SERVER-DEBUG] Step 4: Fetching available API key...');
        const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
            .from('api_keys')
            .select('id, key_value')
            .eq('status', 'active')
            .order('usage_count', { ascending: true })
            .limit(1)
            .single();

        if (apiKeyError || !apiKeyData) {
            console.log('[SERVER-DEBUG] Error at Step 4: No active API keys available.', apiKeyError);
            return { statusCode: 503, body: JSON.stringify({ error: 'Hết tài nguyên AI. Vui lòng thử lại sau.' }) };
        }
        console.log(`[SERVER-DEBUG] Step 4 SUCCESS: Using API key ID: ${apiKeyData.id}`);

        console.log('[SERVER-DEBUG] Step 5: Calling Google Gemini API...');
        const ai = new GoogleGenAI({ apiKey: apiKeyData.key_value });
        const model = 'gemini-2.5-flash-image'; 

        const parts: any[] = [];
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)[1];
        parts.push({ inlineData: { data: base64, mimeType } });
        parts.push({ text: "isolate the main subject with a solid black background" });

        const response = await ai.models.generateContent({
            model,
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE] },
        });
        console.log('[SERVER-DEBUG] Step 5 SUCCESS: Received response from Gemini.');

        const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePartResponse?.inlineData) {
            throw new Error("AI không thể tách nền hình ảnh này.");
        }
        
        const finalImageBase64 = imagePartResponse.inlineData.data;
        const finalImageMimeType = imagePartResponse.inlineData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        const finalFileExtension = finalImageMimeType.split('/')[1] || 'png';

        console.log('[SERVER-DEBUG] Step 6: Uploading processed image to temp storage...');
        const imageBuffer = Buffer.from(finalImageBase64, 'base64');
        const fileName = `${user.id}/bg_removed_${Date.now()}.${finalFileExtension}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from('temp_images')
            .upload(fileName, imageBuffer, { contentType: finalImageMimeType });
            
        if (uploadError) throw uploadError;
        console.log('[SERVER-DEBUG] Step 6 SUCCESS: Image uploaded to', fileName);

        const { data: { publicUrl } } = supabaseAdmin.storage.from('temp_images').getPublicUrl(fileName);

        console.log('[SERVER-DEBUG] Step 7: Updating database (diamonds and key usage)...');
        const newDiamondCount = userData.diamonds - COST_PER_REMOVAL;
        await Promise.all([
            supabaseAdmin.from('users').update({ diamonds: newDiamondCount }).eq('id', user.id),
            supabaseAdmin.rpc('increment_key_usage', { key_id: apiKeyData.id })
        ]);
        console.log('[SERVER-DEBUG] Step 7 SUCCESS: Database updated.');

        console.log('[SERVER-DEBUG] Step 8: Sending final successful response.');
        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl: publicUrl,
                newDiamondCount,
            }),
        };

    } catch (error: any) {
        console.error('[SERVER-DEBUG] A FATAL ERROR occurred in the `process-background` function:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ 
                error: `Lỗi máy chủ nghiêm trọng: ${error.message || 'Unknown server error.'}` 
            }) 
        };
    }
};

export { handler };