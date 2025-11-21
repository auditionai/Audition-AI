
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CreatorHeader from '../components/creator/CreatorHeader';
import BottomNavBar from '../components/common/BottomNavBar';
import UserAvatar from '../components/common/UserAvatar';
import { Conversation, DirectMessage } from '../types';

const MessagesPage: React.FC = () => {
    const { user, supabase, navigate } = useAuth();
    const { theme } = useTheme();
    
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoadingConvs, setIsLoadingConvs] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Parse URL query param
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const convId = urlParams.get('conversationId');
        if (convId) {
            setActiveConversationId(convId);
        }
    }, []);

    // Fetch Conversations
    useEffect(() => {
        if (!supabase || !user) return;
        const fetchConversations = async () => {
            setIsLoadingConvs(true);
            const { data, error } = await supabase
                .from('conversations')
                .select(`
                    id, updated_at,
                    participants:conversation_participants(
                        user:users(id, display_name, photo_url)
                    )
                `)
                .order('updated_at', { ascending: false });
            
            if (error) console.error("Error fetching conversations:", error);
            else {
                // Filter out current user from participants list for display
                const formatted = data.map((c: any) => ({
                    ...c,
                    participants: c.participants.filter((p: any) => p.user.id !== user.id)
                }));
                setConversations(formatted);
            }
            setIsLoadingConvs(false);
        };
        fetchConversations();

        // Subscribe to new messages to update conversation list ordering
        const channel = supabase.channel('public:conversations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, 
                () => fetchConversations()
            )
            .subscribe();
            
        return () => { supabase.removeChannel(channel); };
    }, [supabase, user]);

    // Fetch Messages for Active Conversation
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
            
            // Update conversation timestamp
            await supabase.from('conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', activeConversationId);

        } catch (error) {
            console.error("Send error:", error);
        }
    };

    const activeConv = conversations.find(c => c.id === activeConversationId);
    const chatPartner = activeConv?.participants[0]?.user;

    return (
        <div data-theme={theme} className="flex flex-col h-screen bg-skin-fill text-skin-base">
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="tool" onNavigate={navigate} onCheckInClick={() => {}} />
            
            <div className="flex flex-grow pt-20 overflow-hidden container mx-auto max-w-6xl px-0 md:px-4 pb-16 md:pb-4 gap-4">
                
                {/* Sidebar: Conversation List */}
                <div className={`w-full md:w-80 bg-skin-fill-secondary md:rounded-xl border-r md:border border-skin-border flex flex-col ${activeConversationId ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b border-skin-border font-bold text-lg">Tin Nhắn</div>
                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                        {isLoadingConvs ? (
                            <div className="p-4 text-center text-skin-muted">Đang tải...</div>
                        ) : conversations.length === 0 ? (
                            <div className="p-8 text-center text-skin-muted">Chưa có tin nhắn nào.</div>
                        ) : (
                            conversations.map(conv => {
                                const partner = conv.participants[0]?.user;
                                return (
                                    <div 
                                        key={conv.id}
                                        onClick={() => setActiveConversationId(conv.id)}
                                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors ${activeConversationId === conv.id ? 'bg-skin-accent/10 border-l-4 border-skin-accent' : ''}`}
                                    >
                                        <UserAvatar url={partner?.photo_url || ''} alt={partner?.display_name || 'User'} size="md" />
                                        <div className="flex-grow min-w-0">
                                            <p className="font-bold text-sm truncate">{partner?.display_name}</p>
                                            <p className="text-xs text-skin-muted truncate">Nhấn để xem tin nhắn</p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Chat Area */}
                <div className={`flex-grow flex flex-col bg-skin-fill-secondary md:rounded-xl border border-skin-border overflow-hidden ${!activeConversationId ? 'hidden md:flex' : 'flex'}`}>
                    {activeConversationId && chatPartner ? (
                        <>
                            {/* Chat Header */}
                            <div className="p-3 border-b border-skin-border flex items-center gap-3 bg-skin-fill/50">
                                <button onClick={() => setActiveConversationId(null)} className="md:hidden text-xl p-2"><i className="ph-fill ph-caret-left"></i></button>
                                <UserAvatar url={chatPartner.photo_url} alt={chatPartner.display_name} size="sm" />
                                <span className="font-bold">{chatPartner.display_name}</span>
                            </div>

                            {/* Messages */}
                            <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-black/20">
                                {messages.map(msg => {
                                    const isOwn = msg.sender_id === user?.id;
                                    return (
                                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${isOwn ? 'bg-skin-accent text-white rounded-br-none' : 'bg-skin-fill border border-skin-border rounded-bl-none'}`}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <form onSubmit={handleSendMessage} className="p-3 border-t border-skin-border flex gap-2 bg-skin-fill/50">
                                <input 
                                    type="text" 
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Nhập tin nhắn..."
                                    className="flex-grow bg-skin-fill border border-skin-border rounded-full px-4 py-2 text-sm focus:border-skin-accent focus:outline-none"
                                />
                                <button 
                                    type="submit"
                                    disabled={!input.trim()}
                                    className="bg-skin-accent text-white p-2 rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-50"
                                >
                                    <i className="ph-fill ph-paper-plane-right"></i>
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-grow flex items-center justify-center text-skin-muted">
                            <div className="text-center">
                                <i className="ph-fill ph-chats-teardrop text-6xl mb-4 opacity-50"></i>
                                <p>Chọn một cuộc trò chuyện để bắt đầu</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <BottomNavBar activeTab="tool" onTabChange={navigate} onCheckInClick={() => {}} />
        </div>
    );
};

export default MessagesPage;
