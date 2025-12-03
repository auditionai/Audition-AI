
import type { Handler, HandlerEvent } from "@netlify/functions";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Buffer } from 'buffer';

const handler: Handler = async (event: HandlerEvent) => {
    const imageUrl = event.queryStringParameters?.url;
    const mode = event.queryStringParameters?.mode; // 'redirect' (default) or 'proxy'

    if (!imageUrl) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Image URL is required.' }) };
    }

    // Security check: ensure we are only proxying images from our R2 bucket
    const allowedOrigin = process.env.R2_PUBLIC_URL;
    if (!allowedOrigin || !imageUrl.startsWith(allowedOrigin)) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden: Cannot process this URL.' }) };
    }

    try {
        const s3Client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_ENDPOINT!,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            },
        });

        // Extract Key from URL
        const key = imageUrl.replace(`${allowedOrigin}/`, '');

        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: key,
        });

        // MODE 1: PROXY (Returns file content directly - Solves CORS)
        if (mode === 'proxy') {
            try {
                // FIX: Cast s3Client to 'any' to avoid TS error 'Property send does not exist on type S3Client'
                const response = await (s3Client as any).send(command);
                const byteArray = await response.Body?.transformToByteArray();
                
                if (!byteArray) throw new Error("Empty body");

                const contentType = response.ContentType || 'image/png';
                const base64Data = Buffer.from(byteArray).toString('base64');

                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*', // Allow all origins for the proxy response
                        'Cache-Control': 'public, max-age=31536000, immutable',
                    },
                    body: base64Data,
                    isBase64Encoded: true
                };
            } catch (e: any) {
                console.error("Proxy failed:", e);
                // Fallback to redirect if proxy fails (e.g. file too large for lambda)
                // Proceed to redirect logic below...
            }
        }

        // MODE 2: REDIRECT (Default - Returns Signed URL)
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        return {
            statusCode: 302,
            headers: {
                Location: signedUrl,
            },
            body: '',
        };

    } catch (error: any) {
        console.error('Download/Proxy error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to process image request.' }) };
    }
};

export { handler };
