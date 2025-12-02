
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
        try {
            // Robust Regex to match 11-char YouTube ID from various URL formats:
            // - youtube.com/watch?v=ID
            // - youtube.com/embed/ID
            // - youtube.com/v/ID
            // - youtube.com/shorts/ID
            // - youtu.be/ID
            const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
            const match = cleanUrl.match(ytRegex);
            
            if (match && match[1]) {
                // Return clean embed URL with autoplay
                return `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0`;
            }
            
            // Handle Google Drive preview link fix
            if (cleanUrl.includes('drive.google.com') && cleanUrl.includes('/view')) {
                return cleanUrl.replace('/view', '/preview');
            }
            
            // If it's already a direct embed link or other supported iframe source, return as is
            return cleanUrl;
        } catch (e) {
            return cleanUrl;
        }
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
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
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
