import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel, StylePreset } from '../types';

// Helper function to convert a File to a base64 string
const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

export const useImageGenerator = () => {
    const { session, showToast, updateUserProfile } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);

    const COST_PER_IMAGE = 1;

    const generateImage = async (
        prompt: string,
        characterImage: File | null,
        styleImage: File | null,
        model: AIModel,
        style: StylePreset,
        aspectRatio: string,
        setGenerationStep: (step: number) => void
    ) => {
        setIsLoading(true);
        setGeneratedImage(null);

        try {
            setGenerationStep(1); // Khởi tạo

            // Convert images to base64
            let characterImageBase64: string | null = null;
            if (characterImage) {
                setGenerationStep(2); // Phân tích nhân vật
                characterImageBase64 = await fileToBase64(characterImage);
            }

            let styleImageBase64: string | null = null;
            if (styleImage) {
                setGenerationStep(3); // Phân tích phong cách
                styleImageBase64 = await fileToBase64(styleImage);
            }

            setGenerationStep(4); // Kiểm tra câu lệnh

            const payload = {
                prompt,
                characterImage: characterImageBase64,
                styleImage: styleImageBase64,
                modelApi: model.apiModel,
                styleId: style.id,
                aspectRatio,
            };
            
            setGenerationStep(5); // Tổng hợp prompt JSON

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            setGenerationStep(6); // Gửi đến Google AI
            const response = await fetch('/.netlify/functions/generate-image', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Lỗi không xác định từ máy chủ.');
            }
            
            setGeneratedImage(result.imageUrl);
            updateUserProfile({ diamonds: result.newDiamondCount });
            showToast('Tạo ảnh thành công!', 'success');
            setGenerationStep(7); // Hoàn tất

        } catch (error: any) {
            console.error("Image Generation Error:", error);
            showToast(error.message, 'error');
            setGenerationStep(0); // Reset on error
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, generatedImage, generateImage, COST_PER_IMAGE };
};
