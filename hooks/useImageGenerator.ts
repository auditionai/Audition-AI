import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel, StylePreset } from '../types';

const fileToBase64 = (file: File): Promise<{mimeType: string, data: string}> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const result = reader.result as string;
        if (!result) {
            return reject(new Error("File could not be read."));
        }
        const [header, base64] = result.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || file.type;
        resolve({ mimeType, data: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

const createCanvasImage = async (imageFile: File, targetAspectRatio: string): Promise<{ file: File; isComposite: boolean }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const [targetW, targetH] = targetAspectRatio.split(':').map(Number);
            const targetRatio = targetW / targetH;
            const imgRatio = img.width / img.height;

            // If ratios are very close, no need to create a canvas, just return original file
            if (Math.abs(targetRatio - imgRatio) < 0.05) {
                return resolve({ file: imageFile, isComposite: false });
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context.'));

            // Create canvas with target ratio, scaled down for performance
            const CANVAS_MAX_DIM = 1024;
            let canvasWidth, canvasHeight;
            if (targetRatio > 1) { // Landscape
                canvasWidth = CANVAS_MAX_DIM;
                canvasHeight = Math.round(CANVAS_MAX_DIM / targetRatio);
            } else { // Portrait or Square
                canvasHeight = CANVAS_MAX_DIM;
                canvasWidth = Math.round(CANVAS_MAX_DIM * targetRatio);
            }

            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            ctx.fillStyle = '#808080'; // Gray background
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            
            // Calculate position to draw the source image centered on the canvas, fitting inside
            const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            const dx = (canvasWidth - scaledWidth) / 2;
            const dy = (canvasHeight - scaledHeight) / 2;

            ctx.drawImage(img, dx, dy, scaledWidth, scaledHeight);

            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error('Canvas to Blob conversion failed.'));
                const newFile = new File([blob], `composite_${imageFile.name}`, { type: 'image/jpeg' });
                resolve({ file: newFile, isComposite: true });
            }, 'image/jpeg', 0.95);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(imageFile);
    });
};

export const useImageGenerator = () => {
    const { session, showToast, updateUserProfile } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);

    const COST_PER_IMAGE = 1;

    const generateImage = useCallback(async (
        prompt: string,
        characterImage: File | null,
        styleImage: File | null,
        model: AIModel,
        style: StylePreset,
        aspectRatio: string,
        setGenerationStep: React.Dispatch<React.SetStateAction<number>>
    ) => {
        setIsLoading(true);
        setGeneratedImage(null);
        setGenerationStep(1); // Start

        try {
            let finalCharacterImageFile = characterImage;
            let isOutpainting = false;
            
            if (characterImage) {
                setGenerationStep(1); // Preparing Canvas
                const { file: processedFile, isComposite } = await createCanvasImage(characterImage, aspectRatio);
                finalCharacterImageFile = processedFile;
                isOutpainting = isComposite;
                setGenerationStep(2); // Canvas Ready
            }

            const characterImagePayload = finalCharacterImageFile ? await fileToBase64(finalCharacterImageFile) : null;
            // Step is already 2 from above, or we skip if no image
            
            const styleImagePayload = styleImage ? await fileToBase64(styleImage) : null;
            if(styleImage) setGenerationStep(3); // Style analyzed

            const body = {
                prompt,
                characterImage: characterImagePayload,
                styleImage: styleImagePayload,
                model,
                style,
                aspectRatio,
                isOutpainting
            };

            setGenerationStep(4); // Prompt check
            setGenerationStep(5); // JSON composition

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            setGenerationStep(6); // Send to Google AI
            const response = await fetch('/.netlify/functions/generate-image', {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            
            if (!response.ok) {
                 const errorBody = await response.text();
                 try {
                     const parsedError = JSON.parse(errorBody);
                     throw new Error(parsedError.error || `Lỗi từ máy chủ: ${response.status}`);
                 } catch (e) {
                     // If parsing fails, the body was likely not JSON (e.g., HTML from a gateway timeout)
                     throw new Error(errorBody || `Lỗi từ máy chủ: ${response.status}`);
                 }
            }

            const result = await response.json();
            
            setGeneratedImage(result.imageUrl);
            if (result.newDiamondCount !== undefined && result.newXp !== undefined) {
                updateUserProfile({ diamonds: result.newDiamondCount, xp: result.newXp });
            }
            showToast('Tạo ảnh thành công!', 'success');
            setGenerationStep(7); // Complete

        } catch (error: any) {
            console.error("Image Generation Error:", error);
            showToast(error.message, 'error');
            setGenerationStep(0); // Reset on error
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast, updateUserProfile]);

    return { isLoading, generatedImage, generateImage, COST_PER_IMAGE };
};