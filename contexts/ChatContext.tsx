
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useAuth } from './AuthContext';
import { ChatMessage, ChatConfig, User } from '../types';
import { resizeImage } from '../utils/imageUtils';

interface ChatContextType {
    messages: ChatMessage[];
    isOpen: boolean;
    unreadCount: number;
    toggleChat: () => void;
    sendMessage: (content: string, type?: 'text' | 'image' | 'sticker', metadata?: any) => Promise<void>;
    shareImageToChat: (imageUrl: string) => Promise<void>;
    deleteMessage: (messageId: string) => Promise<void>;
    muteUser: (userId: string, minutes: number) => Promise<void>;
    isLoading: boolean;
    uploadChatImage: (file: File) => Promise<string | null>;
    chatConfig: ChatConfig;
    updateChatConfig: (newConfig: Partial<ChatConfig>) => Promise<void>;
    userProfiles: Record<string, User>; // NEW: Live user data map
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { supabase, user, showToast, session } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    
    // NEW: Live User Profiles Map for Real-time Sync
    const [userProfiles, setUserProfiles] = useState<Record<string, User>>({});
    
    // Config & Anti-spam
    const [chatConfig, setChatConfig] = useState<ChatConfig>({ forbidden_words: [], rate_limit_ms: 1000 });
    const lastMessageTime = useRef<number>(0);
    const lastMessageContent = useRef<string>("");

    // Helper to fetch and cache users
    const fetchAndCacheUsers = async (userIds: string[]) => {
        if (!supabase || userIds.length === 0) return;
        
        // Filter out IDs we already have to save bandwidth (optional, but good optimization)
        // For now, we fetch all to ensure freshness
        const uniqueIds = [...new Set(userIds)];

        try {
            const { data: users } = await supabase
                .from('users')
                .select('*')
                .in('id', uniqueIds);

            if (users) {
                setUserProfiles(prev => {
                    const next = { ...prev };
                    users.forEach((u: any) => {
                        next[u.id] = u;
                    });
                    return next;
                });
            }
        } catch (e) {
            console.error("Error fetching chat users:", e);
        }
    };

    // Fetch initial history and config
    useEffect(() => {
        if (!supabase) return;

        const fetchInitData = async () => {
            setIsLoading(true);
            try {
                const [historyRes, configRes] = await Promise.all([
                    supabase
                        .from('global_chat_messages')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .limit(50),
                    supabase.from('chat_config').select('*').single()
                ]);

                if (historyRes.data) {
                    const msgs = historyRes.data.reverse();
                    setMessages(msgs);
                    // Fetch profiles for these messages immediately
                    const userIds = msgs.map((m: any) => m.user_id);
                    fetchAndCacheUsers(userIds);
                }
                if (configRes.data) setChatConfig(configRes.data);

            } catch (err) {
                console.error("Failed to load chat data:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitData();

        // 1. Subscribe to Realtime Messages
        const messageChannel = supabase.channel('public:global_chat_messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat_messages' }, 
                async (payload) => {
                    const newMsg = payload.new as ChatMessage;
                    setMessages(prev => {
                        if (prev.find(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                    
                    // Fetch profile for new message sender (if not exists or to update)
                    await fetchAndCacheUsers([newMsg.user_id]);

                    if (!isOpen && newMsg.user_id !== user?.id) {
                        setUnreadCount(prev => prev + 1);
                    }
                }
            )
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'global_chat_messages' },
                (payload) => {
                    const updatedMsg = payload.new as ChatMessage;
                    setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
                }
            )
            .subscribe();

        // 2. Subscribe to Config Changes
        const configChannel = supabase.channel('public:chat_config')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_config' }, 
                (payload) => setChatConfig(payload.new as ChatConfig)
            )
            .subscribe();

        // 3. [CRITICAL] Subscribe to USER Changes (Sync Cosmetics Realtime)
        // This ensures when someone equips a new frame, everyone sees it instantly in chat.
        const usersChannel = supabase.channel('public:users_chat_sync')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, 
                (payload) => {
                    const updatedUser = payload.new as User;
                    // Only update if this user is already in our cache (meaning they are in the chat)
                    setUserProfiles(prev => {
                        if (prev[updatedUser.id]) {
                            return { ...prev, [updatedUser.id]: updatedUser };
                        }
                        return prev;
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(messageChannel);
            supabase.removeChannel(configChannel);
            supabase.removeChannel(usersChannel);
        };
    }, [supabase, isOpen, user?.id]);

    useEffect(() => {
        if (isOpen) setUnreadCount(0);
    }, [isOpen]);

    const toggleChat = () => setIsOpen(prev => !prev);

    const checkSpam = (content: string): boolean => {
        const now = Date.now();
        if (now - lastMessageTime.current < chatConfig.rate_limit_ms) {
            showToast("Bạn đang gửi tin quá nhanh!", "error");
            return true;
        }
        if (content === lastMessageContent.current) {
             showToast("Đừng spam tin nhắn trùng lặp!", "error");
             return true;
        }
        if (chatConfig.forbidden_words.some(word => content.toLowerCase().includes(word.toLowerCase()))) {
            showToast("Tin nhắn chứa từ khóa bị cấm.", "error");
            return true;
        }
        
        lastMessageTime.current = now;
        lastMessageContent.current = content;
        return false;
    };

    const checkBanned = async (): Promise<boolean> => {
        if (!user || !supabase) return true;
        const { data } = await supabase.from('chat_bans').select('banned_until').eq('user_id', user.id).single();
        if (data && new Date(data.banned_until) > new Date()) {
             showToast(`Bạn bị cấm chat đến ${new Date(data.banned_until).toLocaleTimeString()}`, "error");
             return true;
        }
        return false;
    };

    const sendMessage = async (content: string, type: 'text' | 'image' | 'sticker' = 'text', extraMetadata: any = {}) => {
        if (!supabase || !user) return;
        if (checkSpam(content)) return;
        if (await checkBanned()) return;

        const metadata = {
            sender_name: user.display_name,
            sender_avatar: user.photo_url,
            sender_level: user.level,
            sender_frame_id: user.equipped_frame_id,
            sender_title_id: user.equipped_title_id,
            sender_name_effect_id: user.equipped_name_effect_id,
            ...extraMetadata
        };

        try {
            await supabase.from('global_chat_messages').insert({
                user_id: user.id,
                content,
                type,
                metadata
            });
        } catch (err) {
            console.error("Failed to send message:", err);
        }
    };

    const shareImageToChat = async (imageUrl: string) => {
        await sendMessage('Shared an image', 'image', { image_url: imageUrl });
        if (!isOpen) setIsOpen(true);
    };

    const deleteMessage = async (messageId: string) => {
        if (!user || !session) {
            showToast("Bạn cần đăng nhập để thực hiện thao tác này.", "error");
            return;
        }
        
        const previousMessages = [...messages];

        setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
                return {
                    ...m,
                    is_deleted: true,
                    metadata: {
                        ...m.metadata,
                        deleted_by: user.display_name,
                        deleted_at: new Date().toISOString()
                    }
                };
            }
            return m;
        }));
        
        try {
             const response = await fetch('/.netlify/functions/delete-chat-message', {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                     'Authorization': `Bearer ${session.access_token}`
                 },
                 body: JSON.stringify({ messageId })
             });

             if (!response.ok) {
                 const resData = await response.json();
                 throw new Error(resData.error || "Server delete failed");
             }
             
             showToast("Đã xóa tin nhắn.", "success");
                
        } catch (e: any) {
            console.error("Delete message error:", e);
            showToast(e.message || "Không thể xóa tin nhắn.", "error");
            setMessages(previousMessages);
        }
    };

    const muteUser = async (userId: string, minutes: number) => {
        if (!supabase || !user) return;
        const bannedUntil = new Date(Date.now() + minutes * 60000).toISOString();
        
        const { error } = await supabase.from('chat_bans').upsert({
            user_id: userId,
            banned_until: bannedUntil,
            banned_by: user.id,
            reason: 'Admin mute'
        });
        
        if (error) {
            showToast("Lỗi khi cấm người dùng.", "error");
            console.error(error);
        } else {
            showToast(`Đã cấm người dùng trong ${minutes} phút.`, "success");
        }
    };
    
    const uploadChatImage = async (file: File): Promise<string | null> => {
         if (!session) return null;
         try {
            const { dataUrl } = await resizeImage(file, 512);
            const res = await fetch('/.netlify/functions/upload-asset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ image: dataUrl, folder: 'chat' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return data.url;
         } catch (e: any) {
             showToast(e.message, 'error');
             return null;
         }
    };

    const updateChatConfig = async (newConfig: Partial<ChatConfig>) => {
        if (!supabase) return;
        await supabase.from('chat_config').upsert({ id: 1, ...chatConfig, ...newConfig });
        setChatConfig(prev => ({ ...prev, ...newConfig }));
    };

    return (
        <ChatContext.Provider value={{ 
            messages, 
            isOpen, 
            unreadCount, 
            toggleChat, 
            sendMessage, 
            shareImageToChat, 
            deleteMessage, 
            muteUser, 
            isLoading, 
            uploadChatImage, 
            chatConfig, 
            updateChatConfig,
            userProfiles // Exposed for ChatMessage.tsx
        }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (context === undefined) throw new Error('useChat must be used within a ChatProvider');
    return context;
};
