import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const handler: Handler = async (event: HandlerEvent) => {
    // Fix: Moved S3Client initialization inside the handler to prevent potential scope/caching issues in serverless environments.
    // Cấu hình S3 client để kết nối với Cloudflare R2
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

    // 1. Auth check
    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is required.' }) };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Bearer token is missing.' }) };
    }

    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
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
        // 3. Process image and upload to R2
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        const imageBuffer = Buffer.from(base64, 'base64');
        const fileExtension = mimeType.split('/')[1] || 'png';
        const fileName = `${user.id}/avatar.${fileExtension}`;

        const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: mimeType,
        });

        // FIX: Cast s3Client to 'any' to bypass a likely environment-specific TypeScript type resolution error.
        await (s3Client as any).send(putCommand);

        // 4. Get public URL and update user profile
        // Add timestamp to bust cache
        const finalUrl = `${process.env.R2_PUBLIC_URL}/${fileName}?t=${Date.now()}`;

        const { data: updatedUser, error: updateError } = await supabaseAdmin
            .from('users')
            .update({ photo_url: finalUrl })
            .eq('id', user.id)
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