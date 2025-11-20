
import React, { useState } from 'react';
import { ChatMessage } from '../../types';
import UserAvatar from '../common/UserAvatar';
import UserBadge from '../common/UserBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';

interface ChatMessageProps {
    message: ChatMessage;
    isOwn: boolean;
}

const ChatMessageItem: React.FC<ChatMessageProps> = ({ message, isOwn }) => {
    const { user } = useAuth();
    const { deleteMessage, muteUser } = useChat();
    const { content, type, metadata, is_deleted } = message;
    const [showMenu, setShowMenu] = useState(false);

    // Fallback for legacy messages or missing metadata
    const senderName = metadata?.sender_name || 'Unknown';
    const senderAvatar = metadata?.sender_avatar || 'https://i.pravatar.cc/150';
    const senderLevel = metadata?.sender_level || 1;
    const senderFrame = metadata?.sender_frame_id;
    const senderTitle = metadata?.sender_title_id;

    const isAdmin = user?.is_admin;

    const handleContextMenu = (e: React.MouseEvent) => {
        if (isAdmin) {
            e.preventDefault();
            setShowMenu(true);
        }
    };

    const handleDelete = () => {
        if (confirm('Xóa tin nhắn này?')) deleteMessage(message.id);
        setShowMenu(false);
    };

    const handleMute = (minutes: number) => {
        if (confirm(`Cấm chat người này trong ${minutes} phút?`)) muteUser(message.user_id, minutes);
        setShowMenu(false);
    };

    if (is_deleted) {
        return (
            <div className="flex justify-center my-2 opacity-50">
                <span className="text-[10px] italic text-gray-500 border border-gray-700 rounded-full px-3 py-1">🚫 Tin nhắn đã bị xóa</span>
            </div>
        );
    }

    return (
        <div 
            className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end group relative message-appear`}
            onContextMenu={handleContextMenu}
            onMouseLeave={() => setShowMenu(false)}
        >
            {/* Avatar */}
            <div className="flex-shrink-0 mb-1 relative z-10">
                 <UserAvatar 
                    url={senderAvatar} 
                    alt={senderName} 
                    frameId={senderFrame} 
                    level={senderLevel} 
                    size="sm"
                    className="shadow-lg"
                />
            </div>

            {/* Content Bubble */}
            <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%]`}>
                {!isOwn && (
                    <div className="flex items-center gap-1 mb-1 ml-1">
                         <span className="text-[10px] font-bold text-cyan-300 drop-shadow-sm tracking-wide uppercase">
                            {senderName}
                        </span>
                        <UserBadge titleId={senderTitle} level={senderLevel} className="scale-75 origin-left" />
                    </div>
                )}

                <div className={`
                    px-3 py-2 rounded-2xl text-sm relative shadow-md backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]
                    ${isOwn ? 'chat-bubble-user text-white rounded-br-none' : 'chat-bubble-other text-gray-100 rounded-bl-none'}
                    ${type === 'image' ? 'p-1 bg-transparent border-none shadow-none' : ''}
                `}>
                    {type === 'text' && <p className="break-words leading-relaxed">{content}</p>}
                    
                    {type === 'image' && metadata?.image_url && (
                        <div className="rounded-lg overflow-hidden border-2 border-white/20 cursor-pointer shadow-lg">
                            <img src={metadata.image_url} alt="Shared" className="max-w-full max-h-48 object-cover" onClick={() => window.open(metadata.image_url, '_blank')} />
                        </div>
                    )}

                    {type === 'system' && (
                        <div className="text-yellow-400 italic text-xs text-center w-full font-bold px-2">
                            <i className="ph-fill ph-sparkle mr-1"></i> {content}
                        </div>
                    )}
                </div>
                
                <span className="text-[9px] text-gray-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            {/* Admin Context Menu */}
            {showMenu && isAdmin && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#1e1b25] border border-white/10 rounded-lg shadow-xl z-50 py-1 min-w-[120px] animate-fade-in-up">
                    <button onClick={handleDelete} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-white/5 flex items-center gap-2">
                        <i className="ph-fill ph-trash"></i> Xóa tin
                    </button>
                    <div className="border-t border-white/10 my-1"></div>
                    <button onClick={() => handleMute(5)} className="w-full text-left px-3 py-2 text-xs text-yellow-400 hover:bg-white/5 flex items-center gap-2">
                        <i className="ph-fill ph-clock"></i> Mute 5p
                    </button>
                    <button onClick={() => handleMute(60)} className="w-full text-left px-3 py-2 text-xs text-orange-400 hover:bg-white/5 flex items-center gap-2">
                        <i className="ph-fill ph-clock"></i> Mute 1h
                    </button>
                </div>
            )}
        </div>
    );
};

export default ChatMessageItem;
