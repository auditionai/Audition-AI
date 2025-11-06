import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

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

    const removeBackground = async (imageFile: File): Promise<string | null> => {
        setProcessing(true);
        try {
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