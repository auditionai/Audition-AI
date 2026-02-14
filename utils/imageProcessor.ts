
/**
 * CORE SOLUTION: "Structural Image Conditioning" (The Solid Fence)
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

export const createSolidFence = async (base64Str: string, targetAspectRatio: string = "1:1", isPoseRef: boolean = false): Promise<string> => {
    return new Promise((resolve) => {
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
  
        const BASE_DIM = 1024; 
        let canvasW = BASE_DIM;
        let canvasH = BASE_DIM;

        if (!isPoseRef) {
            const ratio = img.width / img.height;
            if (ratio < 0.8) {
                canvasW = 1024; canvasH = 1536; 
            } else if (ratio > 1.2) {
                canvasW = 1536; canvasH = 1024;
            } else {
                canvasW = 1024; canvasH = 1024;
            }
        } else {
            if (targetAspectRatio === '9:16') { canvasW = 768; canvasH = 1344; }
            else if (targetAspectRatio === '16:9') { canvasW = 1344; canvasH = 768; }
            else if (targetAspectRatio === '3:4') { canvasW = 768; canvasH = 1024; }
            else { canvasW = 1024; canvasH = 1024; }
        }
        
        canvas.width = canvasW;
        canvas.height = canvasH;
  
        ctx.fillStyle = '#808080'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
  
        const scale = Math.min((canvasW - 40) / img.width, (canvasH - 40) / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        const x = Math.round((canvasW - drawW) / 2);
        const y = Math.round((canvasH - drawH) / 2);
        
        ctx.drawImage(img, x, y, drawW, drawH);
        
        if (!isPoseRef) {
            ctx.strokeStyle = '#000000'; 
            ctx.lineWidth = 4; 
            ctx.strokeRect(x, y, drawW, drawH); 
        }
  
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      
      img.onerror = () => resolve(base64Str);
      img.src = src;
    });
  };
  
  export const optimizePayload = async (base64Str: string, maxWidth = 1024): Promise<string> => {
      return new Promise((resolve) => {
          let src = base64Str;
          if (base64Str && !base64Str.startsWith('data:') && !base64Str.startsWith('http')) {
             src = `data:image/jpeg;base64,${base64Str}`;
          }

          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.onload = () => {
              if (img.width <= maxWidth && img.height <= maxWidth) {
                  resolve(base64Str);
                  return;
              }
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
                  ctx.drawImage(img, 0, 0, width, height);
              }
              resolve(canvas.toDataURL('image/jpeg', 0.9)); 
          };
          img.onerror = () => resolve(base64Str);
          img.src = src;
      });
  }

  // --- RESTORED & SIMPLIFIED: TEXTURE SHEET GENERATOR ---
  // Just Body + Face. No more shoes logic.
  export const createTextureSheet = async (
      bodyBase64: string, 
      faceBase64?: string | null,
      shoesBase64?: string | null // Kept arg for compatibility but ignored
  ): Promise<string> => {
    return new Promise(async (resolve) => {
        const loadImg = (src: string): Promise<HTMLImageElement> => {
            return new Promise((res, rej) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.onload = () => res(img);
                img.onerror = () => rej(new Error("Load failed"));
                let safeSrc = src;
                if (!src.startsWith('data:') && !src.startsWith('http')) safeSrc = `data:image/jpeg;base64,${src}`;
                img.src = safeSrc;
            });
        };

        try {
            const bodyImg = await loadImg(bodyBase64);
            
            // CLASSIC LAYOUT: Side by Side (Body Left 70%, Face Right 30%)
            // Or if no face, just Body.
            
            if (!faceBase64) {
                // If only body, just optimize it
                const optimizedBody = await optimizePayload(bodyBase64, 1500);
                return resolve(optimizedBody);
            }

            const faceImg = await loadImg(faceBase64);

            const SHEET_H = 1500;
            const TOTAL_W = 1500;
            const SPLIT_X = 1000; // Body gets 1000px width

            const canvas = document.createElement('canvas');
            canvas.width = TOTAL_W;
            canvas.height = SHEET_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(bodyBase64);

            // Background
            ctx.fillStyle = '#101010';
            ctx.fillRect(0, 0, TOTAL_W, SHEET_H);

            // Draw Body (Main)
            const bodyScale = Math.min((SPLIT_X - 20) / bodyImg.width, (SHEET_H - 20) / bodyImg.height);
            const bW = bodyImg.width * bodyScale;
            const bH = bodyImg.height * bodyScale;
            const bX = (SPLIT_X - bW) / 2;
            const bY = (SHEET_H - bH) / 2;
            
            ctx.drawImage(bodyImg, bX, bY, bW, bH);
            drawLabel(ctx, "MAIN_BODY", 20, 40, '#00FF00');

            // Draw Face (Side Panel)
            const fW_Zone = TOTAL_W - SPLIT_X;
            const fH_Zone = SHEET_H / 2; // Face takes top half of side panel
            
            const fScale = Math.min((fW_Zone - 20) / faceImg.width, (fH_Zone - 20) / faceImg.height);
            const fW = faceImg.width * fScale;
            const fH = faceImg.height * fScale;
            const fX = SPLIT_X + (fW_Zone - fW) / 2;
            const fY = (fH_Zone - fH) / 2;

            ctx.strokeStyle = '#FFFFFF';
            ctx.strokeRect(SPLIT_X, 0, fW_Zone, fH_Zone);
            ctx.drawImage(faceImg, fX, fY, fW, fH);
            
            drawLabel(ctx, "TARGET_FACE", SPLIT_X + 10, 30, '#00FF00');
            
            // Visual Anchor Line
            ctx.beginPath();
            ctx.moveTo(fX, fY + fH/2);
            ctx.lineTo(bX + bW/2, bY + bH*0.1); // Connect to approx head position
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 10]);
            ctx.stroke();

            resolve(canvas.toDataURL('image/jpeg', 0.95));

        } catch (e) {
            console.error("Sheet Gen Error", e);
            resolve(bodyBase64);
        }
    });
  };

  function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
      ctx.font = 'bold 24px Arial';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
  }
