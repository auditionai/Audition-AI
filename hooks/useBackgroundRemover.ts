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
        console.log(`[DEBUG] Step 1: Initiating background removal for file: "${imageFile.name}"`);

        let imageDataUrl: string;
        try {
            imageDataUrl = await fileToBase64(imageFile);
            console.log("[DEBUG] Step 2: Successfully converted file to base64 Data URL.");
        } catch (error) {
            console.error("[DEBUG] Step 2 FAILED: Could not convert file to base64.", error);
            showToast("Lỗi đọc file ảnh. Vui lòng kiểm tra console.", "error");
            setProcessing(false);
            return null;
        }

        let response: Response;
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            console.log("[DEBUG] Step 3: Sending request to Netlify function '/.netlify/functions/remove-background'...");
            response = await fetch('/.netlify/functions/remove-background', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ image: imageDataUrl }),
            });

            console.log(`[DEBUG] Step 4: Received response from server with status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[DEBUG] Step 4 FAILED: Server responded with non-OK status.`, {
                    status: response.status,
                    body: errorText,
                });
                
                let userMessage = `Lỗi máy chủ (${response.status}). Vui lòng kiểm tra console.`;
                if (response.status === 402) userMessage = "Không đủ kim cương.";
                if (response.status === 503) userMessage = "Hết tài nguyên AI, vui lòng thử lại sau.";
                
                throw new Error(userMessage);
            }

            console.log("[DEBUG] Step 5: Attempting to parse JSON from response...");
            const result = await response.json();
            console.log("[DEBUG] Step 5 SUCCESS: Successfully parsed JSON response.", result);

            updateUserProfile({ diamonds: result.newDiamondCount });
            showToast(`Tách nền thành công!`, 'success');
            
            console.log("[DEBUG] Step 6: Process complete. Returning image URL.");
            return result.imageUrl;

        } catch (error: any) {
            // This will catch:
            // 1. Network errors (fetch fails completely)
            // 2. Non-OK responses (manually thrown in the 'if' block)
            // 3. JSON parsing errors if the body of a 200 OK response is invalid
            if (error.name === 'SyntaxError') {
                 console.error("[DEBUG] Step 5 FAILED: Failed to parse JSON from a 200 OK response. This indicates a server-side issue where the function succeeded but returned an invalid body.");
            }
            console.error("[DEBUG] AN ERROR OCCURRED in the background removal pipeline:", error);
            showToast(error.message || 'Có lỗi xảy ra. Vui lòng kiểm tra console để biết chi tiết.', 'error');
            return null;
        } finally {
            setProcessing(false);
        }
    };

    return { isProcessing, removeBackground, COST_PER_REMOVAL };
};
