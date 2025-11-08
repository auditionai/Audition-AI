import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel } from '../types';

// Helper function to convert a file to a base64 string
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

    const generateImage = async (
        prompt: string,
        model: AIModel,
        characterImageFile: File | null,
        styleImageFile: File | null,
        faceImageFile: File | null,
        aspectRatio: string,
        negativePrompt: string,
        faceIdStrength: number,
        styleStrength: number
    ) => {
        setIsGenerating(true);
        setProgress(1); // Step 1: Initialize
        setError(null);
        setGeneratedImage(null);

        try {
            // Simulate progress for better UX
            const progressInterval = setInterval(() => {
                setProgress(prev => (prev < 8 ? prev + 1 : prev));
            }, 1500);

            const [characterImage, styleImage, faceImage] = await Promise.all([
                characterImageFile ? fileToBase64(characterImageFile) : Promise.resolve(null),
                styleImageFile ? fileToBase64(styleImageFile) : Promise.resolve(null),
                faceImageFile ? fileToBase64(faceImageFile) : Promise.resolve(null)
            ]);

            const response = await fetch('/.netlify/functions/generate-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    prompt,
                    modelId: model.id,
                    apiModel: model.apiModel,
                    characterImage,
                    styleImage,
                    faceImage,
                    aspectRatio,
                    negativePrompt,
                    faceIdStrength,
                    styleStrength,
                }),
            });
            
            clearInterval(progressInterval);

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'Lỗi không xác định từ máy chủ.');
            }

            const result = await response.json();
            
            setProgress(9); // Upload complete
            
            updateUserProfile({ diamonds: result.newDiamondCount, xp: result.newXp });
            setGeneratedImage(result.imageUrl);
            showToast('Tạo ảnh thành công!', 'success');
            
            setProgress(10); // Success

        } catch (err: any) {
            setError(err.message || 'Đã xảy ra lỗi trong quá trình tạo ảnh.');
            showToast(err.message || 'Tạo ảnh thất bại.', 'error');
            setProgress(0);
        } finally {
            setIsGenerating(false);
        }
    };

    const resetGenerator = () => {
        setIsGenerating(false);
        setProgress(0);
        setGeneratedImage(null);
        setError(null);
    };

    return { isGenerating, progress, generatedImage, error, generateImage, resetGenerator };
};
