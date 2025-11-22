
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

        // 1. Hiệu ứng làm tối góc (Vignette) để logo nổi bật hơn
        const gradientHeight = Math.floor(height * 0.25); 
        const startY = height - gradientHeight;
        
        image.scan(0, startY, width, gradientHeight, function (x: number, y: number, idx: number) {
            const ratio = (y - startY) / gradientHeight;
            const darkness = Math.pow(ratio, 1.2) * 0.7; 
            
            this.bitmap.data[idx + 0] *= (1 - darkness);
            this.bitmap.data[idx + 1] *= (1 - darkness);
            this.bitmap.data[idx + 2] *= (1 - darkness);
        });

        // 2. Đọc file Logo trực tiếp từ thư mục functions
        // Chúng ta thử vài đường dẫn khác nhau vì Netlify đóng gói file có thể thay đổi cấu trúc thư mục
        const possiblePaths = [
            path.join(__dirname, 'watermark.png'),
            path.resolve(__dirname, 'watermark.png'),
            path.join(process.cwd(), 'netlify', 'functions', 'watermark.png'),
            path.join(process.cwd(), 'watermark.png')
        ];

        let logoBuffer: Buffer | null = null;
        
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                console.log(`[Watermark] Found local logo at: ${p}`);
                logoBuffer = fs.readFileSync(p);
                break;
            }
        }

        if (logoBuffer) {
            const logo = await (Jimp as any).read(logoBuffer);

            // 3. Resize logo bằng 35% chiều rộng ảnh chính
            const targetLogoWidth = width * 0.35;
            logo.resize(targetLogoWidth, (Jimp as any).AUTO);

            const margin = width * 0.05;
            const x = width - logo.getWidth() - margin;
            const y = height - logo.getHeight() - margin;

            // 4. Chèn logo vào ảnh
            image.composite(logo, x, y, {
                mode: (Jimp as any).BLEND_SOURCE_OVER,
                opacitySource: 1,
                opacityDest: 1
            });
            
            console.log("[Watermark] Local logo applied successfully.");
        } else {
            console.error(`[Watermark] Failed to find 'watermark.png'. Checked paths: ${possiblePaths.join(', ')}`);
            console.error(`[Watermark] Current Dir: ${__dirname}, CWD: ${process.cwd()}`);
            try {
                // List files in current dir to help debug
                const files = fs.readdirSync(__dirname);
                console.log('[Watermark] Files in __dirname:', files);
            } catch (e) {}
        }

        return await image.getBufferAsync((Jimp as any).MIME_PNG);

    } catch (error) {
        console.error("[Watermark] Fatal Error:", error);
        return imageBuffer; 
    }
};
