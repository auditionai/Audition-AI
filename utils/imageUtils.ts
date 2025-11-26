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

                // Force JPEG for AI inputs to ensure small payload size (<1MB).
                const outputMimeType = 'image/jpeg'; 
                const outputQuality = 0.85; // Reduced slightly for safety

                // Draw white background first
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL(outputMimeType, outputQuality);
                
                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error('Canvas to Blob conversion failed'));
                    const resizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: outputMimeType });
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
// ==================================================================================
export const preprocessImageToAspectRatio = async (
    dataUrl: string,
    targetAspectRatio: string // e.g., "16:9", "1:1", "3:4"
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const [w, h] = targetAspectRatio.split(':').map(Number);
        if (!w || !h) return resolve(dataUrl);

        const img = new Image();
        img.onload = () => {
            // OPTIMIZATION: Use 1024px max dimension. 
            // 1536px was causing timeouts/payload errors on Netlify Functions with Gemini 3.
            const baseLongestSide = 1024; 
            
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
            ctx.fillStyle = '#808080'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- 🔒 CRITICAL STEP 2: CALCULATE CONTAIN FIT ---
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const drawWidth = img.width * scale;
            const drawHeight = img.height * scale;
            
            const offsetX = (canvas.width - drawWidth) / 2;
            const offsetY = (canvas.height - drawHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

            // --- 🔒 CRITICAL STEP 3: THE "SOLID FENCE" (HÀNG RÀO CỨNG) ---
            ctx.strokeStyle = '#000000'; 
            ctx.lineWidth = 4; 
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            // OPTIMIZATION: Export as JPEG 0.85 quality.
            // Reduces size significantly while maintaining structure for ControlNet/IP-Adapter usage.
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
        img.src = dataUrl;
    });
};

// Create blank canvas with Solid Border
export const createBlankCanvas = (aspectRatio: string): string => {
    const [w, h] = aspectRatio.split(':').map(Number);
    const baseLongestSide = 1024; // Consistent with preprocess
    
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

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);
    
    return canvas.toDataURL('image/jpeg', 0.85);
};