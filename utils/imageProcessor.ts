
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
 * TECHNQUE: ADAPTIVE SOLID FENCE
 * 
 * Upgrade 2.0: Now respects the Aspect Ratio of the Source Image.
 * If input is Portrait, we create a Portrait Fence.
 * This prevents the character from being shrunk too small in a Square canvas,
 * ensuring shoes and face details are preserved.
 */
export const createSolidFence = async (base64Str: string, targetAspectRatio: string = "1:1", isPoseRef: boolean = false): Promise<string> => {
    return new Promise((resolve) => {
      // SAFEGUARD: Ensure valid Data URL to prevent 414 URI Too Long errors
      let src = base64Str;
      if (base64Str && !base64Str.startsWith('data:') && !base64Str.startsWith('http')) {
           src = `data:image/jpeg;base64,${base64Str}`;
      }

      const img = new Image();
      img.crossOrigin = "Anonymous"; 
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
  
        // Base dimension unit
        const BASE_DIM = 1024; 
        
        let canvasW = BASE_DIM;
        let canvasH = BASE_DIM;

        // LOGIC: DETERMINE CANVAS SHAPE BASED ON INPUT
        // If it's a character reference (not pose), we want to maximize the pixel area of the character.
        if (!isPoseRef) {
            const ratio = img.width / img.height;
            
            if (ratio < 0.8) {
                // Portrait Image (Tall) -> Use Portrait Canvas (e.g., 1024 x 1536)
                // We cap height at 1536 to stay within reasonable token limits while giving space
                canvasW = 1024;
                canvasH = 1536; 
            } else if (ratio > 1.2) {
                // Landscape Image (Wide)
                canvasW = 1536;
                canvasH = 1024;
            } else {
                // Square-ish
                canvasW = 1024;
                canvasH = 1024;
            }
        } else {
            // For Pose Reference, we try to match the output target aspect ratio if possible,
            // or keep it square if generic.
            if (targetAspectRatio === '9:16') { canvasW = 768; canvasH = 1344; }
            else if (targetAspectRatio === '16:9') { canvasW = 1344; canvasH = 768; }
            else if (targetAspectRatio === '3:4') { canvasW = 768; canvasH = 1024; }
            else { canvasW = 1024; canvasH = 1024; }
        }
        
        canvas.width = canvasW;
        canvas.height = canvasH;
  
        // 1. FILL THE VOID (Neutral Gray #808080)
        ctx.fillStyle = '#808080'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
  
        // 2. CALCULATE FIT (CONTAIN)
        // We want the image to fit fully inside without cropping pixels
        const scale = Math.min((canvasW - 40) / img.width, (canvasH - 40) / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        const x = Math.round((canvasW - drawW) / 2);
        const y = Math.round((canvasH - drawH) / 2);
        
        // 3. DRAW IMAGE
        ctx.drawImage(img, x, y, drawW, drawH);
        
        // 4. DRAW THE FENCE (Solid Border)
        // This tells the AI: "Look strictly inside this box"
        if (!isPoseRef) {
            ctx.strokeStyle = '#000000'; // Black border
            ctx.lineWidth = 4; // EXACTLY 4px
            ctx.strokeRect(x, y, drawW, drawH); 
        }
  
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      
      img.onerror = () => {
          console.warn("createSolidFence failed to load image");
          resolve(base64Str);
      };
      
      img.src = src;
    });
  };
  
  // STRICT OPTIMIZER: RESIZE ONLY, NO PADDING, NO GRAY BARS
  export const optimizePayload = async (base64Str: string, maxWidth = 1024): Promise<string> => {
      return new Promise((resolve) => {
          // SAFEGUARD: Ensure valid Data URL
          let src = base64Str;
          if (base64Str && !base64Str.startsWith('data:') && !base64Str.startsWith('http')) {
             src = `data:image/jpeg;base64,${base64Str}`;
          }

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
          img.src = src;
      });
  }

  // NEW: DIGITAL TWIN SLICER (Cắt ảnh thành 2 phần để AI soi chi tiết)
  export const sliceImageVertical = async (base64Str: string): Promise<{ top: string, bottom: string } | null> => {
    return new Promise((resolve) => {
        let src = base64Str;
        if (!base64Str.startsWith('data:')) src = `data:image/jpeg;base64,${base64Str}`;

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const w = img.width;
            const h = img.height;
            
            // Nếu ảnh quá nhỏ hoặc quá ngang (Landscape), không cần cắt
            if (h < 500 || w > h * 1.5) {
                resolve(null);
                return;
            }

            // Create Top Slice (Face & Body) - 0% to 65%
            const canvasTop = document.createElement('canvas');
            canvasTop.width = w;
            canvasTop.height = Math.floor(h * 0.65);
            const ctxTop = canvasTop.getContext('2d');
            if (ctxTop) ctxTop.drawImage(img, 0, 0, w, h * 0.65, 0, 0, w, h * 0.65);

            // Create Bottom Slice (Legs & Shoes) - 40% to 100% (Overlap to ensure context)
            const canvasBottom = document.createElement('canvas');
            canvasBottom.width = w;
            canvasBottom.height = Math.floor(h * 0.60);
            const ctxBottom = canvasBottom.getContext('2d');
            // Source Y starts at 40% of height
            if (ctxBottom) ctxBottom.drawImage(img, 0, h * 0.40, w, h * 0.60, 0, 0, w, h * 0.60);

            resolve({
                top: canvasTop.toDataURL('image/jpeg', 0.9),
                bottom: canvasBottom.toDataURL('image/jpeg', 0.9)
            });
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
  };
