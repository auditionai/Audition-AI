import type { Handler, HandlerEvent } from "@netlify/functions";
const handler: Handler = async (event: HandlerEvent) => {
    const imageUrl = event.queryStringParameters?.url;

    if (!imageUrl) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Image URL is required.' }) };
    }

    // Security check: ensure we are only proxying images from our R2 bucket
    const allowedOrigin = process.env.R2_PUBLIC_URL;
    if (!allowedOrigin || !imageUrl.startsWith(allowedOrigin)) {

        };
    } catch (error: any) {
    }
};

export { handler };