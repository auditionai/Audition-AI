import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AIModel } from '../types';
import { fileToBase64 } from '../utils/imageUtils';

// Logic moved from backend to frontend
const buildSignaturePrompt = (
    text: string, style: string, position: string, 
    color: string, customColor: string, size: string
): string => {
    if (!text || text.trim() === '') return '';

    let instruction = `The image should include a signature that says "${text.trim()}".`;
    
    const styleMap: { [key: string]: string } = {
        handwritten: 'a handwritten script style', sans_serif: 'a clean sans-serif font style',
        bold: 'a bold font style', vintage: 'a vintage retro font style', '3d': 'a 3D typography style',
        messy: 'a messy grunge font style', outline: 'an outline font style', teen_code: 'a playful teen-code font style',
        mixed: 'a creative mixed font style',
    };
    const sizeMap: { [key: string]: string } = { small: 'small and discreet', medium: 'medium-sized and noticeable', large: 'large and prominent' };
    const positionMap: { [key: string]: string } = {
        bottom_right: 'in the bottom-right corner', bottom_left: 'in the bottom-left corner',
        top_right: 'in the top-right corner', top_left: 'in the top-left corner',
        center: 'in the center', random: 'in a visually pleasing location',
    };
    
    let colorDesc = 'white or a contrasting color';
    if (color === 'rainbow') colorDesc = 'a vibrant rainbow gradient color';
    else if (color === 'custom' && customColor) colorDesc = `the color ${customColor}`;
    else if (color === 'random') colorDesc = 'a random, complementary color';

    instruction += ` The signature is ${sizeMap[size] || 'medium-sized'}, in ${styleMap[style] || 'a clean font style'}, with ${colorDesc}, and placed ${positionMap[position] || 'in the bottom-right corner'}.`;
    return ' ' + instruction;
};

export const useImageGenerator = () => {
    const { session, showToast, updateUserProfile } = useAuth();
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const generateImage = async (
        prompt: string, model: AIModel, poseImageFile: File | null,
        styleImageFile: File | null, faceImage: string | null, // <-- REFACTORED: Now consistently string or null
        aspectRatio: string, useUpscaler: boolean,
        useSignature: boolean,
        signatureOptions: {
            signatureText: string;
            signatureStyle: string;
            signaturePosition: string;
            signatureColor: string;
            signatureCustomColor: string;
            signatureSize: string;
        }
    ) => {
        setIsGenerating(true);
        setProgress(1);
        setError(null);
        setGeneratedImage(null);
        abortControllerRef.current = new AbortController();

        let progressInterval: ReturnType<typeof setInterval> | null = null;

        try {
            progressInterval = setInterval(() => {
                setProgress(prev => (prev < 8 ? prev + 1 : prev));
            }, 1800);

            let fullPrompt = prompt;
            if (useSignature) {
                const signatureInstruction = buildSignaturePrompt(
                    signatureOptions.signatureText, signatureOptions.signatureStyle, signatureOptions.signaturePosition,
                    signatureOptions.signatureColor, signatureOptions.signatureCustomColor, signatureOptions.signatureSize
                );
                fullPrompt += signatureInstruction;
            }

            // --- REFACTORED & SIMPLIFIED: No longer needs to check for File type ---
            const [poseImageBase64, styleImageBase64] = await Promise.all([
                poseImageFile ? fileToBase64(poseImageFile) : Promise.resolve(null),
                styleImageFile ? fileToBase64(styleImageFile) : Promise.resolve(null),
            ]);
            
            const bodyPayload = {
                originalPrompt: prompt,
                fullPrompt: fullPrompt,
                apiModel: model.apiModel,
                characterImage: poseImageBase64,
                styleImage: styleImageBase64, 
                faceReferenceImage: faceImage, // Already a data URL string or null
                aspectRatio, 
                useUpscaler
            };
            // --- END REFACTOR ---

            const response = await fetch('/.netlify/functions/generate-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify(bodyPayload),
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