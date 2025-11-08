import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel } from '../types';

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

export const useImageGenerator = () => {
    const { session, showToast, updateUserProfile } = useAuth();
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const generateImage = async (
        prompt: string, model: AIModel, poseImageFile: File | null,
        styleImageFile: File | null, faceImage: File | string | null,
        aspectRatio: string, negativePrompt: string,
        seed: number | undefined, useUpscaler: boolean
    ) => {
        setIsGenerating(true);
        setProgress(1);
        setError(null);
        setGeneratedImage(null);
        abortControllerRef.current = new AbortController();

        // Fix: Changed NodeJS.Timeout to ReturnType<typeof setInterval> for browser compatibility.
        let progressInterval: ReturnType<typeof setInterval> | null = null;

        try {
            // Simulate initial steps a bit faster
            progressInterval = setInterval(() => {
                setProgress(prev => (prev < 8 ? prev + 1 : prev));
            }, 1800);

            const [poseImageBase64, styleImageBase64, faceImageBase64] = await Promise.all([
                poseImageFile ? fileToBase64(poseImageFile) : Promise.resolve(null),
                styleImageFile ? fileToBase64(styleImageFile) : Promise.resolve(null),
                faceImage instanceof File ? fileToBase64(faceImage) : Promise.resolve(faceImage)
            ]);

            const response = await fetch('/.netlify/functions/generate-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    prompt, modelId: model.id, apiModel: model.apiModel,
                    characterImage: poseImageBase64,
                    styleImage: styleImageBase64, 
                    faceReferenceImage: faceImageBase64,
                    aspectRatio, negativePrompt,
                    seed, useUpscaler
                }),
                signal: abortControllerRef.current.signal,
            });
            
            if (progressInterval) clearInterval(progressInterval);

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'Lỗi không xác định từ máy chủ.');
            }

            const result = await response.json();
            
            setProgress(9);
            updateUserProfile({ diamonds: result.newDiamondCount, xp: result.newXp });
            setGeneratedImage(result.imageUrl);
            showToast('Tạo ảnh thành công!', 'success');
            setProgress(10);

        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log('Generation cancelled by user.');
                resetGenerator();
                return;
            }
            setError(err.message || 'Đã xảy ra lỗi trong quá trình tạo ảnh.');
            showToast(err.message || 'Tạo ảnh thất bại.', 'error');
            setProgress(0);
        } finally {
            if (progressInterval) clearInterval(progressInterval);
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    };

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const resetGenerator = () => {
        setIsGenerating(false);
        setProgress(0);
        setGeneratedImage(null);
        setError(null);
    };

    return { isGenerating, progress, generatedImage, error, generateImage, resetGenerator, cancelGeneration };
};
