
/**
 * CORE SOLUTION: "Structural Image Conditioning" & "Identity Texture Sheets"
 * Giúp Flash 2.5 phân biệt rõ đâu là Cấu trúc (Pose), đâu là Giao diện (Skin/Clothes)
 */

export const urlToBase64 = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Reader error"));
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error converting URL to Base64:", error);
        return null;
    }
};

// Helper: Load Image with Timeout
const loadImageWithTimeout = (src: string, timeoutMs = 5000): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        const timer = setTimeout(() => reject(new Error("Image load timeout")), timeoutMs);
        
        img.onload = () => {
            clearTimeout(timer);
            resolve(img);
        };
        img.onerror = () => {
            clearTimeout(timer);
            reject(new Error("Image load error"));
        };
        
        let safeSrc = src;
        if (src && !src.startsWith('data:') && !src.startsWith('http')) {
             safeSrc = `data:image/jpeg;base64,${src}`;
        }
        img.src = safeSrc;
    });
};

// Chế độ Solid Fence: Xử lý ảnh Pose để AI không copy y nguyên pixel
export const createSolidFence = async (base64Str: string, targetAspectRatio: string = "1:1", isPoseRef: boolean = false): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(base64Str);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return base64Str;
  
        // Standardize dimensions
        let canvasW = 1024;
        let canvasH = 1024;

        if (targetAspectRatio === '9:16') { canvasW = 768; canvasH = 1344; }
        else if (targetAspectRatio === '16:9') { canvasW = 1344; canvasH = 768; }
        else if (targetAspectRatio === '3:4') { canvasW = 896; canvasH = 1152; }
        else if (targetAspectRatio === '4:3') { canvasW = 1152; canvasH = 896; }
        
        canvas.width = canvasW;
        canvas.height = canvasH;
  
        ctx.fillStyle = '#202020'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
  
        const scale = Math.min(canvasW / img.width, canvasH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = (canvasW - drawW) / 2;
        const y = (canvasH - drawH) / 2;
        
        ctx.drawImage(img, x, y, drawW, drawH);
        
        if (isPoseRef) {
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 5; 
            ctx.strokeRect(x, y, drawW, drawH); 
            
            ctx.font = "bold 30px Arial";
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
            ctx.fillText("POSE_REFERENCE_ONLY", x + 10, y + 40);
        }
  
        return canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
        console.warn("Solid Fence Gen Failed:", e);
        return base64Str;
    }
};
  
export const optimizePayload = async (base64Str: string, maxWidth = 1024): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(base64Str);
        
        if (img.width <= maxWidth && img.height <= maxWidth) {
            return base64Str;
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
        return canvas.toDataURL('image/jpeg', 0.9); 
    } catch (e) {
        return base64Str;
    }
}

// --- TEXTURE SHEET GENERATOR ---
export const createTextureSheet = async (
    bodyBase64: string, 
    faceBase64?: string | null,
    _shoesBase64?: string | null 
): Promise<string> => {
    try {
        const bodyImg = await loadImageWithTimeout(bodyBase64);
        
        if (!faceBase64) {
            const optimizedBody = await optimizePayload(bodyBase64, 1280);
            return optimizedBody;
        }

        const faceImg = await loadImageWithTimeout(faceBase64);

        const SHEET_H = 1280;
        const TOTAL_W = 1280;
        const SPLIT_X = Math.floor(TOTAL_W * 0.65); 

        const canvas = document.createElement('canvas');
        canvas.width = TOTAL_W;
        canvas.height = SHEET_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return bodyBase64;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, TOTAL_W, SHEET_H);

        const bodyScale = Math.min((SPLIT_X - 40) / bodyImg.width, (SHEET_H - 100) / bodyImg.height);
        const bW = bodyImg.width * bodyScale;
        const bH = bodyImg.height * bodyScale;
        const bX = (SPLIT_X - bW) / 2;
        const bY = (SHEET_H - bH) / 2 + 30;
        
        ctx.drawImage(bodyImg, bX, bY, bW, bH);
        
        ctx.fillStyle = '#00FF00'; 
        ctx.font = 'bold 30px monospace';
        ctx.fillText("SOURCE_OUTFIT_BODY", 20, 40);

        const fW_Zone = TOTAL_W - SPLIT_X;
        const fH_Zone = SHEET_H / 2; 
        
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(SPLIT_X, 0);
        ctx.lineTo(SPLIT_X, SHEET_H);
        ctx.stroke();

        const fScale = Math.min((fW_Zone - 20) / faceImg.width, (fH_Zone - 20) / faceImg.height);
        const fW = faceImg.width * fScale;
        const fH = faceImg.height * fScale;
        const fX = SPLIT_X + (fW_Zone - fW) / 2;
        const fY = (fH_Zone - fH) / 2;

        ctx.drawImage(faceImg, fX, fY, fW, fH);
        
        ctx.fillStyle = '#00FF00';
        ctx.fillText("SOURCE_FACE", SPLIT_X + 20, 40);
        
        return canvas.toDataURL('image/jpeg', 0.90);

    } catch (e) {
        console.error("Sheet Gen Error", e);
        return bodyBase64;
    }
};
