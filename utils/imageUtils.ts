
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

// NEW: Letterboxing / Outpainting Preprocessor
export const preprocessImageToAspectRatio = async (
    dataUrl: string,
    targetAspectRatio: string // e.g., "16:9", "1:1", "3:4"
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const [w, h] = targetAspectRatio.split(':').map(Number);
        if (!w || !h) return resolve(dataUrl); // Fallback if invalid ratio

        const img = new Image();
        img.onload = () => {
            // Standardize base width to ensure high quality input for AI
            const baseWidth = 1024;
            const canvas = document.createElement('canvas');
            canvas.width = baseWidth;
            canvas.height = Math.round(baseWidth * (h / w));

            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context error'));

            // STEP 1: Fill with WHITE background (Required for Outpainting)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // STEP 2: Calculate "Contain" dimensions
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const drawWidth = img.width * scale;
            const drawHeight = img.height * scale;
            
            // Center the image
            const offsetX = (canvas.width - drawWidth) / 2;
            const offsetY = (canvas.height - drawHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

            // Return result as Data URL (PNG to preserve quality)
            resolve(canvas.toDataURL('image/png'));
        };
        // FIX: Removed unused variable 'e' to satisfy TS6133
        img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
        img.src = dataUrl;
    });
};
