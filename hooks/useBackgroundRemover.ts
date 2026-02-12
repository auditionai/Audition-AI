
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
        let pollInterval: ReturnType<typeof setInterval> | null = null;

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

            // 1. CALL SPAWNER (Creates Job + Deducts Money)
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

            // --- ASYNC JOB HANDLING ---
            if (response.status === 202) {
                const { jobId, newDiamondCount, newXp } = await response.json();
                
                // Update balance immediately
                updateUserProfile({ diamonds: newDiamondCount, xp: newXp });
                setProgress(5); // Job registered
                
                // 2. TRIGGER WORKER FROM CLIENT (Fire and Forget style)
                fetch('/.netlify/functions/generate-image-background', {
                    method: 'POST',
                    body: JSON.stringify({ jobId })
                }).catch(e => console.warn("Worker trigger warning:", e));

                // 3. START POLLING / LISTENING
                return new Promise<void>((resolve, reject) => {
                    if (!supabase) return reject(new Error("Realtime connection failed"));

                    const cleanup = () => {
                        if (realtimeChannel) supabase.removeChannel(realtimeChannel);
                        if (pollInterval) clearInterval(pollInterval);
                    };

                    // A. Realtime Listener
                    realtimeChannel = supabase.channel(`job-${jobId}`)
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'generated_images',
                            filter: `id=eq.${jobId}`
                        }, (payload: any) => {
                            const newRecord = payload.new;
                            // Check for SUCCESS
                            if (newRecord.image_url && newRecord.image_url !== 'PENDING' && !newRecord.image_url.startsWith('FAILED:')) {
                                setGeneratedImage(newRecord.image_url);
                                setProgress(10);
                                showToast('Tạo ảnh thành công!', 'success');
                                cleanup();
                                resolve();
                            }
                            // Check for EXPLICIT FAILURE (New Logic)
                            if (newRecord.image_url && newRecord.image_url.startsWith('FAILED:')) {
                                const errorMsg = newRecord.image_url.replace('FAILED: ', '');
                                cleanup();
                                reject(new Error(errorMsg));
                            }
                        })
                        .on('postgres_changes', {
                             event: 'DELETE',
                             schema: 'public',
                             table: 'generated_images',
                             filter: `id=eq.${jobId}`
                        }, () => {
                             cleanup();
                             reject(new Error("Tác vụ bị hủy đột ngột. Đã hoàn tiền."));
                        })
                        .subscribe();

                    // B. Polling Backup with Timeout
                    let pollCount = 0;
                    const MAX_POLLS = 100; // ~5 minutes
                    
                    pollInterval = setInterval(async () => {
                        pollCount++;
                        
                        if (pollCount > MAX_POLLS) {
                            cleanup();
                            showToast("Tác vụ đang mất nhiều thời gian hơn dự kiến. Vui lòng kiểm tra lại sau.", "success"); 
                            resolve(); 
                            return;
                        }

                        const { data } = await supabase.from('generated_images').select('image_url').eq('id', jobId).single();
                        
                        if (data?.image_url) {
                             if (data.image_url.startsWith('FAILED:')) {
                                 const errorMsg = data.image_url.replace('FAILED: ', '');
                                 cleanup();
                                 reject(new Error(errorMsg));
                             } else if (data.image_url !== 'PENDING') {
                                cleanup();
                                setGeneratedImage(data.image_url);
                                setProgress(10);
                                showToast('Tạo ảnh thành công!', 'success');
                                resolve();
                             }
                        } else if (!data) {
                             cleanup();
                             reject(new Error("Tác vụ bị xóa khỏi hệ thống."));
                        }
                    }, 3000);
                });
            }

            // Legacy/Fallback path
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
            
            if (realtimeChannel && supabase) supabase.removeChannel(realtimeChannel);
            if (pollInterval) clearInterval(pollInterval);

            // Show specific error from server if available
            const errorMsg = err.message || 'Đã xảy ra lỗi trong quá trình tạo ảnh.';
            setError(errorMsg);
            showToast(errorMsg, 'error');
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
