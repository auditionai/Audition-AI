import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel, StylePreset } from '../types';

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string)); // returns data:...,base64
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

export const useBackgroundRemover = () => {
    const { session, showToast, updateUserProfile } = useAuth();
    const [isProcessing, setProcessing] = useState(false);

    const COST_PER_REMOVAL = 1;

    // The function now accepts a File object, just like generateImage.
    const removeBackground = async (imageFile: File): Promise<string | null> => {
        setProcessing(true);
        try {
            // Internal conversion to base64, mirroring the generateImage hook.
            const imageDataUrl = await fileToBase64(imageFile);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const response = await fetch('/.netlify/functions/remove-background', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ image: imageDataUrl }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Lỗi không xác định');
            }
            
            updateUserProfile({ diamonds: result.newDiamondCount });
            showToast(`Tách nền thành công!`, 'success');
            return result.imageUrl;
        } catch (error: any) {
            showToast(error.message, 'error');
            return null;
        } finally {
            setProcessing(false);
        }
    };

    return { isProcessing, removeBackground, COST_PER_REMOVAL };
};

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
            // Fix: Use a single utility function for file-to-base64 conversion.
            const characterImage = characterImageFile ? await fileToBase64(characterImageFile) : null;
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
                    characterImage,
                    styleImage,
                    model: selectedModel.apiModel,
                    style: selectedStyle.id,
                    aspectRatio,
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