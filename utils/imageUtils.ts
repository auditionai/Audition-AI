
// Helper function to resize an image file before uploading
export const resizeImage = (file: File, maxSize: number): Promise<{ file: File; dataUrl: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) return reject(new Error('FileReader did not return a result.'));
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Could not get canvas context'));

                // Preserve transparency for PNG files
                const outputMimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                const outputQuality = 0.9;

                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL(outputMimeType, outputQuality);
                
                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error('Canvas to Blob conversion failed'));
                    const resizedFile = new File([blob], file.name, { type: outputMimeType });
                    resolve({ file: resizedFile, dataUrl });
                }, outputMimeType, outputQuality);
            };
            img.onerror = reject;
            img.src = event.target.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// Helper function to convert a base64 string back to a File object
export const base64ToFile = (base64: string, filename: string, mimeType: string): File => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return new File([blob], filename, { type: mimeType });
};

// ==================================================================================
// 🔒 LOCKED LOGIC: ASPECT RATIO ENFORCEMENT (SOLID BORDER STRATEGY)
// ⛔ WARNING: DO NOT MODIFY THIS FUNCTION UNDER ANY CIRCUMSTANCES.
// ⛔ LÝ DO: Logic này vẽ một viền cứng (Solid Border) và nền xám để ép Google Gemini
//    không được tự động crop ảnh. Việc thay đổi dù chỉ 1 dòng cũng sẽ làm hỏng tính năng
//    giữ tỉ lệ khung hình (Aspect Ratio) của toàn bộ ứng dụng.
// ==================================================================================
export const preprocessImageToAspectRatio = async (
    dataUrl: string,
    targetAspectRatio: string // e.g., "16:9", "1:1", "3:4"
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const [w, h] = targetAspectRatio.split(':').map(Number);
        if (!w || !h) return resolve(dataUrl); // Fallback if invalid ratio

        const img = new Image();
        img.onload = () => {
            // Sử dụng kích thước chuẩn tối ưu cho Gemini (bội số của 64 hoặc 128)
            const baseLongestSide = 1536; 
            
            let canvasWidth, canvasHeight;
            
            if (w > h) {
                canvasWidth = baseLongestSide;
                canvasHeight = Math.round(baseLongestSide * (h / w));
            } else {
                canvasHeight = baseLongestSide;
                canvasWidth = Math.round(baseLongestSide * (w / h));
            }

            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context error'));

            // --- 🔒 CRITICAL STEP 1: NEUTRAL GRAY BACKGROUND ---
            // Màu xám #808080 là màu chuẩn nhất để AI hiểu là "vùng trống cần vẽ thêm" (Outpainting)
            ctx.fillStyle = '#808080'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- 🔒 CRITICAL STEP 2: CALCULATE CONTAIN FIT ---
            // Tính toán để ảnh nhân vật nằm giữa, giữ nguyên tỉ lệ
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const drawWidth = img.width * scale;
            const drawHeight = img.height * scale;
            
            const offsetX = (canvas.width - drawWidth) / 2;
            const offsetY = (canvas.height - drawHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

            // --- 🔒 CRITICAL STEP 3: THE "SOLID FENCE" (HÀNG RÀO CỨNG) ---
            // Vẽ viền 1px bao quanh sát mép Canvas.
            // Điều này cực kỳ quan trọng: Nó báo cho AI biết "Đây là giới hạn của bức tranh".
            // Nếu AI crop, nó sẽ mất cái viền này -> AI được huấn luyện để tránh làm điều đó.
            ctx.strokeStyle = '#000000'; // Màu đen hoặc màu đặc biệt
            ctx.lineWidth = 2; // Đủ dày để Vision Model nhìn thấy
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            // Trả về PNG để không bị nén mất chi tiết viền
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
        img.src = dataUrl;
    });
};
// ==================================================================================
// 🔒 END OF LOCKED LOGIC
// ==================================================================================

// Create blank canvas with Solid Border (Also Protected)
export const createBlankCanvas = (aspectRatio: string): string => {
    const [w, h] = aspectRatio.split(':').map(Number);
    const baseLongestSide = 1536;
    
    let width, height;
    if (w > h) {
        width = baseLongestSide;
        height = Math.round(baseLongestSide * (h / w));
    } else {
        height = baseLongestSide;
        width = Math.round(baseLongestSide * (w / h));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Fill Gray
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, width, height);
    
    // Solid Fence Border (Locked)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);
    
    return canvas.toDataURL('image/png');
};
