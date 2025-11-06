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
        console.log('[DEBUG] Step 1: Initiating background removal for file:', imageFile.name);

        try {
            const imageDataUrl = await fileToBase64(imageFile);
            console.log('[DEBUG] Step 2: Successfully converted file to base64 Data URL.');

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            console.log('[DEBUG] Step 3: Sending request to Netlify function `/process-background`...');
            const response = await fetch('/.netlify/functions/process-background', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ image: imageDataUrl }),
            });
            console.log(`[DEBUG] Step 4: Received response from server with status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[DEBUG] Step 4 FAILED: Server returned a non-OK response. Body:', errorText);
                throw new Error(errorText || `Lỗi từ máy chủ: ${response.status}`);
            }

            console.log('[DEBUG] Step 5: Attempting to parse JSON from response...');
            const result = await response.json();
            console.log('[DEBUG] Step 6: JSON parsed successfully.');

            updateUserProfile({ diamonds: result.newDiamondCount });
            showToast(`Tách nền thành công!`, 'success');
            
            return result.imageUrl;

        } catch (error: any) {
            console.error("[DEBUG] AN ERROR OCCURRED in the background removal pipeline:", error);
            
            let errorMessage = 'Có lỗi xảy ra khi tách nền.';
            if (error instanceof Error) {
                 // Try to parse the error message if it's a JSON string from our server
                try {
                    const parsedError = JSON.parse(error.message);
                    if (parsedError.error) {
                        errorMessage = `Lỗi từ máy chủ: ${parsedError.error}`;
                    } else {
                        errorMessage = error.message;
                    }
                } catch (e) {
                    // Not a JSON string, use the raw message
                    errorMessage = error.message;
                }
            }
           
            showToast(errorMessage, 'error');
            return null;
        } finally {
            setProcessing(false);
            console.log('[DEBUG] Step 7: Background removal process finished.');
        }
    };

    return { isProcessing, removeBackground, COST_PER_REMOVAL };
};