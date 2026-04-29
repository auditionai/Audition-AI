
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
export const loadImageWithTimeout = (src: string, timeoutMs = 5000): Promise<HTMLImageElement> => {
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
const getReferenceCanvasSize = (targetAspectRatio: string = '1:1') => {
    if (targetAspectRatio === '9:16') return { width: 768, height: 1344 };
    if (targetAspectRatio === '16:9') return { width: 1344, height: 768 };
    if (targetAspectRatio === '3:4') return { width: 896, height: 1152 };
    if (targetAspectRatio === '4:3') return { width: 1152, height: 896 };
    return { width: 1024, height: 1024 };
};

const drawContainedImage = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    canvasWidth: number,
    canvasHeight: number,
) => {
    const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (canvasWidth - drawW) / 2;
    const y = (canvasHeight - drawH) / 2;
    ctx.drawImage(img, x, y, drawW, drawH);
    return { x, y, drawW, drawH };
};

const drawCoverCrop = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
) => {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
};

const getFaceLockCrop = (img: HTMLImageElement) => {
    const cropWidth = img.width * 0.58;
    const cropHeight = img.height * 0.48;
    const sx = Math.max(0, (img.width - cropWidth) / 2);
    const sy = Math.max(0, img.height * 0.04);

    return {
        sx,
        sy,
        sw: Math.min(img.width - sx, cropWidth),
        sh: Math.min(img.height - sy, cropHeight),
    };
};

export const createPoseOnlyReference = async (
    source: string,
    targetAspectRatio: string = '1:1',
): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(source, 10000);
        const { width: canvasW, height: canvasH } = getReferenceCanvasSize(targetAspectRatio);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return source;

        canvas.width = canvasW;
        canvas.height = canvasH;

        ctx.fillStyle = '#181818';
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.save();
        ctx.filter = 'grayscale(1) saturate(0) contrast(1.05) brightness(0.96) blur(1.6px)';
        const { x, y, drawW, drawH } = drawContainedImage(ctx, img, canvasW, canvasH);
        ctx.restore();

        // Blur the upper band harder to suppress sample-face identity while keeping pose and framing.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, drawW, drawH * 0.42);
        ctx.clip();
        ctx.filter = 'grayscale(1) saturate(0) contrast(1.02) brightness(0.93) blur(7px)';
        drawContainedImage(ctx, img, canvasW, canvasH);
        ctx.restore();

        ctx.fillStyle = 'rgba(10, 10, 10, 0.14)';
        ctx.fillRect(x, y, drawW, drawH);

        return canvas.toDataURL('image/jpeg', 0.92);
    } catch (error) {
        console.warn('Pose-only reference generation failed:', error);
        return source;
    }
};

export const createFaceLockReference = async (source: string): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(source, 10000);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return source;

        const size = 1024;
        const padding = 28;
        const { sx, sy, sw, sh } = getFaceLockCrop(img);

        canvas.width = size;
        canvas.height = size;

        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, size, size);

        ctx.save();
        ctx.filter = 'blur(18px) brightness(0.72)';
        drawCoverCrop(ctx, img, sx, sy, sw, sh, 0, 0, size, size);
        ctx.restore();

        ctx.save();
        ctx.filter = 'contrast(1.08) saturate(1.03)';
        drawCoverCrop(
            ctx,
            img,
            sx,
            sy,
            sw,
            sh,
            padding,
            padding,
            size - padding * 2,
            size - padding * 2,
        );
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        ctx.strokeRect(padding, padding, size - padding * 2, size - padding * 2);

        return canvas.toDataURL('image/jpeg', 0.94);
    } catch (error) {
        console.warn('Face-lock reference generation failed:', error);
        return source;
    }
};

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

        if (isPoseRef) {
            // Convert the sample into a composition guide instead of a copyable identity source.
            ctx.save();
            ctx.filter = 'grayscale(1) saturate(0) contrast(1.12) brightness(0.92) blur(1.5px)';
            ctx.drawImage(img, x, y, drawW, drawH);
            ctx.restore();

            ctx.fillStyle = 'rgba(12, 18, 20, 0.28)';
            ctx.fillRect(x, y, drawW, drawH);

            ctx.save();
            ctx.strokeStyle = 'rgba(0, 255, 170, 0.9)';
            ctx.lineWidth = 4;
            ctx.setLineDash([18, 10]);
            ctx.strokeRect(x, y, drawW, drawH);

            ctx.setLineDash([10, 14]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0, 255, 170, 0.28)';
            ctx.beginPath();
            ctx.moveTo(x + drawW / 3, y);
            ctx.lineTo(x + drawW / 3, y + drawH);
            ctx.moveTo(x + (drawW * 2) / 3, y);
            ctx.lineTo(x + (drawW * 2) / 3, y + drawH);
            ctx.moveTo(x, y + drawH / 3);
            ctx.lineTo(x + drawW, y + drawH / 3);
            ctx.moveTo(x, y + (drawH * 2) / 3);
            ctx.lineTo(x + drawW, y + (drawH * 2) / 3);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 255, 170, 0.45)';
            const corner = Math.max(28, Math.min(drawW, drawH) * 0.08);
            ctx.beginPath();
            ctx.moveTo(x, y + corner);
            ctx.lineTo(x, y);
            ctx.lineTo(x + corner, y);
            ctx.moveTo(x + drawW - corner, y);
            ctx.lineTo(x + drawW, y);
            ctx.lineTo(x + drawW, y + corner);
            ctx.moveTo(x, y + drawH - corner);
            ctx.lineTo(x, y + drawH);
            ctx.lineTo(x + corner, y + drawH);
            ctx.moveTo(x + drawW - corner, y + drawH);
            ctx.lineTo(x + drawW, y + drawH);
            ctx.lineTo(x + drawW, y + drawH - corner);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.drawImage(img, x, y, drawW, drawH);
        }
  
        return canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
        console.warn("Solid Fence Gen Failed:", e);
        return base64Str;
    }
};
  
export const getClosestAspectRatio = async (base64Str: string): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(base64Str);
        const ratio = img.width / img.height;
        
        const supportedRatios = [
            { str: "1:1", val: 1 },
            { str: "4:3", val: 4/3 },
            { str: "3:4", val: 3/4 },
            { str: "16:9", val: 16/9 },
            { str: "9:16", val: 9/16 },
            { str: "4:1", val: 4/1 },
            { str: "1:4", val: 1/4 },
            { str: "8:1", val: 8/1 },
            { str: "1:8", val: 1/8 }
        ];
        
        let closest = supportedRatios[0];
        let minDiff = Math.abs(ratio - closest.val);
        
        for (let i = 1; i < supportedRatios.length; i++) {
            const diff = Math.abs(ratio - supportedRatios[i].val);
            if (diff < minDiff) {
                minDiff = diff;
                closest = supportedRatios[i];
            }
        }
        
        return closest.str;
    } catch (e) {
        console.warn("Failed to calculate aspect ratio, defaulting to 1:1", e);
        return "1:1";
    }
};

export const calculateAspectRatioString = (width: number, height: number): string => {
    const ratio = width / height;
    if (ratio >= 1.7) return "16:9";
    if (ratio >= 1.3) return "4:3";
    if (ratio >= 0.9 && ratio <= 1.1) return "1:1";
    if (ratio <= 0.6) return "9:16";
    if (ratio <= 0.8) return "3:4";
    return "1:1"; // default
}

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

export const createStyleOnlyReference = async (source: string): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(source, 10000);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return source;

        const canvasSize = 1024;
        const padding = 28;
        const gap = 20;
        const cellSize = Math.floor((canvasSize - padding * 2 - gap) / 2);

        canvas.width = canvasSize;
        canvas.height = canvasSize;

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        const cropSpecs = [
            { sx: 0.02, sy: 0.02, sw: 0.46, sh: 0.46 },
            { sx: 0.52, sy: 0.02, sw: 0.46, sh: 0.46 },
            { sx: 0.08, sy: 0.28, sw: 0.34, sh: 0.50 },
            { sx: 0.58, sy: 0.28, sw: 0.34, sh: 0.50 },
        ];

        cropSpecs.forEach((crop, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const dx = padding + col * (cellSize + gap);
            const dy = padding + row * (cellSize + gap);

            const sx = Math.max(0, Math.floor(img.width * crop.sx));
            const sy = Math.max(0, Math.floor(img.height * crop.sy));
            const sw = Math.max(1, Math.floor(img.width * crop.sw));
            const sh = Math.max(1, Math.floor(img.height * crop.sh));

            ctx.save();
            ctx.fillStyle = '#111111';
            ctx.fillRect(dx, dy, cellSize, cellSize);
            ctx.filter = 'saturate(1.08) contrast(1.04)';
            ctx.drawImage(img, sx, sy, sw, sh, dx, dy, cellSize, cellSize);
            ctx.restore();

            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 2;
            ctx.strokeRect(dx, dy, cellSize, cellSize);
        });

        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, 0, canvasSize, 64);
        ctx.fillRect(0, canvasSize - 64, canvasSize, 64);

        return canvas.toDataURL('image/jpeg', 0.9);
    } catch (error) {
        console.warn('Style-only reference generation failed:', error);
        return source;
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
