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

export const useImageGenerator = () => {
    const { session, showToast, updateUserProfile } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);

    const COST_PER_IMAGE = 1;

    const generateImage = useCallback(async (
        prompt: string,
        poseImage: File | null,
        styleImage: File | null,
        faceReferenceImage: File | null,
        model: AIModel,
        style: StylePreset,
        aspectRatio: string,
        useFaceEnhancer: boolean,
        setGenerationStep: React.Dispatch<React.SetStateAction<number>>
    ) => {
        setIsLoading(true);
        setGeneratedImage(null);
        setGenerationStep(1); // Start: Initializing

        // This is a simulation of an async process. In a real app,
        // you would call a 'start-job' function and then poll for status.
        // Here, we'll just simulate the steps on the client.

        try {
            const poseImagePayload = poseImage ? await fileToBase64(poseImage) : null;
            if (poseImage) setGenerationStep(2); // Step: Pose Analyzed

            const styleImagePayload = styleImage ? await fileToBase64(styleImage) : null;
            if(styleImage) setGenerationStep(3); // Step: Style Analyzed

            const faceImagePayload = faceReferenceImage ? await fileToBase64(faceReferenceImage) : null;
            if(faceReferenceImage) setGenerationStep(4); // Step: Face Locked

            const body = {
                prompt,
                poseImage: poseImagePayload,
                styleImage: styleImagePayload,
                faceReferenceImage: faceImagePayload,
                model,
                style,
                aspectRatio,
                useFaceEnhancer
            };

            setGenerationStep(5); // Step: Sending to AI

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            // Simulate the first AI call
            await new Promise(res => setTimeout(res, 2000));
            setGenerationStep(6); // Step: Enhancing Face (if applicable)
            
            if (useFaceEnhancer) {
                await new Promise(res => setTimeout(res, 2000));
            }
            
            const response = await fetch('/.netlify/functions/generate-image', {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            
            setGenerationStep(7); // Step: Finalizing

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
            setGenerationStep(8); // Complete

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