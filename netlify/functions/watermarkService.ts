
import Jimp from 'jimp';
import { Buffer } from 'buffer';

export const addSmartWatermark = async (imageBuffer: Buffer, watermarkUrl: string): Promise<Buffer> => {
    try {
        console.log("--- [Watermark Service] Processing ---");
        const image = await (Jimp as any).read(imageBuffer);
        
        const width = image.getWidth();
        const height = image.getHeight();

        // 1. Safe Gradient Vignette (Làm tối phần dưới ảnh để logo nổi bật)
        // Chỉ làm tối RGB, GIỮ NGUYÊN Alpha để tránh lỗi nền đen chết
        const gradientHeight = Math.floor(height * 0.25); // Tác động 25% dưới cùng
        const startY = height - gradientHeight;
        
        image.scan(0, startY, width, gradientHeight, function (x: number, y: number, idx: number) {
            // Tỷ lệ đi xuống: 0 (bắt đầu vùng tối) -> 1 (đáy ảnh)
            const ratio = (y - startY) / gradientHeight;
            
            // Độ tối: Max 60% (0.6) ở đáy
            const darkness = Math.pow(ratio, 1.5) * 0.6; 
            
            // Lấy giá trị hiện tại
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];
            // const a = this.bitmap.data[idx + 3]; // Alpha giữ nguyên

            // Làm tối màu
            this.bitmap.data[idx + 0] = r * (1 - darkness);
            this.bitmap.data[idx + 1] = g * (1 - darkness);
            this.bitmap.data[idx + 2] = b * (1 - darkness);
        });

        // 2. Load & Overlay Logo
        try {
            // Fetch logo từ URL public của app
            const logo = await (Jimp as any).read(watermarkUrl);
            
            // Tính toán kích thước logo (30% chiều rộng ảnh chính)
            const targetLogoWidth = width * 0.3;
            
            // Resize logo giữ nguyên tỷ lệ
            logo.resize(targetLogoWidth, (Jimp as any).AUTO);

            // Tính toán vị trí (Góc dưới phải, cách lề 5%)
            const margin = width * 0.05;
            const x = width - logo.getWidth() - margin;
            const y = height - logo.getHeight() - margin;

            // Chèn logo (Opacity 100%)
            image.composite(logo, x, y, {
                mode: (Jimp as any).BLEND_SOURCE_OVER,
                opacitySource: 1,
                opacityDest: 1
            });
            
            console.log("[Watermark Service] Logo added successfully.");
        } catch (logoError) {
            console.warn("[Watermark Service] Could not load watermark logo. Returning image with gradient only.", logoError);
            // Nếu không tải được logo, vẫn trả về ảnh đã có gradient tối (tốt hơn là lỗi)
        }

        return await image.getBufferAsync((Jimp as any).MIME_PNG);

    } catch (error) {
        console.error("[Watermark Service] Critical Error:", error);
        return imageBuffer; // Trả về ảnh gốc nếu lỗi nghiêm trọng
    }
};
