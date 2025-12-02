
import React from 'react';
import Modal from './Modal';

interface VideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    videoUrl: string;
}

const VideoModal: React.FC<VideoModalProps> = ({ isOpen, onClose, videoUrl }) => {
    if (!isOpen || !videoUrl) return null;

    // Helper to process YouTube links
    const getEmbedUrl = (url: string) => {
        const cleanUrl = url.trim();
        
        // Case 0: Already an embed URL or generic iframe src
        if (cleanUrl.includes('/embed/') || cleanUrl.includes('player.vimeo.com')) {
            return cleanUrl;
        }

        // Case 1: Google Drive
        if (cleanUrl.includes('drive.google.com') && cleanUrl.includes('/view')) {
            return cleanUrl.replace('/view', '/preview');
        }

        try {
            // Use URL object for safer parsing
            let urlObj: URL;
            try {
                urlObj = new URL(cleanUrl);
            } catch {
                // If invalid URL string, try adding protocol
                urlObj = new URL(`https://${cleanUrl}`);
            }

            const hostname = urlObj.hostname.toLowerCase();

            // Case 2: Standard YouTube (youtube.com)
            if (hostname.includes('youtube.com')) {
                // Standard Watch: v=ID
                const v = urlObj.searchParams.get('v');
                if (v) {
                    return `https://www.youtube.com/embed/${v}?autoplay=1&rel=0&origin=${window.location.origin}`;
                }
                
                // Shorts: /shorts/ID
                if (urlObj.pathname.startsWith('/shorts/')) {
                    const id = urlObj.pathname.split('/')[2];
                    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&origin=${window.location.origin}`;
                }

                // Live: /live/ID
                if (urlObj.pathname.startsWith('/live/')) {
                     const id = urlObj.pathname.split('/')[2];
                     if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&origin=${window.location.origin}`;
                }
            }

            // Case 3: Shortened YouTube (youtu.be/ID)
            if (hostname.includes('youtu.be')) {
                const id = urlObj.pathname.slice(1);
                if (id) {
                    return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&origin=${window.location.origin}`;
                }
            }

        } catch (e) {
             // Fallback Regex if URL parsing totally fails
             const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
             const match = cleanUrl.match(ytRegex);
             if (match && match[1]) {
                 return `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0&origin=${window.location.origin}`;
             }
        }

        return cleanUrl;
    };

    const embedUrl = getEmbedUrl(videoUrl);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Hướng Dẫn Sử Dụng">
            <div className="aspect-video w-full bg-black rounded-lg overflow-hidden relative shadow-lg border border-white/10">
                {embedUrl ? (
                    <iframe 
                        src={embedUrl} 
                        className="w-full h-full" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        allowFullScreen
                        title="Video Tutorial"
                    ></iframe>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                        <i className="ph-fill ph-video-camera-slash text-4xl opacity-50"></i>
                        <p className="text-sm">Không tìm thấy video hợp lệ.</p>
                    </div>
                )}
            </div>
            <div className="mt-4 text-center">
                <button onClick={onClose} className="themed-button-secondary px-6 py-2 text-sm">
                    Đóng
                </button>
            </div>
        </Modal>
    );
};

export default VideoModal;
