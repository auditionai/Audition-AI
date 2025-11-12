import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import Jimp from 'jimp';

// Helper function to fetch an image and return a Jimp image object
const fetchImage = async (url: string) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image from ${url}. Status: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        return (Jimp as any).read(Buffer.from(buffer));
    } catch (error) {
        console.error(`Error fetching or reading image: ${url}`, error);
        // Return a placeholder image on error to prevent total failure
        const errorImage = new (Jimp as any)(1024, 1024, '#555555');
        const font = await (Jimp as any).loadFont((Jimp as any).FONT_SANS_32_WHITE);
        errorImage.print(font, 0, 0, { text: 'Image load failed', alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER, alignmentY: (Jimp as any).VERTICAL_ALIGN_MIDDLE }, 1024, 1024);
        return errorImage;
    }
};

const handler: Handler = async (event: HandlerEvent) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }
        
        // Authenticate user
        const authHeader = event.headers['authorization'];
        const token = authHeader?.split(' ')[1];
        if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token.' }) };

        // Parse request body
        const { imageUrls, title, endText } = JSON.parse(event.body || '{}');
        if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0 || !title || !endText) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameters: imageUrls, title, endText' }) };
        }

        // --- Image Composition Logic ---
        const PADDING = 40;
        const IMG_WIDTH = 1024; // Standard width for all images

        const jimpImages = await Promise.all(imageUrls.map(fetchImage));
        
        // Resize all images to a standard width, maintaining aspect ratio
        jimpImages.forEach(img => img.resize(IMG_WIDTH, (Jimp as any).AUTO));

        // Calculate total canvas height
        const totalImageHeight = jimpImages.reduce((sum, img) => sum + img.getHeight(), 0);
        const HEADER_HEIGHT = 200;
        const FOOTER_HEIGHT = 150;
        const totalHeight = HEADER_HEIGHT + totalImageHeight + (jimpImages.length * PADDING) + FOOTER_HEIGHT;

        // Create the canvas
        const canvas = new (Jimp as any)(IMG_WIDTH + (PADDING * 2), totalHeight, '#110C13');

        // Load fonts
        const fontTitle = await (Jimp as any).loadFont((Jimp as any).FONT_SANS_64_WHITE);
        const fontFooter = await (Jimp as any).loadFont((Jimp as any).FONT_SANS_32_WHITE);

        // --- Draw Header ---
        canvas.print(fontTitle, 0, PADDING, {
            text: `AI Love Story`,
            alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER,
        }, canvas.getWidth(), HEADER_HEIGHT);
         canvas.print(fontFooter, 0, PADDING + 80, {
            text: `"${title}"`,
            alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER,
        }, canvas.getWidth(), HEADER_HEIGHT);


        // --- Draw Images ---
        let currentY = HEADER_HEIGHT;
        for (const img of jimpImages) {
            canvas.composite(img, PADDING, currentY);
            currentY += img.getHeight() + PADDING;
        }

        // --- Draw Footer ---
        canvas.print(fontFooter, 0, currentY, {
            text: `"${endText}"`,
            alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER,
        }, canvas.getWidth(), FOOTER_HEIGHT / 2);

        canvas.print(fontFooter, 0, currentY + (FOOTER_HEIGHT / 2), {
            text: 'Created with AUDITION AI',
            alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER,
        }, canvas.getWidth(), FOOTER_HEIGHT / 2);
        
        // Get final image as base64
        const albumImageBase64 = await canvas.getBase64Async((Jimp as any).MIME_PNG);

        return {
            statusCode: 200,
            body: JSON.stringify({ albumImageBase64: albumImageBase64.split(',')[1] }),
        };

    } catch (error: any) {
        console.error("Create story album function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) };
    }
};

export { handler };