
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const handler: Handler = async (event: HandlerEvent) => {
    const authHeader = event.headers['authorization'];
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Authorization required.' }) };
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

    // Check admin status
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    if (!userData?.is_admin) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };

    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    try {
        const { image, folder = 'assets' } = JSON.parse(event.body || '{}');
        if (!image) return { statusCode: 400, body: JSON.stringify({ error: 'Image data required.' }) };

        const s3Client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_ENDPOINT!,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            },
        });

        const [header, base64] = image.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        const imageBuffer = Buffer.from(base64, 'base64');
        
        // Sanitize folder name to prevent path traversal
        const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, ''); 
        const ext = mimeType.split('/')[1] || 'png';
        const fileName = `${safeFolder}/${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;

        await (s3Client as any).send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: fileName,
            Body: imageBuffer,
            ContentType: mimeType,
        }));

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        return {
            statusCode: 200,
            body: JSON.stringify({ url: publicUrl }),
        };

    } catch (error: any) {
        console.error("Upload asset failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

export { handler };
