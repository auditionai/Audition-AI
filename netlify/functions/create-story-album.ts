import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import Jimp from 'jimp';

// Helper function to fetch an image and return a Jimp image object
const fetchImage = async (url: string, errorFont: any) => {
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
        const errorImage = new (Jimp as any)(1024, 768, '#555555');
        errorImage.print(errorFont, 0, 0, { text: 'Tải ảnh thất bại', alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER, alignmentY: (Jimp as any).VERTICAL_ALIGN_MIDDLE }, 1024, 768);
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
        const { panels, title, endText } = JSON.parse(event.body || '{}');
        if (!panels || !Array.isArray(panels) || panels.length === 0 || !title || !endText) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameters: panels, title, endText' }) };
        }

        // --- Image Composition Logic ---
        const PADDING = 50;
        const IMG_WIDTH = 1024; // Standard width for all images
        const CAPTION_HEIGHT = 120; // Space reserved for caption under each image
        const HEADER_HEIGHT = 200;
        const FOOTER_HEIGHT = 150;

        // Load fonts from a reliable CDN to fix serverless path issues
        const [fontTitle, fontCaption, fontFooter] = await Promise.all([
            (Jimp as any).loadFont('https://cdn.jsdelivr.net/npm/@jimp/font-open-sans@1.0.15/fonts/open-sans-64-white/open-sans-64-white.fnt'),
            (Jimp as any).loadFont('https://cdn.jsdelivr.net/npm/@jimp/font-open-sans@1.0.15/fonts/open-sans-32-white/open-sans-32-white.fnt'),
            (Jimp as any).loadFont('https://cdn.jsdelivr.net/npm/@jimp/font-open-sans@1.0.15/fonts/open-sans-32-white/open-sans-32-white.fnt')
        ]);

        const jimpImages = await Promise.all(panels.map((p: any) => fetchImage(p.imageUrl, fontCaption)));
        
        // Resize all images to a standard width, maintaining aspect ratio
        jimpImages.forEach(img => img.resize(IMG_WIDTH, (Jimp as any).AUTO));

        // Calculate total canvas height
        const totalImageHeight = jimpImages.reduce((sum, img) => sum + img.getHeight(), 0);
        const totalHeight = HEADER_HEIGHT + totalImageHeight + (jimpImages.length * (PADDING + CAPTION_HEIGHT)) + FOOTER_HEIGHT;

        // Create the canvas
        const canvas = new (Jimp as any)(IMG_WIDTH + (PADDING * 2), totalHeight, '#110C13');

        // --- Draw Header ---
        canvas.print(fontTitle, 0, PADDING, {
            text: `Câu Chuyện Tình Yêu AI`,
            alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER,
        }, canvas.getWidth(), HEADER_HEIGHT);
         canvas.print(fontCaption, 0, PADDING + 80, {
            text: `"${title}"`,
            alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER,
        }, canvas.getWidth(), HEADER_HEIGHT);

        // --- Draw Images and Captions ---
        let currentY = HEADER_HEIGHT + PADDING;
        for (let i = 0; i < jimpImages.length; i++) {
            const img = jimpImages[i];
            const caption = panels[i].caption;

            // Draw image
            canvas.composite(img, PADDING, currentY);
            currentY += img.getHeight();

            // Draw caption below image
            canvas.print(fontCaption, PADDING, currentY + 10, {
                text: `"${caption}"`,
                alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER,
            }, IMG_WIDTH, CAPTION_HEIGHT);
            currentY += CAPTION_HEIGHT + PADDING;
        }

        // --- Draw Footer ---
        canvas.print(fontFooter, 0, currentY, {
            text: endText,
            alignmentX: (Jimp as any).HORIZONTAL_ALIGN_CENTER,
        }, canvas.getWidth(), FOOTER_HEIGHT);
        
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