
import React, { useRef, useEffect, useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import ChatMessageItem from './ChatMessage';

const EMOTES = [
    '😀', '😂', '😍', '😎', '😭', '😡', '👍', '👎', '❤️', '🔥', '✨', '🎉', '💃', '🕺', '🎶'
];

const GlobalChat: React.FC = () => {
    const { messages, isOpen, toggleChat, unreadCount, sendMessage, isLoading, uploadChatImage } = useChat();
    const { user } = useAuth();
    const { theme } = useTheme();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showEmotes, setShowEmotes] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Drag State
    const bubbleRef = useRef<HTMLButtonElement>(null);
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

    // --- Drag Logic ---
    const handleMouseDown = (e: React.MouseEvent) => {
        // Only allow drag if not toggling (simple heuristic: check movement)
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = dragStart.current.x - e.clientX;
            const dy = dragStart.current.y - e.clientY;
            
            setPosition(prev => ({
                x: Math.max(20, prev.x + dx),
                y: Math.max(20, prev.y + dy)
            }));
            
            dragStart.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Dynamic Icon based on Theme
    const getThemeIcon = () => {
        switch(theme) {
            case 'cyber-punk': return 'ph-robot';
            case 'solar-flare': return 'ph-sun-horizon';
            case 'neon-vibe': return 'ph-lightning';
            case 'dreamy-galaxy': return 'ph-planet';
            default: return 'ph-chats-teardrop';
        }
    }

    if (!user) return null;

    return (
        <>
            {/* Draggable Chat Toggle Button */}
            <button
                ref={bubbleRef}
                onMouseDown={handleMouseDown}
                onClick={() => !isDragging && toggleChat()}
                style={{ bottom: `${position.y}px`, right: `${position.x}px` }}
                className={`fixed z-[90] w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(236,72,153,0.6)] transition-transform duration-200 hover:scale-110 cursor-move active:cursor-grabbing
                    ${isOpen ? 'bg-gradient-to-br from-red-500 to-pink-600 rotate-90' : 'chat-bubble-user border-2 border-white/20 backdrop-blur-md'}`}
            >
                {isOpen ? (
                    <i className="ph-fill ph-x text-white text-2xl"></i>
                ) : (
                    <i className={`ph-fill ${getThemeIcon()} text-white text-3xl animate-pulse`}></i>
                )}
                
                {!isOpen && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold flex items-center justify-center rounded-full animate-bounce shadow-lg border border-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Chat Window (Glassmorphism) */}
            <div 
                className={`fixed top-0 right-0 h-full w-full sm:w-[380px] z-[80] chat-glass shadow-2xl transition-transform duration-300 ease-in-out transform flex flex-col
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 bg-gradient-to-r from-transparent via-white/5 to-transparent">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2 drop-shadow-md">
                        <i className="ph-fill ph-globe-hemisphere-east text-cyan-400 animate-spin-slow"></i>
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-pink-300 to-purple-300">Global Chat</span>
                    </h3>
                    <div className="flex items-center gap-2 bg-black/30 px-2 py-1 rounded-full border border-white/5">
                         <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                         <span className="text-[10px] text-green-400 font-mono tracking-widest">LIVE</span>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-4 scroll-smooth" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(236, 72, 153, 0.05) 0%, transparent 70%)' }}>
                    {isLoading && (
                        <div className="flex justify-center py-4">
                            <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                    
                    {messages.map((msg) => (
                        <ChatMessageItem key={msg.id} message={msg} isOwn={msg.user_id === user.id} />
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
                                placeholder="Chat..."
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
