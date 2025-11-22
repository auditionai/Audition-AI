
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

        // 1. Hiệu ứng làm tối góc (Vignette)
        const gradientHeight = Math.floor(height * 0.25); 
        const startY = height - gradientHeight;
        
        image.scan(0, startY, width, gradientHeight, function (x: number, y: number, idx: number) {
            const ratio = (y - startY) / gradientHeight;
            const darkness = Math.pow(ratio, 1.2) * 0.7; 
            
            this.bitmap.data[idx + 0] *= (1 - darkness);
            this.bitmap.data[idx + 1] *= (1 - darkness);
            this.bitmap.data[idx + 2] *= (1 - darkness);
        });

        // 2. Tìm file logo trong môi trường Serverless
        // Netlify có thể thay đổi cấu trúc thư mục khi deploy, nên ta cần thử nhiều đường dẫn
        const possiblePaths = [
            // Đường dẫn chuẩn khi có netlify.toml included_files
            path.resolve(process.cwd(), 'netlify/functions/watermark.png'),
            // Đường dẫn khi chạy local hoặc một số cấu hình build khác
            path.resolve(__dirname, 'watermark.png'),
            // Đường dẫn dự phòng trong container
            '/var/task/netlify/functions/watermark.png',
            // Đường dẫn gốc
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
            
            console.log(`[Watermark] Applied successfully using file from: ${foundPath}`);
        } else {
            console.error(`[Watermark] FAILED to find 'watermark.png'. Searched in:`);
            possiblePaths.forEach(p => console.error(` - ${p}`));
            
            // Debug: Liệt kê file để xem cấu trúc thực tế trên server là gì
            try {
                console.log('[Watermark Debug] Current Dir files:', fs.readdirSync(__dirname));
                console.log('[Watermark Debug] CWD files:', fs.readdirSync(process.cwd()));
            } catch (e) {}
            
            // Fallback: Vẽ chữ nếu không tìm thấy ảnh (Cơ chế chống lỗi cuối cùng)
            try {
                const font = await (Jimp as any).loadFont((Jimp as any).FONT_SANS_32_WHITE);
                image.print(font, width - 200, height - 50, "AUDITION AI");
                console.log("[Watermark] Fallback text applied.");
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
