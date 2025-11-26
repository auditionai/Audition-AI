
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
        removeWatermark: boolean = false 
    ) => {
        setIsGenerating(true);
        setProgress(1);
        setError(null);
        setGeneratedImage(null);
        abortControllerRef.current = new AbortController();

        let progressInterval: ReturnType<typeof setInterval> | null = null;
        let realtimeChannel: any = null;

        try {
            // Simulated progress for UX
            progressInterval = setInterval(() => {
                setProgress(prev => (prev < 8 ? prev + 1 : prev));
            }, 1800);

            const processInput = async (file: File | null, targetRatio: string) => {
                if (!file) return null;
                const rawBase64 = await fileToBase64(file);
                return await preprocessImageToAspectRatio(rawBase64, targetRatio);
            };

            const resolveFaceImage = async () => {
                if (!faceImage) return null;
                if (faceImage instanceof File) return await fileToBase64(faceImage);
                return faceImage as string;
            };

            const [poseImageBase64, styleImageBase64, faceImageBase64] = await Promise.all([
                processInput(poseImageFile, aspectRatio), 
                processInput(styleImageFile, "1:1"), 
                resolveFaceImage()
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
                    removeWatermark
                }),
                signal: abortControllerRef.current.signal,
            });
            
            if (progressInterval) clearInterval(progressInterval);

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'Lỗi không xác định từ máy chủ.');
            }

            // --- ASYNC JOB HANDLING (Status 202) ---
            if (response.status === 202) {
                const { jobId, newDiamondCount, newXp } = await response.json();
                
                // Update balance immediately (deducted upfront)
                updateUserProfile({ diamonds: newDiamondCount, xp: newXp });
                
                setProgress(5); // Job started
                
                // Poll/Listen for completion
                return new Promise<void>((resolve, reject) => {
                    if (!supabase) return reject(new Error("Realtime connection failed"));

                    // Use Realtime for faster updates
                    realtimeChannel = supabase.channel(`job-${jobId}`)
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'generated_images',
                            filter: `id=eq.${jobId}`
                        }, (payload: any) => {
                            const newRecord = payload.new;
                            if (newRecord.image_url && newRecord.image_url !== 'PENDING') {
                                setGeneratedImage(newRecord.image_url);
                                setProgress(10);
                                showToast('Tạo ảnh thành công!', 'success');
                                if (realtimeChannel) supabase.removeChannel(realtimeChannel);
                                resolve();
                            }
                        })
                        .on('postgres_changes', {
                             event: 'DELETE', // Job failed and was deleted (refunded)
                             schema: 'public',
                             table: 'generated_images',
                             filter: `id=eq.${jobId}`
                        }, () => {
                             if (realtimeChannel) supabase.removeChannel(realtimeChannel);
                             reject(new Error("Tạo ảnh thất bại. Hệ thống đã hoàn tiền."));
                        })
                        .subscribe();

                    // Backup Polling (in case realtime misses)
                    const poll = setInterval(async () => {
                        const { data } = await supabase.from('generated_images').select('image_url').eq('id', jobId).single();
                        if (data?.image_url && data.image_url !== 'PENDING') {
                            clearInterval(poll);
                            if (realtimeChannel) supabase.removeChannel(realtimeChannel);
                            setGeneratedImage(data.image_url);
                            setProgress(10);
                            showToast('Tạo ảnh thành công!', 'success');
                            resolve();
                        } else if (!data) {
                             // Record gone = failed/refunded
                             clearInterval(poll);
                             if (realtimeChannel) supabase.removeChannel(realtimeChannel);
                             reject(new Error("Tạo ảnh thất bại (Timeout). Đã hoàn tiền."));
                        }
                    }, 4000);
                });
            }

            // --- LEGACY SYNC HANDLING (Status 200) ---
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
            
            // Clean up channel if error
            if (realtimeChannel && supabase) supabase.removeChannel(realtimeChannel);

            setError(err.message || 'Đã xảy ra lỗi trong quá trình tạo ảnh.');
            showToast(err.message || 'Tạo ảnh thất bại.', 'error');
            setProgress(0);
        } finally {
            if (progressInterval) clearInterval(progressInterval);
            // Only stop loading if we are not waiting for async result
            // If we are in the Promise above, isGenerating stays true until resolve/reject
            if (!realtimeChannel) {
                setIsGenerating(false);
            }
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
