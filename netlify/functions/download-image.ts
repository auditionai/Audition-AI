import type { Handler, HandlerEvent } from "@netlify/functions";
import { Buffer } from 'buffer';

const handler: Handler = async (event: HandlerEvent) => {
    const imageUrl = event.queryStringParameters?.url;

    if (!imageUrl) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Image URL is required.' }) };
    }

    // Security check: ensure we are only proxying images from our R2 bucket
    const allowedOrigin = process.env.R2_PUBLIC_URL;
    if (!allowedOrigin || !imageUrl.startsWith(allowedOrigin)) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden: Cannot proxy this URL.' }) };
    }

    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            console.error(`Failed to fetch image from R2. Status: ${response.status}, URL: ${imageUrl}`);
            // Return a JSON error so the client can display it
            return { 
                statusCode: response.status, 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: `Không thể tải ảnh từ R2: ${response.statusText}` }) 
            };
        }

        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        
        // **MODIFICATION**: Remove Content-Disposition to make it work with client-side fetch.
        // The client will set the filename.
        return {
            statusCode: 200,
            headers: {
                'Content-Type': contentType,
            },
            body: imageBuffer.toString('base64'),
            isBase64Encoded: true,
        };
    } catch (error: any) {
        console.error('Download proxy error:', error);
        return { 
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Proxy thất bại khi nạp ảnh.' }) 
        };
    }
};

export { handler };