import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel, StylePreset } from '../types';

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string)); // returns data:...,base64
    reader.onerror = reject;
    reader.readAsDataURL(file);
});


export const useImageGenerator = () => {
    const { session, showToast, updateUserProfile } = useAuth();
    const [isLoading, setLoading] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);

    const COST_PER_IMAGE = 1;

    const generateImage = async (
        prompt: string,
        characterImageFile: File | null,
        styleImageFile: File | null,
        selectedModel: AIModel,
        selectedStyle: StylePreset,
        aspectRatio: string,
        updateStep: (step: number) => void
    ) => {
        setLoading(true);
        setGeneratedImage(null);

        // Visual Progress Simulation
        const steps = [1, characterImageFile && 2, styleImageFile && 3, 4, 5, 6].filter(Boolean) as number[];
        for (const step of steps) {
            updateStep(step);
            await new Promise(res => setTimeout(res, 800 + Math.random() * 500));
        }

        try {
            let finalCharacterImage: string | null = null;

            if (characterImageFile) {
                const characterImageObjectUrl = URL.createObjectURL(characterImageFile);
                const img = new Image();
                await new Promise((resolve, reject) => { 
                    img.onload = resolve; 
                    img.onerror = reject;
                    img.src = characterImageObjectUrl; 
                });
                URL.revokeObjectURL(characterImageObjectUrl);

                const inputAspectRatio = img.width / img.height;
                const [targetW, targetH] = aspectRatio.split(':').map(Number);
                const targetAspectRatio = targetW / targetH;

                // Use a small tolerance for aspect ratio comparison
                if (Math.abs(inputAspectRatio - targetAspectRatio) > 0.01) {
                    // Aspect ratios differ, create a canvas for outpainting
                    const canvas = document.createElement('canvas');
                    const MAX_DIM = 1024; // Standard dimension for AI processing

                    let canvasWidth, canvasHeight;
                    if (targetAspectRatio >= 1) { // Landscape or square
                        canvasWidth = MAX_DIM;
                        canvasHeight = Math.round(MAX_DIM / targetAspectRatio);
                    } else { // Portrait
                        canvasHeight = MAX_DIM;
                        canvasWidth = Math.round(MAX_DIM * targetAspectRatio);
                    }
                    canvas.width = canvasWidth;
                    canvas.height = canvasHeight;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error("Could not get canvas context.");

                    // Fill with neutral gray as per user's request
                    ctx.fillStyle = '#808080';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Calculate dimensions to draw the character image, maintaining its aspect ratio
                    const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.95; // Add some padding
                    const scaledWidth = img.width * scale;
                    const scaledHeight = img.height * scale;
                    const dx = (canvas.width - scaledWidth) / 2;
                    const dy = (canvas.height - scaledHeight) / 2;
                    
                    ctx.drawImage(img, dx, dy, scaledWidth, scaledHeight);

                    finalCharacterImage = canvas.toDataURL('image/jpeg', 0.9);
                } else {
                    // Aspect ratios match, just use the original image
                    finalCharacterImage = await fileToBase64(characterImageFile);
                }
            }

            const styleImage = styleImageFile ? await fileToBase64(styleImageFile) : null;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const response = await fetch('/.netlify/functions/generate-image', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    prompt,
                    characterImage: finalCharacterImage, // Send the potentially modified image
                    styleImage,
                    model: selectedModel.apiModel,
                    style: selectedStyle.id,
                    aspectRatio, // Still send aspect ratio for logging/metadata if needed
                }),
            });
            
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Lỗi không xác định');
            }
            
            setGeneratedImage(result.imageUrl);
            updateUserProfile({ diamonds: result.newDiamondCount, xp: result.newXp });
            showToast(`Tạo ảnh thành công! (+${result.xpGained} XP)`, 'success');

        } catch (error: any) {
            showToast(error.message, 'error');
            setGeneratedImage(`https://picsum.photos/seed/${Date.now()}/1024/1024`); // Fallback
        } finally {
            setLoading(false);
            updateStep(0);
        }
    };

    return { isLoading, generatedImage, generateImage, COST_PER_IMAGE };
};