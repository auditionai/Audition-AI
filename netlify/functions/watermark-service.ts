import Jimp from 'jimp';
import { Buffer } from 'buffer';
import path from 'path';
import fs from 'fs';

// Hàm này bây giờ sẽ đọc file trực tiếp từ ổ đĩa server, không tải qua mạng
export const addSmartWatermark = async (imageBuffer: Buffer, _unusedUrl: string): Promise<Buffer> => {
    try {
        console.log(`--- [Watermark] Processing Image (${imageBuffer.length} bytes) ---`);
        const image = await (Jimp as any).read(imageBuffer);
        
        const width = image.getWidth();
        const height = image.getHeight();

        // 1. Hiệu ứng làm tối góc (Vignette) - Giảm xuống chỉ tác động 15% dưới đáy ảnh
        const gradientHeight = Math.floor(height * 0.15); 
        const startY = height - gradientHeight;
        
        image.scan(0, startY, width, gradientHeight, function (x: number, y: number, idx: number) {
            const ratio = (y - startY) / gradientHeight;
            // Giảm độ tối xuống 0.5 (nhẹ nhàng hơn)
            const darkness = Math.pow(ratio, 1.2) * 0.5; 
            
            this.bitmap.data[idx + 0] *= (1 - darkness);
            this.bitmap.data[idx + 1] *= (1 - darkness);
            this.bitmap.data[idx + 2] *= (1 - darkness);
        });

        // 2. Tìm file logo trong môi trường Serverless
        const possiblePaths = [
            path.resolve(process.cwd(), 'netlify/functions/watermark.png'),
            path.resolve(__dirname, 'watermark.png'),
            '/var/task/netlify/functions/watermark.png',
            path.join(process.cwd(), 'watermark.png')
        ];

        let logoBuffer: Buffer | null = null;
        let foundPath = '';
        
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                console.log(`[Watermark] Found local logo at: ${p}`);
                logoBuffer = fs.readFileSync(p);
                foundPath = p;
                break;
            }
        }

        if (logoBuffer) {
            const logo = await (Jimp as any).read(logoBuffer);

            // 3. Resize logo: 15% chiều rộng ảnh chính (Logo bé ở góc)
            const targetLogoWidth = width * 0.15;
            logo.resize(targetLogoWidth, (Jimp as any).AUTO);

            // Margin: 3% từ lề
            const margin = width * 0.03;
            const x = width - logo.getWidth() - margin;
            const y = height - logo.getHeight() - margin;

            // 4. Chèn logo vào ảnh
            image.composite(logo, x, y, {
                mode: (Jimp as any).BLEND_SOURCE_OVER,
                opacitySource: 1,
                opacityDest: 1
            });
            
            console.log(`[Watermark] Applied successfully using file from: ${foundPath}`);
        } else {
            console.error(`[Watermark] FAILED to find 'watermark.png'. Searched in:`);
            possiblePaths.forEach(p => console.error(` - ${p}`));
            
            try {
                // Fallback Text nhỏ gọn hơn
                const font = await (Jimp as any).loadFont((Jimp as any).FONT_SANS_16_WHITE);
                image.print(font, width - 120, height - 30, "AUDITION AI");
            } catch (e) {
                console.error("[Watermark] Fallback text failed too.");
            }
        }

        return await image.getBufferAsync((Jimp as any).MIME_PNG);

    } catch (error) {
        console.error("[Watermark] Fatal Error:", error);
        return imageBuffer; 
    }
};