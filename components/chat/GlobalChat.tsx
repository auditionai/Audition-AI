
import React, { useRef, useEffect, useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import ChatMessageItem from './ChatMessage';

const EMOTES = [
    '😀', '😂', '😍', '😎', '😭', '😡', '👍', '👎', '❤️', '🔥', '✨', '🎉', '💃', '🕺', '🎶'
];

const GlobalChat: React.FC = () => {
    const { messages, isOpen, toggleChat, unreadCount, sendMessage, isLoading } = useChat();
    const { user } = useAuth();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showEmotes, setShowEmotes] = useState(false);

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
    };

    const handleEmoteClick = (emote: string) => {
        sendMessage(emote, 'text'); // Or separate type if needed
        setShowEmotes(false);
    };

    if (!user) return null;

    return (
        <>
            {/* Chat Toggle Button */}
            <div className="fixed bottom-20 right-4 z-[90] md:bottom-6 md:right-6">
                <button
                    onClick={toggleChat}
                    className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 interactive-3d
                        ${isOpen ? 'bg-pink-500 rotate-90' : 'bg-black/60 backdrop-blur-md border border-pink-500/50'}`}
                >
                    {isOpen ? (
                        <i className="ph-fill ph-x text-white text-xl"></i>
                    ) : (
                        <i className="ph-fill ph-chats-circle text-pink-400 text-3xl animate-pulse"></i>
                    )}
                    
                    {!isOpen && unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold flex items-center justify-center rounded-full animate-bounce shadow-lg">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Chat Window */}
            <div 
                className={`fixed top-0 right-0 h-full w-full sm:w-[350px] z-[80] bg-black/40 backdrop-blur-md border-l border-white/10 shadow-2xl transition-transform duration-300 ease-in-out transform flex flex-col
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 bg-black/20">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <i className="ph-fill ph-globe-hemisphere-east text-cyan-400"></i>
                        Global Chat
                    </h3>
                    <div className="flex items-center gap-2">
                         <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                         <span className="text-xs text-green-400 font-mono">LIVE</span>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-4 scroll-smooth">
                    {isLoading && (
                        <div className="flex justify-center py-4">
                            <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                    
                    {messages.map((msg) => (
                        <ChatMessageItem key={msg.id} message={msg} isOwn={msg.user_id === user.id} />
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-black/30 border-t border-white/10 relative">
                    {showEmotes && (
                        <div className="absolute bottom-full left-0 w-full bg-[#1e1b25] border-t border-white/10 p-2 grid grid-cols-5 gap-2 animate-fade-in-up">
                            {EMOTES.map(emote => (
                                <button key={emote} onClick={() => handleEmoteClick(emote)} className="text-2xl hover:bg-white/10 rounded p-1 transition">
                                    {emote}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    <form onSubmit={handleSend} className="flex gap-2">
                        <button 
                            type="button" 
                            onClick={() => setShowEmotes(!showEmotes)}
                            className={`p-2 text-gray-400 hover:text-yellow-400 transition ${showEmotes ? 'text-yellow-400' : ''}`}
                        >
                            <i className="ph-fill ph-smiley text-2xl"></i>
                        </button>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Chat..."
                            className="flex-grow bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500 transition"
                        />
                        <button 
                            type="submit" 
                            disabled={!input.trim()}
                            className="p-2 bg-pink-500 text-white rounded-full hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-pink-500/30"
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
