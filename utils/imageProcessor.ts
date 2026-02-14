
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
 * Matches Target Aspect Ratio.
 * APPLIES "VISUAL BLEACH": Heavily washes out the image to remove dark colors.
 */
export const createSolidFence = async (base64Str: string, aspectRatio: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous"; 
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
  
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
  
        // 1. Fill Background White
        ctx.fillStyle = '#FFFFFF'; 
        ctx.fillRect(0, 0, targetW, targetH);
  
        const scale = Math.min(targetW / img.width, targetH / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        const x = Math.round((targetW - drawW) / 2);
        const y = Math.round((targetH - drawH) / 2);
        
        // 2. Draw Image with Grayscale Filter
        ctx.filter = 'grayscale(100%)';
        ctx.drawImage(img, x, y, drawW, drawH);
        ctx.filter = 'none';

        // --- THE BRUTAL FIX: WHITE OVERLAY (BLEACHING) ---
        // We draw a semi-transparent white box over the entire image.
        // This physically lightens "Black" (0,0,0) to "Light Grey" (e.g., 200,200,200).
        // The AI simply CANNOT see black pixels anymore because they don't exist.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; // 85% White Overlay
        ctx.fillRect(0, 0, targetW, targetH);

        // 3. Re-enhance edges slightly so pose is still visible (optional, but good for structure)
        // Since we washed it out, we don't want it invisible. The contrast logic is handled by the model seeing "faint lines".
        
        // 4. Draw Guide Border
        if (targetW > drawW + 50 || targetH > drawH + 50) {
            ctx.setLineDash([10, 10]);
            ctx.strokeStyle = '#DDDDDD'; 
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, drawW, drawH);
        }
  
        resolve(canvas.toDataURL('image/jpeg', 0.9));
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
