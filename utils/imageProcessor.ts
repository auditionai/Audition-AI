
/**
 * CORE SOLUTION: "Structural Image Conditioning" & "Identity Texture Sheets"
 * Giúp Flash 2.5/Pro 3.0 phân biệt rõ đâu là Cấu trúc (Pose/BG), đâu là Giao diện (Skin/Clothes)
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

// Chế độ Solid Fence: Chuẩn hóa ảnh Pose/Background để AI dễ hiểu bố cục
// Quan trọng: Giữ nguyên Pixel ảnh gốc để AI có thể copy background và ánh sáng
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
  
        // Standardize dimensions based on Aspect Ratio
        let canvasW = 1024;
        let canvasH = 1024;

        if (targetAspectRatio === '9:16') { canvasW = 768; canvasH = 1344; }
        else if (targetAspectRatio === '16:9') { canvasW = 1344; canvasH = 768; }
        else if (targetAspectRatio === '3:4') { canvasW = 896; canvasH = 1152; } 
        else if (targetAspectRatio === '4:3') { canvasW = 1152; canvasH = 896; }
        
        canvas.width = canvasW;
        canvas.height = canvasH;
  
        // 1. Fill Background (Neutral Grey) - Padding color
        ctx.fillStyle = '#202020'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
  
        // 2. Draw Image (Contain Mode - Giữ nguyên toàn bộ chi tiết ảnh gốc)
        const scale = Math.min(canvasW / img.width, canvasH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = (canvasW - drawW) / 2;
        const y = (canvasH - drawH) / 2;
        
        ctx.drawImage(img, x, y, drawW, drawH);
        
        // 3. Structure Guide Overlay (Optional)
        // Vẽ khung viền để đánh dấu vùng không gian, nhưng KHÔNG che lấp ảnh
        if (isPoseRef) {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)'; // Mờ để không làm hỏng ảnh
            ctx.lineWidth = 2; 
            ctx.strokeRect(x, y, drawW, drawH); 
            
            // Marker nhỏ ở góc để AI nhận biết đây là Reference Frame
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(0, 0, 20, 20);
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

  // --- NEW INTELLIGENCE: TEXTURE SHEET GENERATOR ---
  // Ghép Body + Face vào một ảnh duy nhất trên nền đen
  // Ép buộc AI coi đây là "Texture Map" cần ốp lên model 3D
  export const createTextureSheet = async (
      bodyBase64: string, 
      faceBase64?: string | null,
      _shoesBase64?: string | null 
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
            
            // Nếu không có Face, chỉ tối ưu ảnh Body nhưng vẫn đặt trên nền đen để nhất quán logic
            if (!faceBase64) {
                const canvas = document.createElement('canvas');
                canvas.width = 1024;
                canvas.height = 1024;
                const ctx = canvas.getContext('2d');
                if(ctx) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0,0,1024,1024);
                    
                    const scale = Math.min(1000/bodyImg.width, 1000/bodyImg.height);
                    const w = bodyImg.width * scale;
                    const h = bodyImg.height * scale;
                    ctx.drawImage(bodyImg, (1024-w)/2, (1024-h)/2, w, h);
                    
                    // Metadata Label
                    ctx.fillStyle = '#00FF00';
                    ctx.font = 'bold 20px monospace';
                    ctx.fillText("TARGET_CHARACTER_APPEARANCE", 20, 30);
                    
                    return resolve(canvas.toDataURL('image/jpeg', 0.90));
                }
                return resolve(bodyBase64);
            }

            const faceImg = await loadImg(faceBase64);

            // Tạo layout: Trái (Body 60%) | Phải (Face 40%) - Tách biệt rõ ràng
            const SHEET_W = 1280;
            const SHEET_H = 1024;
            const SPLIT_X = Math.floor(SHEET_W * 0.60); 

            const canvas = document.createElement('canvas');
            canvas.width = SHEET_W;
            canvas.height = SHEET_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(bodyBase64);

            // 1. Nền Đen Tuyệt Đối (Tách biệt ngữ cảnh)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, SHEET_W, SHEET_H);

            // 2. Draw Body (Main Identity) - Left Side
            // Scale để fit vào vùng bên trái
            const bodyScale = Math.min((SPLIT_X - 40) / bodyImg.width, (SHEET_H - 100) / bodyImg.height);
            const bW = bodyImg.width * bodyScale;
            const bH = bodyImg.height * bodyScale;
            const bX = (SPLIT_X - bW) / 2;
            const bY = (SHEET_H - bH) / 2 + 40;
            
            ctx.drawImage(bodyImg, bX, bY, bW, bH);
            
            // Label cho AI đọc
            ctx.fillStyle = '#00FF00'; // Green Text
            ctx.font = 'bold 24px monospace';
            ctx.fillText("SOURCE_FULLBODY_OUTFIT", 20, 40);

            // 3. Draw Face (Detail Reference) - Right Side
            const fW_Zone = SHEET_W - SPLIT_X;
            const fH_Zone = SHEET_H; 
            
            // Vẽ vạch ngăn cách
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(SPLIT_X, 0);
            ctx.lineTo(SPLIT_X, SHEET_H);
            ctx.stroke();

            const fScale = Math.min((fW_Zone - 40) / faceImg.width, (fH_Zone - 100) / faceImg.height);
            const fW = faceImg.width * fScale;
            const fH = faceImg.height * fScale;
            const fX = SPLIT_X + (fW_Zone - fW) / 2;
            const fY = (fH_Zone - fH) / 2 + 40;

            ctx.drawImage(faceImg, fX, fY, fW, fH);
            
            ctx.fillStyle = '#00FF00';
            ctx.fillText("SOURCE_FACE_DETAIL", SPLIT_X + 20, 40);
            
            resolve(canvas.toDataURL('image/jpeg', 0.90));

        } catch (e) {
            console.error("Sheet Gen Error", e);
            resolve(bodyBase64);
        }
    });
  };
