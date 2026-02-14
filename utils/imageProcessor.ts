
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
 * TECHNQUE: GRAY-CANVAS SOLID FENCE (From Audition AI Logic)
 * 
 * Instead of just cropping, we place the image in a "Safe Box".
 * 1. Background: Neutral Gray (#808080) - The universal "Mask/Void" color for AI.
 * 2. Border: Solid 4px Border - The "Fence" that tells AI "Do not modify pixels inside".
 * 3. Purpose: Forces AI to treat this image as a "Texture Source" rather than a flexible scene.
 */
export const createSolidFence = async (base64Str: string, aspectRatio: string = "1:1", isPoseRef: boolean = false): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous"; 
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
  
        // Standardize size for AI Input (Square usually best for Token parsing, or match aspect)
        const BASE_SIZE = 1024; 
        
        // If it's a pose ref, we might want to match aspect ratio exactly.
        // If it's a character ref (Solid Fence), we want a focus card.
        canvas.width = BASE_SIZE;
        canvas.height = BASE_SIZE;
  
        // 1. FILL THE VOID (Neutral Gray #808080)
        // This is crucial. It tells the AI "There is no context here, look ONLY at the subject".
        ctx.fillStyle = '#808080'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
  
        // Calculate fit dimensions (contain)
        const scale = Math.min((BASE_SIZE - 40) / img.width, (BASE_SIZE - 40) / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        const x = Math.round((BASE_SIZE - drawW) / 2);
        const y = Math.round((BASE_SIZE - drawH) / 2);
        
        // Draw the image normally (keep colors true)
        ctx.drawImage(img, x, y, drawW, drawH);
        
        // DRAW THE FENCE (Solid Border) - ONLY FOR CHARACTER INPUTS
        // Use exactly 4px Black border as per spec.
        if (!isPoseRef) {
            ctx.strokeStyle = '#000000'; // Black border
            ctx.lineWidth = 4; // EXACTLY 4px
            ctx.strokeRect(x, y, drawW, drawH); // The "Cage"
        }
  
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };
  
  // STRICT OPTIMIZER: RESIZE ONLY, NO PADDING, NO GRAY BARS
  export const optimizePayload = async (base64Str: string, maxWidth = 1024): Promise<string> => {
      return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.onload = () => {
              // If image is small enough, return as is
              if (img.width <= maxWidth && img.height <= maxWidth) {
                  resolve(base64Str);
                  return;
              }
  
              // Calculate new dimensions maintaining aspect ratio
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
  
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                  // Draw image filling the canvas exactly
                  ctx.drawImage(img, 0, 0, width, height);
              }
              
              resolve(canvas.toDataURL('image/jpeg', 0.9)); 
          };
          img.onerror = () => resolve(base64Str);
          img.src = base64Str;
      });
  }
