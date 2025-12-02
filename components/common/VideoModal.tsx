
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
        try {
            if (url.includes('youtube.com/watch')) {
                const urlObj = new URL(url);
                const videoId = urlObj.searchParams.get('v');
                return `https://www.youtube.com/embed/${videoId}`;
            }
            if (url.includes('youtu.be')) {
                // Use URL object to safely extract pathname without query params
                // e.g. https://youtu.be/ID?t=1 -> /ID -> ID
                const urlObj = new URL(url);
                const videoId = urlObj.pathname.substring(1); // remove leading slash
                return `https://www.youtube.com/embed/${videoId}`;
            }
            // Google Drive preview link fix (replace view with preview)
            if (url.includes('drive.google.com') && url.includes('/view')) {
                return url.replace('/view', '/preview');
            }
            // Direct embed links or other formats - try as is
            return url;
        } catch (e) {
            return url;
        }
    };

    const embedUrl = getEmbedUrl(videoUrl);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Hướng Dẫn Sử Dụng">
            <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
                <iframe 
                    src={embedUrl} 
                    className="w-full h-full" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                ></iframe>
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