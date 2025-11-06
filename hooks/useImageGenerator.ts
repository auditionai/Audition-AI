import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel, StylePreset } from '../types';

// Fix: Create the `useImageGenerator` hook to encapsulate image generation logic.
// This resolves the "module not found" error in AiGeneratorTool.tsx and provides the necessary functionality.

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
        setGenerationStep: React.Dispatch<React.SetStateAction<number>>
    ) => {
        setIsLoading(true);
        setGeneratedImage(null);
        setGenerationStep(1); // Start

        try {
            const characterImagePayload = characterImage ? await fileToBase64(characterImage) : null;
            setGenerationStep(2); // Character analyzed
            
            const styleImagePayload = styleImage ? await fileToBase64(styleImage) : null;
            setGenerationStep(3); // Style analyzed

            const body = {
                prompt,
                characterImage: characterImagePayload,
                styleImage: styleImagePayload,
                model,
                style,
                aspectRatio
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

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Lỗi từ máy chủ: ${response.status}`);
            }
            
            setGeneratedImage(result.imageUrl);
            // Update both diamonds and XP
            if (result.newDiamondCount !== undefined && result.newXp !== undefined) {
                updateUserProfile({ diamonds: result.newDiamondCount, xp: result.newXp });
            }
            showToast('Tạo ảnh thành công!', 'success');
            setGenerationStep(7); // Complete

        } catch (error: any) {
            console.error("Image Generation Error:", error.message);
            showToast(error.message, 'error');
            setGenerationStep(0); // Reset on error
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, generatedImage, generateImage, COST_PER_IMAGE };
};
