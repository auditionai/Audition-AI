
import React, { useRef, useEffect, useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import ChatMessageItem from './ChatMessage';
import ImageModal from '../common/ImageModal';
import ConfirmationModal from '../ConfirmationModal'; // Use existing app confirmation modal

const EMOTES = [
    '😀', '😂', '😍', '😎', '😭', '😡', '👍', '👎', '❤️', '🔥', '✨', '🎉', '💃', '🕺', '🎶'
];

const GlobalChat: React.FC = () => {
    const { messages, isOpen, toggleChat, unreadCount, sendMessage, isLoading, uploadChatImage, deleteMessage } = useChat();
    const { user } = useAuth();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showEmotes, setShowEmotes] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Deletion State
    const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Image Preview State
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Drag State
    const buttonContainerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 20, y: 20 }); // Bottom-Right offset
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;
        await sendMessage(input, 'text');
        setInput('');
        setShowEmotes(false);
    };

    const handleEmoteClick = (emote: string) => {
        sendMessage(emote, 'text'); 
        setShowEmotes(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const url = await uploadChatImage(file);
        if (url) {
            await sendMessage('Sent an image', 'image', { image_url: url });
        }
        setIsUploading(false);
        e.target.value = '';
    };

    // Handle Message Deletion Request from ChatMessageItem
    const handleRequestDelete = (messageId: string) => {
        setMessageToDelete(messageId);
    };

    // Confirm Deletion
    const handleConfirmDelete = async () => {
        if (!messageToDelete) return;
        setIsDeleting(true);
        await deleteMessage(messageToDelete);
        setIsDeleting(false);
        setMessageToDelete(null);
    };

    // --- Drag Logic (Mouse) ---
    const handleMouseDown = (e: React.MouseEvent) => {
        // Stop propagation to avoid closing chat if dragging
        e.stopPropagation();
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
    };

    // --- Drag Logic (Touch/Mobile) ---
    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        const touch = e.touches[0];
        dragStart.current = { x: touch.clientX, y: touch.clientY };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = dragStart.current.x - e.clientX;
            const dy = dragStart.current.y - e.clientY;
            
            setPosition(prev => ({
                x: Math.max(10, Math.min(window.innerWidth - 60, prev.x + dx)),
                y: Math.max(10, Math.min(window.innerHeight - 60, prev.y + dy))
            }));
            
            dragStart.current = { x: e.clientX, y: e.clientY };
        };

        const handleTouchMove = (e: TouchEvent) => {
             if (!isDragging) return;
             e.preventDefault(); // Prevent scrolling while dragging
             const touch = e.touches[0];
             const dx = dragStart.current.x - touch.clientX;
             const dy = dragStart.current.y - touch.clientY;
             
             setPosition(prev => ({
                 x: Math.max(10, Math.min(window.innerWidth - 60, prev.x + dx)),
                 y: Math.max(10, Math.min(window.innerHeight - 60, prev.y + dy))
             }));
             
             dragStart.current = { x: touch.clientX, y: touch.clientY };
        };

        const handleEnd = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging]);

    if (!user) return null;

    // Mock Image Object for Modal
    const modalImage = previewImage ? {
        id: 'chat-preview',
        user_id: '',
        prompt: 'Ảnh từ Chat',
        image_url: previewImage,
        model_used: 'Chat',
        created_at: new Date().toISOString(),
        creator: { display_name: 'Chat User', photo_url: '', level: 1 }
    } : null;

    return (
        <>
            {/* Image Preview Modal */}
            <ImageModal 
                isOpen={!!previewImage}
                onClose={() => setPreviewImage(null)}
                image={modalImage}
                showInfoPanel={false}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!messageToDelete}
                onClose={() => setMessageToDelete(null)}
                onConfirm={handleConfirmDelete}
                cost={0}
                isLoading={isDeleting}
            />

            {/* Draggable Chat Toggle Button Container */}
            <div
                ref={buttonContainerRef}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onClick={(e) => {
                    e.stopPropagation(); // Stop from closing
                    if (!isDragging) toggleChat();
                }}
                style={{ bottom: `${position.y}px`, right: `${position.x}px` }}
                className="fixed z-[90] cursor-move active:cursor-grabbing touch-none group flex flex-col items-center justify-center gap-1"
            >
                {/* Main Button */}
                <div className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-transform duration-200 hover:scale-110
                    ${isOpen 
                        ? 'bg-gradient-to-br from-red-500 to-pink-600 shadow-[0_0_30px_rgba(239,68,68,0.6)]' 
                        : 'bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 shadow-[0_0_30px_rgba(6,182,212,0.6)]'
                    } border-2 border-white/50 backdrop-blur-md`}>
                    
                    {/* Ripple Effect */}
                    {!isOpen && (
                        <span className="absolute inset-0 rounded-full border-2 border-cyan-400 opacity-75 animate-ping"></span>
                    )}

                    {isOpen ? (
                        <i className="ph-fill ph-x text-white text-3xl"></i>
                    ) : (
                        <i className="ph-fill ph-chats-teardrop text-white text-4xl animate-pulse drop-shadow-md"></i>
                    )}
                    
                    {/* Badge */}
                    {!isOpen && unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold flex items-center justify-center rounded-full animate-bounce shadow-lg border-2 border-white">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </div>

                {/* Label */}
                {!isOpen && (
                    <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md text-[10px] font-bold text-white shadow-sm border border-white/10 pointer-events-none select-none">
                        Chatbox
                    </span>
                )}
            </div>

            {/* Chat Window (Glassmorphism) */}
            <div 
                className={`fixed top-0 right-0 h-full w-full sm:w-[380px] z-[80] chat-glass shadow-2xl transition-transform duration-300 ease-in-out transform flex flex-col
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
                // Stop propagation to prevent unintended closes from ANY parent click listeners
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 bg-gradient-to-r from-transparent via-white/5 to-transparent">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2 drop-shadow-md">
                        <i className="ph-fill ph-chats-circle text-cyan-400 animate-spin-slow"></i>
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-pink-300 to-purple-300">Chém Gió & Tán Gẫu</span>
                    </h3>
                    <div className="flex items-center gap-2 bg-black/30 px-2 py-1 rounded-full border border-white/5">
                         <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                         <span className="text-[10px] text-green-400 font-mono tracking-widest">LIVE</span>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-grow overflow-y-auto chat-no-scrollbar p-4 space-y-4 scroll-smooth" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(236, 72, 153, 0.05) 0%, transparent 70%)' }}>
                    {isLoading && (
                        <div className="flex justify-center py-4">
                            <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                    
                    {messages.map((msg) => (
                        <ChatMessageItem 
                            key={msg.id} 
                            message={msg} 
                            isOwn={msg.user_id === user.id} 
                            onImageClick={(url) => setPreviewImage(url)}
                            onDeleteMessage={handleRequestDelete}
                        />
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-black/40 border-t border-white/10 backdrop-blur-xl">
                     {/* Emote Picker */}
                    {showEmotes && (
                        <div className="absolute bottom-[80px] left-4 right-4 bg-[#1e1b25]/95 border border-white/10 p-3 grid grid-cols-6 gap-2 rounded-xl shadow-2xl animate-fade-in-up z-10 backdrop-blur-xl">
                            {EMOTES.map(emote => (
                                <button key={emote} onClick={() => handleEmoteClick(emote)} className="text-2xl hover:bg-white/10 rounded p-1 transition hover:scale-125">
                                    {emote}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    <form onSubmit={handleSend} className="flex items-center gap-2">
                        {/* Attachment Button */}
                        <label className="p-2 text-cyan-400 hover:text-cyan-300 transition cursor-pointer hover:bg-white/5 rounded-full">
                            {isUploading ? <i className="ph ph-spinner animate-spin text-xl"></i> : <i className="ph-fill ph-image text-xl"></i>}
                            <input type="file" accept="image/png, image/jpeg, image/gif" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                        </label>

                        <div className="flex-grow relative">
                             <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Nhập tin nhắn..."
                                className="w-full bg-white/5 border border-white/10 rounded-full pl-4 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition shadow-inner"
                            />
                             <button 
                                type="button" 
                                onClick={() => setShowEmotes(!showEmotes)}
                                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-yellow-400 transition ${showEmotes ? 'text-yellow-400' : ''}`}
                            >
                                <i className="ph-fill ph-smiley text-xl"></i>
                            </button>
                        </div>
                       
                        <button 
                            type="submit" 
                            disabled={!input.trim()}
                            className="p-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-full hover:shadow-lg hover:shadow-pink-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition transform active:scale-95"
                        >
                            <i className="ph-fill ph-paper-plane-right text-lg"></i>
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
};

export default GlobalChat;
