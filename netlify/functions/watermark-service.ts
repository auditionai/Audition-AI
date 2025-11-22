
import Jimp from 'jimp';
import { Buffer } from 'buffer';

// Danh sách các domain dự phòng để tải logo
const FALLBACK_LOGOS = [
    'https://auditionai.io.vn/watermark.png',
    'https://audition-ai.netlify.app/watermark.png',
    'https://taoanhai.io.vn/watermark.png'
];

const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
    try {
        // Add User-Agent to avoid being blocked by some CDNs/Firewalls
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (AuditionAI-Serverless)' }
        });
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.warn(`[Watermark] Error fetching ${url}:`, error);
        return null;
    }
};

export const addSmartWatermark = async (imageBuffer: Buffer, primaryUrl: string): Promise<Buffer> => {
    try {
        console.log(`--- [Watermark Service] Processing Image Size: ${imageBuffer.length} bytes ---`);
        const image = await (Jimp as any).read(imageBuffer);
        
        const width = image.getWidth();
        const height = image.getHeight();

        // 1. Gradient Vignette (Darken bottom for better visibility)
        const gradientHeight = Math.floor(height * 0.3); 
        const startY = height - gradientHeight;
        
        image.scan(0, startY, width, gradientHeight, function (x: number, y: number, idx: number) {
            const ratio = (y - startY) / gradientHeight;
            const darkness = Math.pow(ratio, 1.2) * 0.7; 
            
            this.bitmap.data[idx + 0] *= (1 - darkness); // R
            this.bitmap.data[idx + 1] *= (1 - darkness); // G
            this.bitmap.data[idx + 2] *= (1 - darkness); // B
        });

        // 2. Try Loading Logo
        let logo: any = null;
        const urlsToTry = Array.from(new Set([primaryUrl, ...FALLBACK_LOGOS]));

        for (const url of urlsToTry) {
            if (!url) continue;
            const buffer = await fetchImageBuffer(url);
            if (buffer) {
                try {
                    logo = await (Jimp as any).read(buffer);
                    console.log(`[Watermark] Loaded logo from: ${url}`);
                    break; 
                } catch (e) {}
            }
        }

        if (logo) {
            // --- IMAGE LOGO MODE ---
            const targetLogoWidth = width * 0.35; // 35% width
            logo.resize(targetLogoWidth, (Jimp as any).AUTO);

            const margin = width * 0.05;
            const x = width - logo.getWidth() - margin;
            const y = height - logo.getHeight() - margin;

            image.composite(logo, x, y, {
                mode: (Jimp as any).BLEND_SOURCE_OVER,
                opacitySource: 1,
                opacityDest: 1
            });
        } else {
            // --- TEXT FALLBACK MODE (When logo fails) ---
            console.warn("[Watermark] Logo load failed. Using Text Fallback.");
            
            try {
                // Try loading font
                const font = await (Jimp as any).loadFont((Jimp as any).FONT_SANS_32_WHITE);
                const text = "AUDITION AI";
                
                const textWidth = (Jimp as any).measureText(font, text);
                const textHeight = (Jimp as any).measureTextHeight(font, text, width);
                
                const margin = 20;
                const x = width - textWidth - margin;
                const y = height - textHeight - margin;

                // Draw a subtle background for the text to ensure readability
                // (Optional: Draw a semi-transparent box behind text if needed, 
                // but the vignette step above should handle it)

                image.print(font, x, y, text);
                
            } catch (fontError) {
                console.error("[Watermark] Font load failed:", fontError);
                // Absolute Last Resort: Draw simple pixels or ignore
            }
        }

        return await image.getBufferAsync((Jimp as any).MIME_PNG);

    } catch (error) {
        console.error("[Watermark Service] Critical Error:", error);
        return imageBuffer; // Return original on crash
    }
};
