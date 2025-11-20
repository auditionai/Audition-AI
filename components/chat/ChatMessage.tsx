
import React from 'react';
import { ChatMessage } from '../../types';
import UserAvatar from '../common/UserAvatar';
import UserBadge from '../common/UserBadge';
import { useGameConfig } from '../../contexts/GameConfigContext';

interface ChatMessageProps {
    message: ChatMessage;
    isOwn: boolean;
}

const ChatMessageItem: React.FC<ChatMessageProps> = ({ message, isOwn }) => {
    const { getRankForLevel } = useGameConfig();
    const { content, type, metadata } = message;
    
    // Fallback for legacy messages or missing metadata
    const senderName = metadata?.sender_name || 'Unknown';
    const senderAvatar = metadata?.sender_avatar || 'https://i.pravatar.cc/150';
    const senderLevel = metadata?.sender_level || 1;
    const senderFrame = metadata?.sender_frame_id;
    const senderTitle = metadata?.sender_title_id;

    const rank = getRankForLevel(senderLevel);

    return (
        <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-start group`}>
            {/* Avatar */}
            <div className="flex-shrink-0 -mt-1">
                 <UserAvatar 
                    url={senderAvatar} 
                    alt={senderName} 
                    frameId={senderFrame} 
                    level={senderLevel} 
                    size="sm"
                />
            </div>

            {/* Content Bubble */}
            <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[80%]`}>
                <div className="flex items-center gap-2 mb-1">
                     <span className={`text-xs font-bold ${isOwn ? 'text-pink-300' : 'text-cyan-300'} drop-shadow-sm`}>
                        {senderName}
                    </span>
                    <UserBadge titleId={senderTitle} level={senderLevel} className="scale-75 origin-left" />
                </div>

                <div className={`
                    px-3 py-2 rounded-2xl text-sm relative
                    ${isOwn ? 'bg-pink-500/20 border border-pink-500/30 text-white rounded-tr-none' : 'bg-white/10 border border-white/10 text-gray-200 rounded-tl-none'}
                    ${type === 'image' ? 'p-1 bg-transparent border-none' : ''}
                `}>
                    {type === 'text' && <p className="break-words">{content}</p>}
                    
                    {type === 'image' && metadata?.image_url && (
                        <div className="rounded-lg overflow-hidden border border-white/20 cursor-pointer">
                            <img src={metadata.image_url} alt="Shared" className="max-w-full max-h-48 object-cover" onClick={() => window.open(metadata.image_url, '_blank')} />
                        </div>
                    )}

                    {type === 'system' && (
                        <div className="text-yellow-400 italic text-xs text-center w-full">
                            <i className="ph-fill ph-sparkle mr-1"></i> {content}
                        </div>
                    )}
                </div>
                
                <span className="text-[10px] text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
};

export default ChatMessageItem;
