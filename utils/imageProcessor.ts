
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

/**
 * Creates a "Blueprint" version of the reference image.
 * 1. Matches Target Aspect Ratio (adding padding if needed).
 * 2. Applies "GHOST FILTER" (Grayscale + High Brightness + Low Contrast).
 *    This makes the reference look like a faded photocopy. 
 *    Result: Strong colors (black pants) become light grey, forcing AI to ignore them.
 */
export const createSolidFence = async (base64Str: string, aspectRatio: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous"; // Enable CORS for external images
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
  
        // Determine target dimensions based on aspect ratio
        const BASE_SIZE = 1536; 
        const [wRatio, hRatio] = aspectRatio.split(':').map(Number);
        
        let targetW, targetH;
        
        if (wRatio > hRatio) {
            targetW = BASE_SIZE;
            targetH = Math.round(BASE_SIZE * (hRatio / wRatio));
        } else {
            targetH = BASE_SIZE;
            targetW = Math.round(BASE_SIZE * (wRatio / hRatio));
        }
  
        canvas.width = targetW;
        canvas.height = targetH;
  
        // 1. THE VOID: Fill background with white to blend with the high brightness filter
        ctx.fillStyle = '#FFFFFF'; 
        ctx.fillRect(0, 0, targetW, targetH);
  
        const scale = Math.min(targetW / img.width, targetH / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        
        const x = Math.round((targetW - drawW) / 2);
        const y = Math.round((targetH - drawH) / 2);
        
        // --- CRITICAL UPDATE: THE "GHOST" FILTER ---
        // 1. Grayscale: Remove color bias.
        // 2. Brightness(1.4): Wash out dark blacks to light greys.
        // 3. Contrast(0.6): Flatten texture details so it looks like a wireframe, not a photo.
        // 4. Blur(0.5px): Slight blur to destroy specific fabric textures.
        ctx.filter = 'grayscale(100%) brightness(1.4) contrast(0.6) blur(0.5px)';
        
        // Draw the source image
        ctx.drawImage(img, x, y, drawW, drawH);
        
        // Reset filter for guide lines
        ctx.filter = 'none';

        // 2. THE ANCHOR: Draw a faint border to indicate the frame
        if (targetW > drawW + 50 || targetH > drawH + 50) {
            ctx.setLineDash([10, 10]);
            ctx.strokeStyle = '#CCCCCC'; // Very faint
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, drawW, drawH);
        }
  
        resolve(canvas.toDataURL('image/jpeg', 0.85));
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
              if (img.width <= maxWidth && img.height <= maxWidth) {
                  resolve(base64Str);
                  return;
              }
  
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
  
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
              
              resolve(canvas.toDataURL('image/jpeg', 0.9)); 
          };
          img.onerror = () => resolve(base64Str);
          img.src = base64Str;
      });
  }
