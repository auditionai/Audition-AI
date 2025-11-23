import type { Handler, HandlerEvent } from "@netlify/functions";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const handler: Handler = async (event: HandlerEvent) => {
    const imageUrl = event.queryStringParameters?.url;

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
        // URL format: https://...r2.dev/user_id/filename.png
        const key = imageUrl.replace(`${allowedOrigin}/`, '');

        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: key,
            ResponseContentDisposition: `attachment; filename="audition-ai-${Date.now()}.png"`
        });

        // Generate a signed URL that expires in 60 seconds
        // This allows the browser to download directly from R2/S3 without passing through the Netlify function memory
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

        return {
            statusCode: 302,
            headers: {
                Location: signedUrl,
            },
            body: '',
        };

    } catch (error) {
        console.error('Download redirect error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate download link.' }) };
    }
};

export { handler };