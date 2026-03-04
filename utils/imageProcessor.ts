
import { removeBackground } from '@imgly/background-removal';

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

export const removeBackgroundAndAddBlack = async (base64Str: string, onProgress?: (msg: string) => void): Promise<string> => {
    try {
        if (onProgress) onProgress("Đang phân tích và tách nền nhân vật...");
        
        // Convert base64 to Blob
        const response = await fetch(base64Str);
        const blob = await response.blob();
        
        // Remove background using imgly
        const imageBlob = await removeBackground(blob, {
            progress: (key, current, total) => {
                if (onProgress && total > 0) {
                    const percent = Math.round((current / total) * 100);
                    onProgress(`Đang tải mô hình AI tách nền... ${percent}%`);
                }
            }
        });
        
        if (onProgress) onProgress("Đang xử lý nền đen tiêu chuẩn...");

        // Convert transparent blob to base64
        const transparentBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob);
        });

        // Draw on black canvas
        const img = await loadImageWithTimeout(transparentBase64);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return base64Str;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        return canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
        console.error("Background removal failed:", e);
        return base64Str; // Fallback to original if failed
    }
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
  
export const optimizePayload = async (base64Str: string, maxWidth = 768): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(base64Str);
        
        // Always re-encode to ensure it's a compressed JPEG
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
        return canvas.toDataURL('image/jpeg', 0.85); 
    } catch (e) {
        return base64Str;
    }
}

// --- MASTER REFERENCE SHEET GENERATOR ---
export const createMasterReferenceSheet = async (
    styleBase64: string | null,
    poseBase64: string | null,
    charBase64s: string[]
): Promise<string | null> => {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Calculate dimensions
        const sectionWidth = 512;
        const sectionHeight = 512;
        
        let totalSections = charBase64s.length;
        if (styleBase64) totalSections++;
        if (poseBase64) totalSections++;
        
        if (totalSections === 0) return null;

        canvas.width = sectionWidth * totalSections;
        canvas.height = sectionHeight;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let currentX = 0;

        const drawSection = async (base64: string, label: string) => {
            const img = await loadImageWithTimeout(base64);
            const scale = Math.min(sectionWidth / img.width, sectionHeight / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = currentX + (sectionWidth - w) / 2;
            const y = (sectionHeight - h) / 2;
            
            ctx.drawImage(img, x, y, w, h);
            
            // Draw label
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(currentX, 0, sectionWidth, 40);
            ctx.fillStyle = '#00FF00';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(label, currentX + 10, 30);
            
            // Draw border
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 2;
            ctx.strokeRect(currentX, 0, sectionWidth, sectionHeight);
            
            currentX += sectionWidth;
        };

        if (styleBase64) await drawSection(styleBase64, "STYLE REFERENCE");
        if (poseBase64) await drawSection(poseBase64, "POSE REFERENCE");
        for (let i = 0; i < charBase64s.length; i++) {
            await drawSection(charBase64s[i], `CHARACTER ${i + 1} REFERENCE`);
        }

        return canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
        console.error("Master Sheet Gen Error", e);
        return null;
    }
};

// --- TEXTURE SHEET GENERATOR ---
export const createTextureSheet = async (
    bodyBase64: string, 
    faceBase64?: string | null,
    _shoesBase64?: string | null 
): Promise<string> => {
    try {
        const bodyImg = await loadImageWithTimeout(bodyBase64);
        
        if (!faceBase64) {
            const optimizedBody = await optimizePayload(bodyBase64, 2048);
            return optimizedBody;
        }

        const faceImg = await loadImageWithTimeout(faceBase64);

        const SHEET_H = 2048;
        const TOTAL_W = 2048;
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
