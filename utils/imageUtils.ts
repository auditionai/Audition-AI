
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

// NEW: Letterboxing / Outpainting Preprocessor (ANCHOR STRATEGY)
// ROBUST VERSION: Uses Gray background + Corner Anchors to force Aspect Ratio
export const preprocessImageToAspectRatio = async (
    dataUrl: string,
    targetAspectRatio: string // e.g., "16:9", "1:1", "3:4"
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const [w, h] = targetAspectRatio.split(':').map(Number);
        if (!w || !h) return resolve(dataUrl); // Fallback if invalid ratio

        const img = new Image();
        img.onload = () => {
            // Standardize base size. 
            // Using a slightly larger base ensures anchors are distinct.
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

            // --- STEP 1: SUPREME GRAY PADDING ---
            // Neutral Gray #888888 signals "Outpaint Area" to modern diffusion models better than black/white
            ctx.fillStyle = '#888888'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- STEP 2: CALCULATE CONTAIN FIT ---
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const drawWidth = img.width * scale;
            const drawHeight = img.height * scale;
            
            // Center the image
            const offsetX = (canvas.width - drawWidth) / 2;
            const offsetY = (canvas.height - drawHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

            // --- STEP 3: ANCHOR PIXELS (THE "FORCE" TRICK) ---
            // Draw small distinct pixels in the exact 4 corners.
            // This forces the AI's vision encoder to recognize the full bounds of the canvas.
            // Without this, AI often auto-crops empty space.
            ctx.fillStyle = '#111111'; // Dark Anchor
            const anchorSize = 8; // Large enough to be seen by encoder, small enough to be ignored in final art ideally
            
            // Top-Left
            ctx.fillRect(0, 0, anchorSize, anchorSize);
            // Top-Right
            ctx.fillRect(canvas.width - anchorSize, 0, anchorSize, anchorSize);
            // Bottom-Left
            ctx.fillRect(0, canvas.height - anchorSize, anchorSize, anchorSize);
            // Bottom-Right
            ctx.fillRect(canvas.width - anchorSize, canvas.height - anchorSize, anchorSize, anchorSize);

            // Return result as PNG to avoid compression artifacts on anchors
            resolve(canvas.toDataURL('image/png'));
        };
        // FIX: Removed unused variable 'e' to satisfy TS6133
        img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
        img.src = dataUrl;
    });
};

// NEW: Create a blank gray canvas with specific aspect ratio and anchors
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

    // Fill with Gray
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, width, height);
    
    // Add Anchors
    ctx.fillStyle = '#111111';
    const anchorSize = 8;
    ctx.fillRect(0, 0, anchorSize, anchorSize);
    ctx.fillRect(width - anchorSize, 0, anchorSize, anchorSize);
    ctx.fillRect(0, height - anchorSize, anchorSize, anchorSize);
    ctx.fillRect(width - anchorSize, height - anchorSize, anchorSize, anchorSize);
    
    return canvas.toDataURL('image/png');
};
