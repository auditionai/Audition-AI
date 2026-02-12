import React from 'react';
import Modal from './Modal';

interface VideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    videoUrl: string;
}

const VideoModal: React.FC<VideoModalProps> = ({ isOpen, onClose, videoUrl }) => {
    if (!isOpen || !videoUrl) return null;

    // Helper: Trình phân tích URL thông minh
    const getEmbedUrl = (url: string) => {
        if (!url) return '';
        const cleanUrl = url.trim();

        // 1. Xử lý Google Drive (Chuyển view -> preview)
        if (cleanUrl.includes('drive.google.com')) {
             if (cleanUrl.includes('/view')) return cleanUrl.replace('/view', '/preview');
             return cleanUrl; 
        }

        // 2. Xử lý các link đã là Embed sẵn (Vimeo, hoặc Youtube Embed thủ công)
        if (cleanUrl.includes('player.vimeo.com') || cleanUrl.includes('youtube.com/embed/')) {
             // Nếu là Youtube embed nhưng thiếu origin, tự động thêm vào để tránh lỗi
             if (cleanUrl.includes('youtube.com/embed/') && !cleanUrl.includes('origin=')) {
                 const sep = cleanUrl.includes('?') ? '&' : '?';
                 return `${cleanUrl}${sep}origin=${window.location.origin}`;
             }
             return cleanUrl;
        }

        // 3. Trích xuất Youtube ID "thông minh" bằng Regex (Dứt điểm mọi loại link)
        // Hỗ trợ: youtube.com/watch?v=ID, youtu.be/ID, shorts/ID, live/ID, embed/ID
        const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = cleanUrl.match(youtubeRegex);

        if (match && match[1]) {
            const videoId = match[1];
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            // enablejsapi=1 & origin: Khắc phục lỗi "Video unavailable" do chính sách bảo mật
            // playsinline=1: Giúp chạy mượt trên mobile (iOS) không bị bung full màn hình
            return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${origin}`;
        }

        // 4. Fallback: Trả về nguyên gốc nếu không nhận diện được (cho các video server khác)
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
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin" // Quan trọng cho bảo mật Youtube mới
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