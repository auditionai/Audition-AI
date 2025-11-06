import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string));
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

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const response = await fetch('/.netlify/functions/process-background', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ image: imageDataUrl }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Lỗi từ máy chủ: ${response.status}`);
            }

            const result = await response.json();

            updateUserProfile({ diamonds: result.newDiamondCount });
            showToast(`Tách nền thành công!`, 'success');
            
            return result.imageUrl;

        } catch (error: any) {
            // Log the raw error for better debugging
            console.error("Background Removal Error:", error);
            // Show a user-friendly message, which might be the raw text from the server
            showToast(error.message || 'Có lỗi xảy ra khi tách nền.', 'error');
            return null;
        } finally {
            setProcessing(false);
        }
    };

    return { isProcessing, removeBackground, COST_PER_REMOVAL };
};