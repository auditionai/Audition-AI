

/**
 * CORE SOLUTION: "Structural Image Conditioning" (The Solid Fence)
 * 
 * This utility prepares the reference image for the Multimodal LLM (Gemini 3 Vision).
 * Instead of sending the raw image, we place it on a canvas that matches the TARGET aspect ratio.
 */

export const urlToBase64 = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error converting URL to Base64:", error);
        return null;
    }
};

export const createSolidFence = async (base64Str: string, aspectRatio: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous"; // Enable CORS for external images
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
  
        // Determine target dimensions based on aspect ratio
        // We use a high-fidelity base size (e.g., 1536px) to ensure the structure is clear to the Vision Encoder
        const BASE_SIZE = 1536; 
        const [wRatio, hRatio] = aspectRatio.split(':').map(Number);
        
        let targetW, targetH;
        
        // Calculate dimensions maintaining aspect ratio logic
        if (wRatio > hRatio) {
            targetW = BASE_SIZE;
            targetH = Math.round(BASE_SIZE * (hRatio / wRatio));
        } else {
            targetH = BASE_SIZE;
            targetW = Math.round(BASE_SIZE * (wRatio / hRatio));
        }
  
        canvas.width = targetW;
        canvas.height = targetH;
  
        // 1. THE VOID: Fill background with #808080 (Neutral Grey)
        // This signals "Outpainting Area" to the model.
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, targetW, targetH);
  
        // Calculate scaling to fit the source image *inside* the fence (Contain mode)
        // We want the reference structure to be fully visible, not cropped.
        const scale = Math.min(targetW / img.width, targetH / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        
        // Center the image
        const x = Math.round((targetW - drawW) / 2);
        const y = Math.round((targetH - drawH) / 2);
        
        // 2. THE ANCHOR: Draw a 4px Solid Black Border
        // This creates a high-contrast boundary that the Vision Encoder locks onto as a structural limit.
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        
        // Draw the border slightly outside the image to frame it perfectly
        ctx.strokeRect(x - 2, y - 2, drawW + 4, drawH + 4);

        // 3. THE CONTENT: Draw the source image
        // High quality smoothing is essential so the AI sees clear details
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, drawW, drawH);
  
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };
  
  export const optimizePayload = async (base64Str: string, maxWidth = 1024): Promise<string> => {
      return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.onload = () => {
              // If image is already optimized/small enough, return as is to preserve quality
              if (img.width <= maxWidth && img.height <= maxWidth) {
                  resolve(base64Str);
                  return;
              }
  
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
  
              // Calculate new size maintaining aspect ratio
              if (width > height) {
                  if (width > maxWidth) {
                      height *= maxWidth / width;
                      width = maxWidth;
                  }
              } else {
                  if (height > maxWidth) {
                      width *= maxWidth / height;
                      height = maxWidth;
                  }
              }
  
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                  ctx.drawImage(img, 0, 0, width, height);
              }
              
              // Compress to JPEG 0.9 to reduce payload size for API without losing structural details
              resolve(canvas.toDataURL('image/jpeg', 0.9)); 
          };
          img.onerror = () => resolve(base64Str);
          img.src = base64Str;
      });
  }
