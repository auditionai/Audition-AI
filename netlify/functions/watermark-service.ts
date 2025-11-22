
import Jimp from 'jimp';
import { Buffer } from 'buffer';

// Danh sách các domain dự phòng để tải logo nếu domain chính bị lỗi
const FALLBACK_LOGOS = [
    'https://auditionai.io.vn/watermark.png',
    'https://audition-ai.netlify.app/watermark.png',
    'https://taoanhai.io.vn/watermark.png'
];

const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
    try {
        console.log(`[Watermark] Trying to fetch logo from: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[Watermark] Failed to fetch ${url}: ${response.status} ${response.statusText}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.warn(`[Watermark] Error fetching ${url}:`, error);
        return null;
    }
};

export const addSmartWatermark = async (imageBuffer: Buffer, primaryUrl: string): Promise<Buffer> => {
    try {
        console.log(`--- [Watermark Service] Processing ---`);
        const image = await (Jimp as any).read(imageBuffer);
        
        const width = image.getWidth();
        const height = image.getHeight();

        // 1. Safe Gradient Vignette (Làm tối phần dưới ảnh để logo nổi bật)
        const gradientHeight = Math.floor(height * 0.3); // Tăng lên 30%
        const startY = height - gradientHeight;
        
        image.scan(0, startY, width, gradientHeight, function (x: number, y: number, idx: number) {
            const ratio = (y - startY) / gradientHeight;
            const darkness = Math.pow(ratio, 1.2) * 0.7; // Tối hơn một chút (0.7)
            
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];

            this.bitmap.data[idx + 0] = r * (1 - darkness);
            this.bitmap.data[idx + 1] = g * (1 - darkness);
            this.bitmap.data[idx + 2] = b * (1 - darkness);
        });

        // 2. Load Logo with Fallbacks
        let logo: any = null;
        
        // Tạo danh sách URL cần thử: URL truyền vào -> Fallback 1 -> Fallback 2...
        // Loại bỏ trùng lặp
        const urlsToTry = Array.from(new Set([primaryUrl, ...FALLBACK_LOGOS]));

        for (const url of urlsToTry) {
            const buffer = await fetchImageBuffer(url);
            if (buffer) {
                try {
                    logo = await (Jimp as any).read(buffer);
                    console.log(`[Watermark] Successfully loaded logo from: ${url}`);
                    break; // Đã tải được, thoát vòng lặp
                } catch (readError) {
                    console.warn(`[Watermark] Buffer loaded but Jimp failed to read from: ${url}`);
                }
            }
        }

        if (logo) {
            // Resize logo (30% chiều rộng ảnh chính)
            const targetLogoWidth = width * 0.3;
            logo.resize(targetLogoWidth, (Jimp as any).AUTO);

            // Vị trí: Góc dưới phải
            const margin = width * 0.05;
            const x = width - logo.getWidth() - margin;
            const y = height - logo.getHeight() - margin;

            image.composite(logo, x, y, {
                mode: (Jimp as any).BLEND_SOURCE_OVER,
                opacitySource: 1,
                opacityDest: 1
            });
        } else {
            // 3. Text Fallback (Nếu KHÔNG tải được bất kỳ logo nào)
            console.warn("[Watermark] All logo URLs failed. Using Text Fallback.");
            try {
                const font = await (Jimp as any).loadFont((Jimp as any).FONT_SANS_32_WHITE);
                const text = "AUDITION AI";
                
                const textWidth = (Jimp as any).measureText(font, text);
                const textHeight = (Jimp as any).measureTextHeight(font, text, width);
                
                const margin = 20;
                const x = width - textWidth - margin;
                const y = height - textHeight - margin;

                // In text bóng đổ
                const fontBlack = await (Jimp as any).loadFont((Jimp as any).FONT_SANS_32_BLACK);
                image.print(fontBlack, x + 2, y + 2, text);
                image.print(font, x, y, text);
            } catch (fontError) {
                 console.error("[Watermark] Failed to add text watermark fallback", fontError);
            }
        }

        return await image.getBufferAsync((Jimp as any).MIME_PNG);

    } catch (error) {
        console.error("[Watermark Service] Critical Error:", error);
        return imageBuffer; 
    }
};
