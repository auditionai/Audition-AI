
/**
 * CORE SOLUTION: "Structural Image Conditioning" & "Identity Texture Sheets"
 * Giúp Flash 2.5 phân biệt rõ đâu là Cấu trúc (Pose), đâu là Giao diện (Skin/Clothes)
 */

import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

const MEDIAPIPE_VISION_WASM_ROOT = '/mediapipe/wasm';
const MEDIAPIPE_POSE_MODEL_PATH = '/mediapipe/models/pose_landmarker_lite.task';
const POSE_VISIBILITY_THRESHOLD = 0.3;

type PoseOverlayDetection = {
    landmarks: NormalizedLandmark[];
    segmentationMask?: {
        data: Float32Array;
        width: number;
        height: number;
    };
};

let poseLandmarkerPromise: Promise<PoseLandmarker | null> | null = null;

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type FaceBoundingBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const normalizeFaceBoundingBox = (value: any): FaceBoundingBox | null => {
    const x = Number(value?.x);
    const y = Number(value?.y);
    const width = Number(value?.width);
    const height = Number(value?.height);

    if (![x, y, width, height].every((entry) => Number.isFinite(entry))) {
        return null;
    }

    if (width <= 0 || height <= 0) {
        return null;
    }

    return { x, y, width, height };
};

const detectCandidateFaceBoxes = async (img: HTMLImageElement): Promise<FaceBoundingBox[]> => {
    try {
        const FaceDetectorCtor = (globalThis as any)?.FaceDetector;
        if (!FaceDetectorCtor) {
            return [];
        }

        const detector = new FaceDetectorCtor({
            fastMode: true,
            maxDetectedFaces: 5,
        });
        const detections = await detector.detect(img);
        if (!Array.isArray(detections)) {
            return [];
        }

        return detections
            .map((detection) => normalizeFaceBoundingBox(detection?.boundingBox))
            .filter((box): box is FaceBoundingBox => Boolean(box));
    } catch (error) {
        console.warn('Face detection for face-lock reference failed:', error);
        return [];
    }
};

const scoreCandidateFaceBox = (box: FaceBoundingBox, imageWidth: number, imageHeight: number) => {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const areaRatio = (box.width * box.height) / (imageWidth * imageHeight);
    const heightRatio = box.height / imageHeight;
    const normalizedCenterDistance = Math.hypot(
        (centerX - imageWidth / 2) / imageWidth,
        (centerY - imageHeight / 2) / imageHeight,
    );

    const centerScore = clamp(1.1 - normalizedCenterDistance * 2.1, 0, 1.1);
    const sizeScore = clamp(areaRatio * 10.5, 0, 1.15);
    const lowerHalfBonus = clamp((centerY / imageHeight - 0.28) * 0.7, 0, 0.38);
    const oversizePenalty = heightRatio > 0.34 ? (heightRatio - 0.34) * 3.2 : 0;

    return centerScore + sizeScore + lowerHalfBonus - oversizePenalty;
};

const buildCropFromFaceBox = (box: FaceBoundingBox, imageWidth: number, imageHeight: number) => {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height * 0.9;
    const cropWidth = clamp(box.width * 2.6, imageWidth * 0.34, imageWidth * 0.74);
    const cropHeight = clamp(box.height * 3.3, imageHeight * 0.34, imageHeight * 0.82);
    const sx = clamp(centerX - cropWidth / 2, 0, Math.max(0, imageWidth - cropWidth));
    const sy = clamp(centerY - cropHeight / 2, 0, Math.max(0, imageHeight - cropHeight));

    return {
        sx,
        sy,
        sw: Math.min(imageWidth - sx, cropWidth),
        sh: Math.min(imageHeight - sy, cropHeight),
    };
};

const buildDetailCropFromFaceBox = (box: FaceBoundingBox, imageWidth: number, imageHeight: number) => {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height * 0.72;
    const cropWidth = clamp(box.width * 1.95, imageWidth * 0.22, imageWidth * 0.5);
    const cropHeight = clamp(box.height * 2.2, imageHeight * 0.22, imageHeight * 0.56);
    const sx = clamp(centerX - cropWidth / 2, 0, Math.max(0, imageWidth - cropWidth));
    const sy = clamp(centerY - cropHeight / 2, 0, Math.max(0, imageHeight - cropHeight));

    return {
        sx,
        sy,
        sw: Math.min(imageWidth - sx, cropWidth),
        sh: Math.min(imageHeight - sy, cropHeight),
    };
};

const rgbToHex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;

const describeSkinTone = (r: number, g: number, b: number) => {
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    const warmth = r - b;

    if (brightness >= 0.82) {
        return warmth >= 18 ? 'very fair warm skin' : 'very fair neutral skin';
    }
    if (brightness >= 0.72) {
        return warmth >= 18 ? 'fair warm skin' : 'fair neutral skin';
    }
    if (brightness >= 0.58) {
        return warmth >= 16 ? 'light medium warm skin' : 'light medium neutral skin';
    }
    if (brightness >= 0.44) {
        return warmth >= 14 ? 'medium warm skin' : 'medium neutral skin';
    }

    return warmth >= 12 ? 'deep warm skin' : 'deep neutral skin';
};

const isLikelySkinPixel = (r: number, g: number, b: number) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const brightness = (r + g + b) / 3;

    if (brightness < 45 || brightness > 245) {
        return false;
    }

    if (diff < 8) {
        return false;
    }

    if (r < 40 || g < 25 || b < 20) {
        return false;
    }

    if (r < g * 0.92) {
        return false;
    }

    if (g < b * 0.78) {
        return false;
    }

    return true;
};

const sampleSkinToneFromRegion = (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
) => {
    try {
        const imageData = ctx.getImageData(
            Math.max(0, Math.floor(sx)),
            Math.max(0, Math.floor(sy)),
            Math.max(1, Math.floor(sw)),
            Math.max(1, Math.floor(sh)),
        );
        const { data, width, height } = imageData;
        let count = 0;
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;

        for (let y = 0; y < height; y += 3) {
            for (let x = 0; x < width; x += 3) {
                const idx = (y * width + x) * 4;
                const alpha = data[idx + 3];
                if (alpha < 200) continue;

                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                if (!isLikelySkinPixel(r, g, b)) continue;

                totalR += r;
                totalG += g;
                totalB += b;
                count += 1;
            }
        }

        if (count < 24) {
            return null;
        }

        const avgR = totalR / count;
        const avgG = totalG / count;
        const avgB = totalB / count;
        return {
            hex: rgbToHex(avgR, avgG, avgB),
            descriptor: describeSkinTone(avgR, avgG, avgB),
        };
    } catch (error) {
        console.warn('Skin tone sampling failed:', error);
        return null;
    }
};

export const analyzeCharacterAppearanceProfile = async (source: string): Promise<{ skinToneHex?: string; skinToneDescriptor?: string }> => {
    try {
        const img = await loadImageWithTimeout(source, 10000);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return {};

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);

        const detectedFaces = await detectCandidateFaceBoxes(img);
        const bestFace = detectedFaces.length > 0
            ? [...detectedFaces].sort(
                (a, b) => scoreCandidateFaceBox(b, img.width, img.height) - scoreCandidateFaceBox(a, img.width, img.height),
            )[0]
            : null;

        const regions = bestFace
            ? [
                buildCropFromFaceBox(bestFace, img.width, img.height),
                {
                    sx: clamp(bestFace.x + bestFace.width * 0.18, 0, img.width),
                    sy: clamp(bestFace.y + bestFace.height * 0.24, 0, img.height),
                    sw: clamp(bestFace.width * 0.64, 1, img.width),
                    sh: clamp(bestFace.height * 0.58, 1, img.height),
                },
              ]
            : [
                {
                    sx: img.width * 0.28,
                    sy: img.height * 0.14,
                    sw: img.width * 0.44,
                    sh: img.height * 0.46,
                },
              ];

        for (const region of regions) {
            const sampled = sampleSkinToneFromRegion(ctx, region.sx, region.sy, region.sw, region.sh);
            if (sampled) {
                return {
                    skinToneHex: sampled.hex,
                    skinToneDescriptor: sampled.descriptor,
                };
            }
        }

        return {};
    } catch (error) {
        console.warn('Character appearance profile analysis failed:', error);
        return {};
    }
};

const getPoseLandmarker = async (): Promise<PoseLandmarker | null> => {
    if (typeof window === 'undefined') {
        return null;
    }

    if (!poseLandmarkerPromise) {
        poseLandmarkerPromise = (async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_WASM_ROOT);
                return await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: MEDIAPIPE_POSE_MODEL_PATH,
                    },
                    runningMode: 'IMAGE',
                    numPoses: 1,
                    outputSegmentationMasks: true,
                    minPoseDetectionConfidence: 0.45,
                    minPosePresenceConfidence: 0.45,
                    minTrackingConfidence: 0.45,
                });
            } catch (error) {
                console.warn('Pose landmarker initialization failed:', error);
                return null;
            }
        })();
    }

    return poseLandmarkerPromise;
};

const detectPoseOverlay = async (img: HTMLImageElement): Promise<PoseOverlayDetection | null> => {
    try {
        const poseLandmarker = await getPoseLandmarker();
        if (!poseLandmarker) return null;

        const result = poseLandmarker.detect(img);
        const landmarks = Array.isArray(result.landmarks?.[0]) ? result.landmarks[0] : null;
        if (!landmarks || landmarks.length === 0) {
            result.close();
            return null;
        }

        const segmentation = result.segmentationMasks?.[0];
        const segmentationMask = segmentation
            ? {
                data: segmentation.getAsFloat32Array(),
                width: segmentation.width,
                height: segmentation.height,
            }
            : undefined;
        result.close();

        return {
            landmarks,
            segmentationMask,
        };
    } catch (error) {
        console.warn('Pose overlay detection failed:', error);
        return null;
    }
};

const createFallbackPoseGuide = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    canvasW: number,
    canvasH: number,
) => {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const { x, y, drawW, drawH } = drawContainedImage(ctx, img, canvasW, canvasH);

    const offscreen = document.createElement('canvas');
    offscreen.width = canvasW;
    offscreen.height = canvasH;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) {
        return { x, y, drawW, drawH };
    }

    offCtx.fillStyle = '#121212';
    offCtx.fillRect(0, 0, canvasW, canvasH);
    offCtx.filter = 'grayscale(1) saturate(0) contrast(1.28) brightness(0.9) blur(1.2px)';
    drawContainedImage(offCtx, img, canvasW, canvasH);
    offCtx.filter = 'none';

    const imageData = offCtx.getImageData(0, 0, canvasW, canvasH);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
        const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const quantized = luminance > 168 ? 222 : luminance > 104 ? 126 : 28;
        data[i] = quantized;
        data[i + 1] = quantized;
        data[i + 2] = quantized;
    }
    offCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(offscreen, 0, 0);

    return { x, y, drawW, drawH };
};

const isVisiblePoseLandmark = (landmark?: NormalizedLandmark | null) =>
    Boolean(landmark) && Number((landmark as any).visibility ?? 1) >= POSE_VISIBILITY_THRESHOLD;

const mapPoseLandmarkToCanvas = (
    landmark: NormalizedLandmark,
    x: number,
    y: number,
    drawW: number,
    drawH: number,
) => ({
    x: x + landmark.x * drawW,
    y: y + landmark.y * drawH,
});

const drawPoseSegmentationGuide = (
    ctx: CanvasRenderingContext2D,
    segmentationMask: NonNullable<PoseOverlayDetection['segmentationMask']>,
    x: number,
    y: number,
    drawW: number,
    drawH: number,
) => {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = segmentationMask.width;
    maskCanvas.height = segmentationMask.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    const imageData = maskCtx.createImageData(segmentationMask.width, segmentationMask.height);
    for (let i = 0; i < segmentationMask.data.length; i += 1) {
        const alpha = clamp(segmentationMask.data[i] * 255, 0, 255);
        const idx = i * 4;
        imageData.data[idx] = 236;
        imageData.data[idx + 1] = 236;
        imageData.data[idx + 2] = 236;
        imageData.data[idx + 3] = alpha > 76 ? alpha : 0;
    }
    maskCtx.putImageData(imageData, 0, 0);

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.filter = 'blur(1.2px) contrast(1.05)';
    ctx.drawImage(maskCanvas, x, y, drawW, drawH);
    ctx.restore();
};

const drawPoseSkeletonGuide = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    x: number,
    y: number,
    drawW: number,
    drawH: number,
) => {
    const connections = PoseLandmarker.POSE_CONNECTIONS || [];

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 188, 0.9)';
    ctx.lineWidth = Math.max(3, Math.min(drawW, drawH) * 0.008);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const connection of connections) {
        const fromIndex = Number((connection as any).start);
        const toIndex = Number((connection as any).end);
        const from = landmarks[fromIndex];
        const to = landmarks[toIndex];
        if (!isVisiblePoseLandmark(from) || !isVisiblePoseLandmark(to)) continue;
        const p1 = mapPoseLandmarkToCanvas(from, x, y, drawW, drawH);
        const p2 = mapPoseLandmarkToCanvas(to, x, y, drawW, drawH);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    for (const landmark of landmarks) {
        if (!isVisiblePoseLandmark(landmark)) continue;
        const point = mapPoseLandmarkToCanvas(landmark, x, y, drawW, drawH);
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(3, Math.min(drawW, drawH) * 0.007), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
};

const suppressPoseGuideFaceRegion = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    x: number,
    y: number,
    drawW: number,
    drawH: number,
) => {
    const facialIndexes = [0, 2, 5, 7, 8];
    const facialPoints = facialIndexes
        .map((index) => landmarks[index])
        .filter((landmark) => isVisiblePoseLandmark(landmark))
        .map((landmark) => mapPoseLandmarkToCanvas(landmark as NormalizedLandmark, x, y, drawW, drawH));

    if (facialPoints.length === 0) {
        return;
    }

    const xs = facialPoints.map((point) => point.x);
    const ys = facialPoints.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(42, (maxX - minX) * 2.8);
    const height = Math.max(52, (maxY - minY) * 3.2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2 + height * 0.02;

    ctx.save();
    ctx.fillStyle = 'rgba(18,18,18,0.96)';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

        const poseOverlay = await detectPoseOverlay(img);
        const { x, y, drawW, drawH } = createFallbackPoseGuide(ctx, img, canvasW, canvasH);

        if (poseOverlay) {
            if (poseOverlay.segmentationMask) {
                drawPoseSegmentationGuide(ctx, poseOverlay.segmentationMask, x, y, drawW, drawH);
            }
            suppressPoseGuideFaceRegion(ctx, poseOverlay.landmarks, x, y, drawW, drawH);
            drawPoseSkeletonGuide(ctx, poseOverlay.landmarks, x, y, drawW, drawH);
        } else {
            const detectedFaces = await detectCandidateFaceBoxes(img);
            const faceBox = detectedFaces.length > 0
                ? [...detectedFaces].sort(
                    (a, b) => scoreCandidateFaceBox(b, img.width, img.height) - scoreCandidateFaceBox(a, img.width, img.height),
                )[0]
                : null;

            if (faceBox) {
                const scale = Math.min(canvasW / img.width, canvasH / img.height);
                const drawOffsetX = (canvasW - img.width * scale) / 2;
                const drawOffsetY = (canvasH - img.height * scale) / 2;
                const maskX = drawOffsetX + faceBox.x * scale - faceBox.width * scale * 0.18;
                const maskY = drawOffsetY + faceBox.y * scale - faceBox.height * scale * 0.12;
                const maskW = faceBox.width * scale * 1.36;
                const maskH = faceBox.height * scale * 1.18;

                ctx.save();
                ctx.fillStyle = 'rgba(18, 18, 18, 0.94)';
                ctx.beginPath();
                ctx.roundRect(maskX, maskY, maskW, maskH, Math.max(18, Math.min(maskW, maskH) * 0.18));
                ctx.fill();
                ctx.restore();
            } else {
                ctx.save();
                ctx.fillStyle = 'rgba(18, 18, 18, 0.6)';
                ctx.fillRect(x, y, drawW, drawH * 0.3);
                ctx.restore();
            }
        }

        ctx.save();
        ctx.strokeStyle = poseOverlay ? 'rgba(0,255,188,0.28)' : 'rgba(255,255,255,0.26)';
        ctx.lineWidth = Math.max(2, Math.min(canvasW, canvasH) * 0.004);
        ctx.strokeRect(x, y, drawW, drawH);
        ctx.restore();

        ctx.fillStyle = 'rgba(10, 10, 10, 0.1)';
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
        const detectedFaces = await detectCandidateFaceBoxes(img);
        const detectedCrop = detectedFaces.length > 0
            ? buildCropFromFaceBox(
                [...detectedFaces].sort(
                    (a, b) => scoreCandidateFaceBox(b, img.width, img.height) - scoreCandidateFaceBox(a, img.width, img.height),
                )[0],
                img.width,
                img.height,
            )
            : null;
        const { sx, sy, sw, sh } = detectedCrop || getFaceLockCrop(img);

        canvas.width = size;
        canvas.height = size;

        ctx.fillStyle = '#151515';
        ctx.fillRect(0, 0, size, size);

        ctx.save();
        ctx.filter = 'blur(18px) brightness(0.84) saturate(0.96)';
        drawCoverCrop(ctx, img, sx, sy, sw, sh, 0, 0, size, size);
        ctx.restore();

        ctx.save();
        ctx.filter = 'contrast(1.01) saturate(1.0) brightness(1.0)';
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

export const createFaceDetailReference = async (source: string): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(source, 10000);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return source;

        const size = 1024;
        const padding = 20;
        const detectedFaces = await detectCandidateFaceBoxes(img);
        const detailCrop = detectedFaces.length > 0
            ? buildDetailCropFromFaceBox(
                [...detectedFaces].sort(
                    (a, b) => scoreCandidateFaceBox(b, img.width, img.height) - scoreCandidateFaceBox(a, img.width, img.height),
                )[0],
                img.width,
                img.height,
            )
            : (() => {
                const baseCrop = getFaceLockCrop(img);
                return {
                    sx: baseCrop.sx + baseCrop.sw * 0.1,
                    sy: baseCrop.sy + baseCrop.sh * 0.02,
                    sw: baseCrop.sw * 0.8,
                    sh: baseCrop.sh * 0.78,
                };
            })();

        const { sx, sy, sw, sh } = detailCrop;

        canvas.width = size;
        canvas.height = size;

        ctx.fillStyle = '#181818';
        ctx.fillRect(0, 0, size, size);

        ctx.save();
        ctx.filter = 'blur(16px) brightness(0.9) saturate(0.98)';
        drawCoverCrop(ctx, img, sx, sy, sw, sh, 0, 0, size, size);
        ctx.restore();

        ctx.save();
        ctx.filter = 'contrast(1.02) saturate(1.01) brightness(1.01)';
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

        return canvas.toDataURL('image/jpeg', 0.95);
    } catch (error) {
        console.warn('Face-detail reference generation failed:', error);
        return source;
    }
};

export const createStyleOnlyReference = async (source: string): Promise<string> => {
    try {
        const img = await loadImageWithTimeout(source, 10000);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return source;

        const size = 1024;
        const gap = 18;
        const panel = Math.floor((size - gap * 3) / 2);
        canvas.width = size;
        canvas.height = size;

        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, size, size);

        const crops = [
            { sx: img.width * 0.08, sy: img.height * 0.06, sw: img.width * 0.36, sh: img.height * 0.32, dx: gap, dy: gap, blur: 6 },
            { sx: img.width * 0.42, sy: img.height * 0.1, sw: img.width * 0.32, sh: img.height * 0.3, dx: gap * 2 + panel, dy: gap, blur: 8 },
            { sx: img.width * 0.14, sy: img.height * 0.42, sw: img.width * 0.34, sh: img.height * 0.3, dx: gap, dy: gap * 2 + panel, blur: 8 },
            { sx: img.width * 0.46, sy: img.height * 0.46, sw: img.width * 0.3, sh: img.height * 0.28, dx: gap * 2 + panel, dy: gap * 2 + panel, blur: 10 },
        ];

        for (const crop of crops) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(crop.dx, crop.dy, panel, panel, 24);
            ctx.clip();
            ctx.filter = `blur(${crop.blur}px) saturate(1.02) brightness(0.98) contrast(1.04)`;
            drawCoverCrop(ctx, img, crop.sx, crop.sy, crop.sw, crop.sh, crop.dx, crop.dy, panel, panel);
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 2;
            ctx.strokeRect(crop.dx, crop.dy, panel, panel);
            ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.filter = 'blur(30px) saturate(1.04)';
        drawCoverCrop(ctx, img, 0, 0, img.width, img.height, 0, 0, size, size);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, 0, size, size);
        ctx.restore();

        return canvas.toDataURL('image/jpeg', 0.92);
    } catch (error) {
        console.warn('Style-only reference generation failed:', error);
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
