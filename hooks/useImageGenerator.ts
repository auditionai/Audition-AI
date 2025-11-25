
import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel } from '../types';
import { preprocessImageToAspectRatio } from '../utils/imageUtils';

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

export const useImageGenerator = () => {
    const { session, showToast, updateUserProfile, supabase } = useAuth();
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const generateImage = async (
        prompt: string, 
        model: AIModel, 
        poseImageFile: File | null,
        styleImageFile: File | null, 
        faceImage: File | string | null,
        aspectRatio: string, 
        negativePrompt: string,
        seed: number | undefined, 
        useUpscaler: boolean,
        imageResolution: string = '1K',
        useGoogleSearch: boolean = false,
        removeWatermark: boolean = false // Added param
    ) => {
        setIsGenerating(true);
        setProgress(1);
        setError(null);
        setGeneratedImage(null);
        abortControllerRef.current = new AbortController();

        let progressInterval: ReturnType<typeof setInterval> | null = null;

        try {
            // Simulate initial steps
            progressInterval = setInterval(() => {
                setProgress(prev => (prev < 8 ? prev + 1 : prev));
            }, 1800);

            // PRE-PROCESS IMAGES: Apply Letterboxing/Padding on Client Side
            const processInput = async (file: File | null) => {
                if (!file) return null;
                const rawBase64 = await fileToBase64(file);
                // Apply White Padding logic based on Aspect Ratio
                return await preprocessImageToAspectRatio(rawBase64, aspectRatio);
            };

            const [poseImageBase64, styleImageBase64, faceImageBase64] = await Promise.all([
                processInput(poseImageFile), // Letterbox Pose
                processInput(styleImageFile), // Letterbox Style (optional but good for consistency)
                faceImage instanceof File ? fileToBase64(faceImage) : Promise.resolve(faceImage) // Do NOT letterbox Face ID
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
                    characterImage: poseImageBase64,
                    styleImage: styleImageBase64, 
                    faceReferenceImage: faceImageBase64,
                    aspectRatio, 
                    negativePrompt,
                    seed, 
                    useUpscaler,
                    imageSize: imageResolution,
                    useGoogleSearch,
                    removeWatermark // Pass to backend
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

            // Smart Recovery Logic
            if (supabase && session?.user?.id) {
                console.log("Attempting recovery check for generated image...");
                try {
                    const { data: recentImages } = await supabase
                        .from('generated_images')
                        .select('image_url, created_at')
                        .eq('user_id', session.user.id)
                        .not('image_url', 'eq', 'PENDING')
                        .not('image_url', 'is', null)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (recentImages && recentImages.length > 0) {
                        const latestImage = recentImages[0];
                        const timeDiff = Date.now() - new Date(latestImage.created_at).getTime();
                        
                        if (timeDiff < 120000) { 
                            console.log("Recovered image from DB:", latestImage.image_url);
                            setGeneratedImage(latestImage.image_url);
                            const userRes = await supabase.from('users').select('diamonds, xp').eq('id', session.user.id).single();
                            if (userRes.data) {
                                updateUserProfile({ diamonds: userRes.data.diamonds, xp: userRes.data.xp });
                            }
                            showToast('Tạo ảnh thành công (Đã khôi phục)!', 'success');
                            setProgress(10);
                            return;
                        }
                    }
                } catch (recoveryErr) {
                    console.error("Recovery failed:", recoveryErr);
                }
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