
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CreatorHeader from '../components/creator/CreatorHeader';
import BottomNavBar from '../components/common/BottomNavBar';
import UserAvatar from '../components/common/UserAvatar';
import { Conversation, DirectMessage } from '../types';

const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

const MessagesPage: React.FC = () => {
    const { user, supabase, navigate } = useAuth();
    const { theme } = useTheme();
    
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoadingConvs, setIsLoadingConvs] = useState(true);
    const [isLoadingActiveConv, setIsLoadingActiveConv] = useState(false); // New loading state for active conv
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initialize ID from URL on mount
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const convId = urlParams.get('conversationId');
        if (convId) {
            setActiveConversationId(convId);
        }
    }, []);

    // Fetch All Conversations
    useEffect(() => {
        if (!supabase || !user) return;
        
        const fetchConversations = async () => {
            setIsLoadingConvs(true);
            // FIX: Added 'created_at' to select query to match Conversation type
            const { data, error } = await supabase
                .from('conversations')
                .select(`
                    id, created_at, updated_at,
                    participants:conversation_participants(
                        user_id,
                        user:users(id, display_name, photo_url)
                    )
                `)
                .order('updated_at', { ascending: false });
            
            if (error) {
                console.error("Error fetching conversations:", error);
            } else {
                const formatted = data.map((c: any) => {
                    let otherParticipant = c.participants.find((p: any) => p.user_id !== user.id);
                    
                    // Handle System/Deleted Users fallback
                    if (!otherParticipant) {
                        if (c.participants.length >= 1) {
                             // If it's a valid conversation but the other user is missing (e.g. RLS hidden or deleted),
                             // check if it might be the System Bot or just an unknown user.
                             otherParticipant = {
                                user_id: SYSTEM_BOT_ID, 
                                user: {
                                    id: SYSTEM_BOT_ID,
                                    display_name: 'HỆ THỐNG',
                                    photo_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=System'
                                }
                            };
                        }
                    } 
                    
                    if (otherParticipant && !otherParticipant.user) {
                        otherParticipant.user = {
                            id: otherParticipant.user_id,
                            display_name: 'Người dùng ẩn',
                            photo_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Unknown'
                        };
                    }

                    return {
                        ...c,
                        participants: otherParticipant ? [{ user: otherParticipant.user }] : []
                    };
                }).filter((c: any) => c.participants.length > 0);

                setConversations(formatted);
            }
            setIsLoadingConvs(false);
        };
        
        fetchConversations();

        const channel = supabase.channel('public:conversations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, 
                () => fetchConversations()
            )
            .subscribe();
            
        return () => { supabase.removeChannel(channel); };
    }, [supabase, user]);

    // CRITICAL FIX: Fetch Active Conversation Individually if Missing
    useEffect(() => {
        if (!activeConversationId || !supabase || !user) return;
        
        const exists = conversations.some(c => c.id === activeConversationId);
        
        // Only fetch if not exists AND we aren't already loading fetching all (to avoid duplicate)
        // But importantly, if we have an ID, we MUST try to resolve it to a partner.
        if (!exists) {
            console.log(`[Messages] Active conversation ${activeConversationId} missing from list. Fetching manually...`);
            setIsLoadingActiveConv(true);
            
            const fetchSingle = async () => {
                try {
                    const { data, error } = await supabase
                        .from('conversations')
                        .select(`
                            id, created_at, updated_at,
                            participants:conversation_participants(
                                user_id,
                                user:users(id, display_name, photo_url)
                            )
                        `)
                        .eq('id', activeConversationId)
                        .single();
                    
                    if (data && !error) {
                        const foundParticipant = data.participants.find((p: any) => p.user_id !== user.id);
                        
                        // Fallback logic similar to main fetch
                        const otherParticipant = foundParticipant || {
                            user_id: SYSTEM_BOT_ID,
                            user: {
                                id: SYSTEM_BOT_ID,
                                display_name: 'HỆ THỐNG', 
                                photo_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=System'
                            }
                        };

                        const participantUser = otherParticipant.user || { id: otherParticipant.user_id, display_name: 'Người dùng', photo_url: '' };

                        const newConv = {
                            id: data.id,
                            created_at: data.created_at,
                            updated_at: data.updated_at,
                            participants: [{ user: participantUser }]
                        };
                        
                        setConversations(prev => {
                            // Avoid duplicates
                            if (prev.some(c => c.id === newConv.id)) return prev;
                            return [newConv as unknown as Conversation, ...prev];
                        });
                    } else {
                        console.error("Could not fetch active conversation details", error);
                    }
                } finally {
                    setIsLoadingActiveConv(false);
                }
            };
            fetchSingle();
        }
    }, [activeConversationId, conversations, supabase, user]);


    // Fetch Messages for Active ID
    useEffect(() => {
        if (!activeConversationId || !supabase) return;
        
        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('direct_messages')
                .select('*')
                .eq('conversation_id', activeConversationId)
                .order('created_at', { ascending: true });
            
            if (error) console.error("Error fetching messages:", error);
            else setMessages(data as DirectMessage[]);
            scrollToBottom();
        };
        fetchMessages();

        const channel = supabase.channel(`chat:${activeConversationId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'direct_messages', 
                filter: `conversation_id=eq.${activeConversationId}` 
            }, (payload) => {
                setMessages(prev => [...prev, payload.new as DirectMessage]);
                scrollToBottom();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [activeConversationId, supabase]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !activeConversationId || !user || !supabase) return;

        const content = input.trim();
        setInput('');

        try {
            await supabase.from('direct_messages').insert({
                conversation_id: activeConversationId,
                sender_id: user.id,
                content: content,
                type: 'text'
            });
            
            await supabase.from('conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', activeConversationId);

        } catch (error) {
            console.error("Send error:", error);
        }
    };

    const activeConv = conversations.find(c => c.id === activeConversationId);
    const chatPartner = activeConv?.participants[0]?.user;
    
    const isSystemChat = chatPartner?.id === SYSTEM_BOT_ID || chatPartner?.display_name === 'HỆ THỐNG';

    return (
        <div data-theme={theme} className="flex flex-col h-screen bg-skin-fill text-skin-base">
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="messages" onNavigate={navigate} onCheckInClick={() => {}} />
            
            <div className="flex flex-grow pt-20 overflow-hidden container mx-auto max-w-6xl px-0 md:px-4 pb-16 md:pb-4 gap-4">
                
                {/* Sidebar */}
                <div className={`w-full md:w-80 bg-skin-fill-secondary md:rounded-xl border-r md:border border-skin-border flex flex-col ${activeConversationId ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b border-skin-border font-bold text-lg">Hộp Thư</div>
                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                        {isLoadingConvs ? (
                            <div className="p-4 text-center text-skin-muted">Đang tải...</div>
                        ) : conversations.length === 0 ? (
                            <div className="p-8 text-center text-skin-muted">Chưa có tin nhắn nào.</div>
                        ) : (
                            conversations.map(conv => {
                                const partner = conv.participants[0]?.user;
                                const isSystem = partner?.id === SYSTEM_BOT_ID || partner?.display_name === 'HỆ THỐNG';
                                return (
                                    <div 
                                        key={conv.id}
                                        onClick={() => setActiveConversationId(conv.id)}
                                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors ${activeConversationId === conv.id ? 'bg-skin-accent/10 border-l-4 border-skin-accent' : ''}`}
                                    >
                                        <UserAvatar url={partner?.photo_url || ''} alt={partner?.display_name || 'User'} size="md" />
                                        <div className="flex-grow min-w-0">
                                            <div className="flex items-center gap-1">
                                                <p className={`font-bold text-sm truncate ${isSystem ? 'text-yellow-400' : ''}`}>{partner?.display_name}</p>
                                                {isSystem && <i className="ph-fill ph-seal-check text-blue-400 text-xs"></i>}
                                            </div>
                                            <p className="text-xs text-skin-muted truncate">{isSystem ? 'Thông báo từ hệ thống' : 'Nhấn để xem tin nhắn'}</p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Chat Area */}
                <div className={`flex-grow flex flex-col bg-skin-fill-secondary md:rounded-xl border border-skin-border overflow-hidden ${!activeConversationId ? 'hidden md:flex' : 'flex'}`}>
                    {/* 1. Valid Active Conversation */}
                    {activeConversationId && chatPartner ? (
                        <>
                            {/* Header */}
                            <div className="p-3 border-b border-skin-border flex items-center gap-3 bg-skin-fill/50">
                                <button onClick={() => setActiveConversationId(null)} className="md:hidden text-xl p-2"><i className="ph-fill ph-caret-left"></i></button>
                                <UserAvatar url={chatPartner.photo_url} alt={chatPartner.display_name} size="sm" />
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1">
                                        <span className={`font-bold ${isSystemChat ? 'text-yellow-400' : ''}`}>{chatPartner.display_name}</span>
                                        {isSystemChat && <span className="bg-blue-500 text-white text-[10px] px-1 rounded font-bold">OFFICIAL</span>}
                                    </div>
                                    {isSystemChat && <span className="text-[10px] text-skin-muted">Kênh thông báo tự động</span>}
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

                            {/* Input (Hide for System Chat) */}
                            {!isSystemChat ? (
                                <form onSubmit={handleSendMessage} className="p-3 border-t border-skin-border flex gap-2 bg-skin-fill/50">
                                    <input 
                                        type="text" 
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Nhập tin nhắn..."
                                        className="flex-grow bg-skin-fill border border-skin-border rounded-full px-4 py-2 text-sm focus:border-skin-accent focus:outline-none"
                                    />
                                    <button type="submit" disabled={!input.trim()} className="bg-skin-accent text-white p-2 rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-50">
                                        <i className="ph-fill ph-paper-plane-right"></i>
                                    </button>
                                </form>
                            ) : (
                                <div className="p-3 border-t border-skin-border text-center text-xs text-skin-muted bg-skin-fill/50">
                                    Đây là kênh thông báo một chiều từ hệ thống.
                                </div>
                            )}
                        </>
                    ) : activeConversationId && isLoadingActiveConv ? (
                        // 2. Loading State
                        <div className="flex-grow flex items-center justify-center text-skin-muted">
                            <div className="text-center">
                                <div className="w-8 h-8 border-4 border-skin-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                <p>Đang kết nối cuộc trò chuyện...</p>
                            </div>
                        </div>
                    ) : (
                        // 3. Empty State
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
