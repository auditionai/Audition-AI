
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { ChatMessage, User } from '../types';

interface ChatContextType {
    messages: ChatMessage[];
    isOpen: boolean;
    unreadCount: number;
    toggleChat: () => void;
    sendMessage: (content: string, type?: 'text' | 'image' | 'sticker', metadata?: any) => Promise<void>;
    shareImageToChat: (imageUrl: string) => Promise<void>;
    isLoading: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { supabase, user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch initial history
    useEffect(() => {
        if (!supabase) return;

        const fetchHistory = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('global_chat_messages')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;
                if (data) setMessages(data.reverse());
            } catch (err) {
                console.error("Failed to load chat history:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();

        // Subscribe to Realtime
        const channel = supabase.channel('public:global_chat_messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat_messages' }, 
                (payload) => {
                    const newMsg = payload.new as ChatMessage;
                    setMessages(prev => [...prev, newMsg]);
                    
                    // Increment unread if chat is closed AND message is not from self
                    if (!isOpen && newMsg.user_id !== user?.id) {
                        setUnreadCount(prev => prev + 1);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, isOpen, user?.id]);

    // Reset unread when opening chat
    useEffect(() => {
        if (isOpen) setUnreadCount(0);
    }, [isOpen]);

    const toggleChat = () => setIsOpen(prev => !prev);

    const sendMessage = async (content: string, type: 'text' | 'image' | 'sticker' = 'text', extraMetadata: any = {}) => {
        if (!supabase || !user) return;

        // Snapshot user details to ensure history remains accurate even if user changes profile later
        const metadata = {
            sender_name: user.display_name,
            sender_avatar: user.photo_url,
            sender_level: user.level,
            sender_frame_id: user.equipped_frame_id,
            sender_title_id: user.equipped_title_id,
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

    return (
        <ChatContext.Provider value={{ messages, isOpen, unreadCount, toggleChat, sendMessage, shareImageToChat, isLoading }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (context === undefined) throw new Error('useChat must be used within a ChatProvider');
    return context;
};
