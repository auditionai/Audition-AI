
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../../types';
import UserAvatar from '../common/UserAvatar';
import UserBadge from '../common/UserBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';

interface ChatMessageProps {
    message: ChatMessage;
    isOwn: boolean;
    onImageClick: (url: string) => void;
    onDeleteMessage?: (id: string) => void;
}

const ChatMessageItem: React.FC<ChatMessageProps> = ({ message, isOwn, onImageClick, onDeleteMessage }) => {
    const { user, navigate } = useAuth();
    const { muteUser } = useChat();
    const { content, type, metadata, is_deleted, created_at } = message;
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Fallback for legacy messages or missing metadata
    const senderName = metadata?.sender_name || 'Unknown';
    const senderAvatar = metadata?.sender_avatar || 'https://i.pravatar.cc/150';
    const senderLevel = metadata?.sender_level || 1;
    const senderFrame = metadata?.sender_frame_id;
    const senderTitle = metadata?.sender_title_id;
    const deletedBy = metadata?.deleted_by;

    const isAdmin = user?.is_admin;

    // Handle click outside to close menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContextMenu = (e: React.MouseEvent) => {
        if (isAdmin || (!is_deleted && isOwn)) {
            e.preventDefault();
            setShowMenu(true);
        }
    };

    const handleDeleteClick = () => {
        if (onDeleteMessage) {
            onDeleteMessage(message.id);
        }
        setShowMenu(false);
    };

    const handleMute = (minutes: number) => {
        if (confirm(`Cấm chat người này trong ${minutes} phút?`)) muteUser(message.user_id, minutes);
        setShowMenu(false);
    };

    const handleProfileClick = () => {
        navigate(`user/${message.user_id}`);
    };

    return (
        <div 
            className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end group relative message-appear`}
            onContextMenu={handleContextMenu}
        >
            {/* Avatar */}
            <div className="flex-shrink-0 mb-5 relative z-10 cursor-pointer" onClick={handleProfileClick}>
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
            <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%] relative`}>
                {/* Sender Info */}
                <div 
                    className={`flex items-center gap-1 mb-1 ${isOwn ? 'mr-1 flex-row-reverse' : 'ml-1'} cursor-pointer`}
                    onClick={handleProfileClick}
                >
                        <span className="text-[10px] font-bold text-cyan-300 drop-shadow-sm tracking-wide uppercase hover:underline">
                        {senderName}
                    </span>
                    <UserBadge titleId={senderTitle} level={senderLevel} className={`scale-75 ${isOwn ? 'origin-right' : 'origin-left'}`} />
                </div>

                <div className={`
                    px-3 py-2 rounded-2xl text-sm relative shadow-md backdrop-blur-sm transition-all duration-200 
                    ${is_deleted 
                        ? 'bg-gray-800/50 border border-gray-700 text-gray-400' 
                        : (isOwn ? 'chat-bubble-user text-white rounded-br-none' : 'chat-bubble-other text-gray-100 rounded-bl-none')
                    }
                    ${type === 'image' && !is_deleted ? 'p-1 bg-transparent border-none shadow-none' : ''}
                `}>
                    {is_deleted ? (
                        <div className="italic text-[11px] flex items-center gap-1.5 py-1 text-gray-400">
                            <i className="ph-fill ph-trash text-gray-500"></i>
                            <span>
                                Tin nhắn đã bị xóa bởi <span className="font-bold text-gray-300">{deletedBy || 'Admin'}</span>
                            </span>
                        </div>
                    ) : (
                        <>
                            {type === 'text' && <p className="break-words leading-relaxed">{content}</p>}
                            
                            {type === 'image' && metadata?.image_url && (
                                <div className="rounded-lg overflow-hidden border-2 border-white/20 cursor-pointer shadow-lg group/img">
                                    <img 
                                        src={metadata.image_url} 
                                        alt="Shared" 
                                        className="max-w-full max-h-48 object-cover transition-transform duration-300 group-hover/img:scale-105" 
                                        onClick={() => onImageClick(metadata.image_url!)} 
                                    />
                                </div>
                            )}

                            {type === 'sticker' && (
                                <div className="text-4xl animate-bounce">{content}</div>
                            )}

                            {type === 'system' && (
                                <div className="text-yellow-400 italic text-xs text-center w-full font-bold px-2">
                                    <i className="ph-fill ph-sparkle mr-1"></i> {content}
                                </div>
                            )}
                        </>
                    )}
                </div>
                
                {/* Timestamp */}
                <span className={`text-[9px] text-gray-500 mt-1 px-1 font-medium ${isOwn ? 'text-right' : 'text-left'}`}>
                    {new Date(created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>

                {/* Options Button (Visible on hover/tap for owner or admin) */}
                {!is_deleted && (isOwn || isAdmin) && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        className={`absolute top-2 p-1 rounded-full bg-black/40 text-gray-300 hover:text-white hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100 z-20 ${isOwn ? '-left-8' : '-right-8'}`}
                    >
                        <i className="ph-fill ph-dots-three-vertical text-sm"></i>
                    </button>
                )}
            </div>

            {/* Context Menu */}
            {showMenu && !is_deleted && (
                <div ref={menuRef} className={`absolute top-8 ${isOwn ? 'right-10' : 'left-10'} bg-[#1e1b25] border border-white/20 rounded-lg shadow-2xl z-50 py-2 min-w-[140px] animate-fade-in-up backdrop-blur-md`}>
                    <button onClick={handleDeleteClick} className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-white/5 flex items-center gap-2 transition-colors font-semibold">
                        <i className="ph-fill ph-trash text-sm"></i> Xóa tin nhắn
                    </button>
                    {isAdmin && !isOwn && (
                        <>
                            <div className="border-t border-white/10 my-1"></div>
                            <button onClick={() => handleMute(5)} className="w-full text-left px-4 py-2 text-xs text-yellow-400 hover:bg-white/5 flex items-center gap-2 transition-colors">
                                <i className="ph-fill ph-clock text-sm"></i> Cấm chat 5p
                            </button>
                            <button onClick={() => handleMute(60)} className="w-full text-left px-4 py-2 text-xs text-orange-400 hover:bg-white/5 flex items-center gap-2 transition-colors">
                                <i className="ph-fill ph-clock text-sm"></i> Cấm chat 1h
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default ChatMessageItem;
