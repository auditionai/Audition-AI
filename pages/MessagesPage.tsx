
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CreatorHeader from '../components/creator/CreatorHeader';
import BottomNavBar from '../components/common/BottomNavBar';
import UserAvatar from '../components/common/UserAvatar';
import UserName from '../components/common/UserName'; // Import UserName
import UserBadge from '../components/common/UserBadge'; // Import UserBadge
import { Conversation, DirectMessage } from '../types';
import { calculateLevelFromXp } from '../utils/rankUtils';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

const MessagesPage: React.FC = () => {
    const { user, navigate, showToast, session } = useAuth();
    const { theme } = useTheme();
    
    const [conversations, setConversations] = useState<(Conversation & { unread_count?: number })[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoadingConvs, setIsLoadingConvs] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 1. Lấy ID từ URL
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const convId = urlParams.get('conversationId');
        if (convId) {
            setActiveConversationId(convId);
        }
    }, []);

    // 2. Load danh sách hội thoại
    const fetchConversations = useCallback(async () => {
        if (!session) return;
        if (conversations.length === 0) setIsLoadingConvs(true);
        
        try {
            const res = await fetch('/.netlify/functions/get-conversations', {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (!res.ok) throw new Error('Failed to load conversations');
            const data = await res.json();
            setConversations(data);
        } catch (error) {
            console.error("Error loading conversations:", error);
        } finally {
            setIsLoadingConvs(false);
        }
    }, [session]);

    useEffect(() => {
        fetchConversations();
        const interval = setInterval(fetchConversations, 10000);
        return () => clearInterval(interval);
    }, [fetchConversations]);

    // 3. Mark Read Function
    const markAsRead = async (convId: string) => {
        if (!session) return;
        try {
            await fetch('/.netlify/functions/mark-conversation-read', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}` 
                },
                body: JSON.stringify({ conversationId: convId })
            });
            
            setConversations(prev => prev.map(c => 
                c.id === convId ? { ...c, unread_count: 0 } : c
            ));
            
        } catch (e) {
            console.error("Mark read failed:", e);
        }
    };

    // 4. Load tin nhắn & Mark Read khi chọn hội thoại
    useEffect(() => {
        if (!activeConversationId || !session) return;
        
        markAsRead(activeConversationId);

        const fetchMessages = async () => {
            try {
                const res = await fetch(`/.netlify/functions/get-messages?conversationId=${activeConversationId}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data);
                    scrollToBottom();
                } else if (res.status === 403) {
                    showToast("Bạn không có quyền xem cuộc trò chuyện này.", "error");
                }
            } catch (error) {
                console.error("Network error fetching messages:", error);
            }
        };

        fetchMessages();
        
        const msgInterval = setInterval(fetchMessages, 3000);
        return () => clearInterval(msgInterval);

    }, [activeConversationId, session]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    // 5. Gửi tin nhắn
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !activeConversationId || !session) return;

        const content = input.trim();
        setInput('');
        setIsSending(true);

        try {
            const res = await fetch('/.netlify/functions/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    conversationId: activeConversationId,
                    content: content
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gửi lỗi');

            setMessages(prev => [...prev, data]);
            scrollToBottom();

        } catch (error: any) {
            showToast(`Gửi thất bại: ${error.message}`, 'error');
            setInput(content);
        } finally {
            setIsSending(false);
        }
    };

    const activeConv = conversations.find(c => c.id === activeConversationId);
    // Fix: Cast fallback object to any to prevent TypeScript errors about missing properties
    const displayPartner = activeConv?.participants[0]?.user || { 
        display_name: 'Đang tải...', 
        photo_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Loading', 
        id: 'loading' 
    } as any;
    
    const isSystemChat = displayPartner?.id === SYSTEM_BOT_ID || displayPartner?.display_name === 'HỆ THỐNG';
    const partnerLevel = displayPartner.xp ? calculateLevelFromXp(displayPartner.xp) : 1;

    return (
        <div data-theme={theme} className="flex flex-col h-screen bg-skin-fill text-skin-base">
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="messages" onNavigate={navigate} onCheckInClick={() => {}} />
            
            <div className="flex flex-grow pt-20 overflow-hidden container mx-auto max-w-6xl px-0 md:px-4 pb-16 md:pb-4 gap-4">
                
                {/* Sidebar (List) */}
                <div className={`w-full md:w-80 bg-skin-fill-secondary md:rounded-xl border-r md:border border-skin-border flex flex-col ${activeConversationId ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b border-skin-border font-bold text-lg flex justify-between items-center">
                        Hộp Thư
                    </div>
                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                        {isLoadingConvs && conversations.length === 0 ? (
                            <div className="p-4 text-center text-skin-muted">Đang tải...</div>
                        ) : conversations.length === 0 ? (
                            <div className="p-8 text-center text-skin-muted">Chưa có tin nhắn nào.</div>
                        ) : (
                            conversations.map(conv => {
                                const partner = conv.participants[0]?.user;
                                const isSystem = partner?.id === SYSTEM_BOT_ID || partner?.display_name === 'HỆ THỐNG';
                                const hasUnread = (conv.unread_count || 0) > 0;
                                const pLevel = partner?.xp ? calculateLevelFromXp(partner.xp) : 1;

                                return (
                                    <div 
                                        key={conv.id}
                                        onClick={() => setActiveConversationId(conv.id)}
                                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors relative ${activeConversationId === conv.id ? 'bg-skin-accent/10 border-l-4 border-skin-accent' : ''}`}
                                    >
                                        <div className="relative">
                                            <UserAvatar 
                                                url={partner?.photo_url || ''} 
                                                alt={partner?.display_name || 'User'} 
                                                frameId={partner?.equipped_frame_id} 
                                                level={pLevel}
                                                size="md" 
                                            />
                                            {hasUnread && (
                                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full border border-[#1E1B25]">
                                                    {conv.unread_count}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-grow min-w-0">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 overflow-hidden">
                                                    <UserName user={partner} className={`font-bold text-sm truncate ${isSystem ? 'text-yellow-400' : 'text-skin-base'} ${hasUnread ? 'text-white' : ''}`} />
                                                    {!isSystem && <UserBadge titleId={partner?.equipped_title_id} level={pLevel} className="scale-75 origin-left flex-shrink-0" />}
                                                    {isSystem && <i className="ph-fill ph-seal-check text-blue-400 text-xs"></i>}
                                                </div>
                                                <span className="text-[10px] text-skin-muted flex-shrink-0">{new Date(conv.updated_at).toLocaleDateString('vi-VN', {day: 'numeric', month: 'numeric'})}</span>
                                            </div>
                                            <p className={`text-xs truncate ${hasUnread ? 'text-white font-bold' : 'text-skin-muted'}`}>
                                                {isSystem ? 'Thông báo từ hệ thống' : (hasUnread ? 'Tin nhắn mới' : 'Nhấn để xem tin nhắn')}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Chat Window */}
                <div className={`flex-grow flex flex-col bg-skin-fill-secondary md:rounded-xl border border-skin-border overflow-hidden ${!activeConversationId ? 'hidden md:flex' : 'flex'}`}>
                    {activeConversationId ? (
                        <>
                            {/* Chat Header */}
                            <div className="p-3 border-b border-skin-border flex items-center gap-3 bg-skin-fill/50">
                                <button onClick={() => setActiveConversationId(null)} className="md:hidden text-xl p-2"><i className="ph-fill ph-caret-left"></i></button>
                                <UserAvatar 
                                    url={displayPartner?.photo_url || ''} 
                                    alt={displayPartner?.display_name || ''} 
                                    frameId={displayPartner?.equipped_frame_id}
                                    level={partnerLevel}
                                    size="sm" 
                                />
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <UserName 
                                            user={displayPartner} 
                                            className={`font-bold ${isSystemChat ? 'text-yellow-400' : ''}`} 
                                        />
                                        {!isSystemChat && <UserBadge titleId={displayPartner?.equipped_title_id} level={partnerLevel} className="scale-75 origin-left" />}
                                        {isSystemChat && <span className="bg-blue-500 text-white text-[10px] px-1 rounded font-bold">OFFICIAL</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-black/20">
                                {messages.map(msg => {
                                    const isOwn = msg.sender_id === user?.id;
                                    return (
                                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm shadow-sm ${
                                                isOwn ? 'bg-skin-accent text-white rounded-br-none' : 
                                                (isSystemChat ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-100 rounded-bl-none' : 'bg-skin-fill border border-skin-border rounded-bl-none')
                                            }`}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input Area */}
                            {!isSystemChat ? (
                                <form onSubmit={handleSendMessage} className="p-3 border-t border-skin-border flex gap-2 bg-skin-fill/50">
                                    <input 
                                        type="text" 
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Nhập tin nhắn..."
                                        className="flex-grow bg-skin-fill border border-skin-border rounded-full px-4 py-2 text-sm focus:border-skin-accent focus:outline-none"
                                        disabled={isSending}
                                    />
                                    <button type="submit" disabled={!input.trim() || isSending} className="bg-skin-accent text-white p-2 rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-50 hover:bg-skin-accent/80 transition">
                                        {isSending ? <i className="ph ph-spinner animate-spin"></i> : <i className="ph-fill ph-paper-plane-right"></i>}
                                    </button>
                                </form>
                            ) : (
                                <div className="p-3 border-t border-skin-border text-center text-xs text-skin-muted bg-skin-fill/50">
                                    Đây là kênh thông báo một chiều từ hệ thống.
                                </div>
                            )}
                        </>
                    ) : (
                        // Empty State
                        <div className="flex-grow flex items-center justify-center text-skin-muted">
                            <div className="text-center">
                                <i className="ph-fill ph-chats-teardrop text-6xl mb-4 opacity-50"></i>
                                <p>Chọn một cuộc trò chuyện để bắt đầu</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <BottomNavBar activeTab="messages" onTabChange={navigate} onCheckInClick={() => {}} />
        </div>
    );
};

export default MessagesPage;
