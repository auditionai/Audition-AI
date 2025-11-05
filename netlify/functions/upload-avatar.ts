import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    // 1. Auth check
    const { user } = context.clientContext as any;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // 2. Body parsing and validation
    const { image: imageDataUrl } = JSON.parse(event.body || '{}');
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image data.' }) };
    }

    try {
        // 3. Process image and upload to storage
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        const imageBuffer = Buffer.from(base64, 'base64');
        const fileExtension = mimeType.split('/')[1] || 'png';
        const fileName = `public/${user.sub}.${fileExtension}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from('avatars')
            .upload(fileName, imageBuffer, { 
                contentType: mimeType,
                upsert: true 
            });
            
        if (uploadError) throw uploadError;

        // 4. Get public URL and update user profile
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('avatars')
            .getPublicUrl(fileName);

        // Add timestamp to bust cache
        const finalUrl = `${publicUrl}?t=${Date.now()}`;

        const { data: updatedUser, error: updateError } = await supabaseAdmin
            .from('users')
            .update({ photo_url: finalUrl })
            .eq('id', user.sub)
            .select('photo_url')
            .single();

        if (updateError) throw updateError;

        // 5. Return success response
        return {
            statusCode: 200,
            body: JSON.stringify(updatedUser),
        };

    } catch (error: any) {
        console.error('Avatar Upload Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Server error during avatar upload.' }) };
    }
};

export { handler };
