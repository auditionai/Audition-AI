
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

  // --- UPGRADED: VISUAL ANCHORING SHEET GENERATOR (PROTOCOL V6) ---
  // Draws lines connecting parts and adds explicit text labels for the AI
  export const createTextureSheet = async (
      bodyBase64: string, 
      faceBase64?: string | null, 
      shoesBase64?: string | null
  ): Promise<string> => { // Returns Base64 string
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
            
            // SUPER HIGH RES CANVAS (For Cloud Upload)
            const SHEET_H = 1600; 
            const BODY_W = 1000; 
            const DETAIL_W = 600;
            const TOTAL_W = BODY_W + DETAIL_W;

            const canvas = document.createElement('canvas');
            canvas.width = TOTAL_W;
            canvas.height = SHEET_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(bodyBase64);

            // 1. Background (Dark Grey to make neon pop)
            ctx.fillStyle = '#202020';
            ctx.fillRect(0, 0, TOTAL_W, SHEET_H);

            // 2. Draw Body (Left Panel)
            const bodyScale = Math.min((BODY_W - 40) / bodyImg.width, (SHEET_H - 40) / bodyImg.height);
            const bW = bodyImg.width * bodyScale;
            const bH = bodyImg.height * bodyScale;
            const bX = (BODY_W - bW) / 2;
            const bY = (SHEET_H - bH) / 2;
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(bX - 5, bY - 5, bW + 10, bH + 10); // White frame
            ctx.drawImage(bodyImg, bX, bY, bW, bH);
            
            // Label Body
            drawLabel(ctx, "REFERENCE_BODY", 20, 40, '#00FF00');

            // 3. Draw Face (Top Right)
            const FACE_H = SHEET_H / 2;
            let faceCenterY = FACE_H / 2;
            
            if (faceBase64) {
                try {
                    const faceImg = await loadImg(faceBase64);
                    const fScale = Math.min((DETAIL_W - 40) / faceImg.width, (FACE_H - 40) / faceImg.height);
                    const fW = faceImg.width * fScale;
                    const fH = faceImg.height * fScale;
                    const fX = BODY_W + 20 + (DETAIL_W - 40 - fW) / 2;
                    const fY = (FACE_H - fH) / 2;
                    
                    faceCenterY = fY + fH/2;

                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(fX - 5, fY - 5, fW + 10, fH + 10);
                    ctx.drawImage(faceImg, fX, fY, fW, fH);
                    
                    // Visual Anchor: Line from Face Detail to Body Head (Approx top 15%)
                    drawConnectionLine(ctx, fX, fY + fH/2, bX + bW/2, bY + bH*0.1, '#00FF00'); // Green Line
                    drawLabel(ctx, "MANDATORY_FACE", fX, fY - 15, '#00FF00');
                } catch (e) {}
            } else {
                // Draw Placeholder
                ctx.fillStyle = '#333';
                ctx.fillRect(BODY_W + 20, 20, DETAIL_W - 40, FACE_H - 40);
                drawLabel(ctx, "NO_FACE_DATA", BODY_W + 40, FACE_H/2, '#777');
            }

            // 4. Draw Shoes (Bottom Right)
            const SHOES_Y = FACE_H;
            const SHOES_H = SHEET_H / 2;
            
            if (shoesBase64) {
                try {
                    const shoesImg = await loadImg(shoesBase64);
                    const sScale = Math.min((DETAIL_W - 40) / shoesImg.width, (SHOES_H - 40) / shoesImg.height);
                    const sW = shoesImg.width * sScale;
                    const sH = shoesImg.height * sScale;
                    const sX = BODY_W + 20 + (DETAIL_W - 40 - sW) / 2;
                    const sY = SHOES_Y + (SHOES_H - sH) / 2;
                    
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(sX - 5, sY - 5, sW + 10, sH + 10);
                    ctx.drawImage(shoesImg, sX, sY, sW, sH);
                    
                    // Visual Anchor: Line from Shoes Detail to Body Feet (Approx bottom 5%)
                    drawConnectionLine(ctx, sX, sY + sH/2, bX + bW/2, bY + bH*0.95, '#FF0099'); // Pink Line
                    drawLabel(ctx, "MANDATORY_SHOES", sX, sY - 15, '#FF0099');
                } catch (e) {}
            } else {
                ctx.fillStyle = '#333';
                ctx.fillRect(BODY_W + 20, SHOES_Y + 20, DETAIL_W - 40, SHOES_H - 40);
                drawLabel(ctx, "NO_SHOE_DATA", BODY_W + 40, SHOES_Y + SHOES_H/2, '#777');
            }

            resolve(canvas.toDataURL('image/jpeg', 0.95));

        } catch (e) {
            console.error("Sheet Gen Error", e);
            resolve(bodyBase64);
        }
    });
  };

  function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
      ctx.font = 'bold 30px Courier New';
      ctx.fillStyle = color;
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 4;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
  }

  function drawConnectionLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.setLineDash([15, 15]); // Dashed line
      ctx.stroke();
      ctx.setLineDash([]); // Reset
      
      // Draw Dot at end
      ctx.beginPath();
      ctx.arc(x2, y2, 10, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
  }
