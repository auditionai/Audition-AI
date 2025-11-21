
import React, { useState } from 'react';
import { Post, User } from '../../types';
import UserAvatar from '../common/UserAvatar';
import UserBadge from '../common/UserBadge';
import { useAuth } from '../../contexts/AuthContext';

interface PostCardProps {
    post: Post;
    currentUser: User | null;
    onCommentClick: (post: Post) => void;
    onUserClick?: (userId: string) => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, currentUser, onCommentClick, onUserClick }) => {
    const { supabase } = useAuth();
    const [isLiked, setIsLiked] = useState(post.is_liked_by_user || false);
    const [likesCount, setLikesCount] = useState(post.likes_count);
    const [isLikeAnimating, setIsLikeAnimating] = useState(false);

    const handleLike = async () => {
        if (!currentUser || !supabase) return;
        
        // Optimistic update
        const newLikedState = !isLiked;
        setIsLiked(newLikedState);
        setLikesCount(prev => newLikedState ? prev + 1 : prev - 1);
        setIsLikeAnimating(true);
        setTimeout(() => setIsLikeAnimating(false), 300);

        try {
            if (newLikedState) {
                await supabase.from('post_likes').insert({ post_id: post.id, user_id: currentUser.id });
            } else {
                await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', currentUser.id);
            }
        } catch (error) {
            console.error("Like error:", error);
            // Revert on error
            setIsLiked(!newLikedState);
            setLikesCount(prev => newLikedState ? prev - 1 : prev + 1);
        }
    };

    return (
        <div className="bg-skin-fill-secondary rounded-xl border border-skin-border overflow-hidden group transition hover:border-skin-border-accent/50">
            {/* Header */}
            <div className="p-3 flex items-center gap-3">
                <div onClick={() => onUserClick && post.user && onUserClick(post.user_id)} className="cursor-pointer">
                    <UserAvatar 
                        url={post.user?.photo_url || ''} 
                        alt={post.user?.display_name || 'User'} 
                        frameId={post.user?.equipped_frame_id} 
                        level={post.user?.level} 
                        size="sm" 
                    />
                </div>
                <div className="flex-grow">
                    <div className="flex items-center gap-2">
                        <p 
                            className="font-bold text-sm text-skin-base cursor-pointer hover:underline"
                            onClick={() => onUserClick && post.user && onUserClick(post.user_id)}
                        >
                            {post.user?.display_name}
                        </p>
                        <UserBadge titleId={post.user?.equipped_title_id} level={post.user?.level} className="scale-75 origin-left" />
                    </div>
                    <p className="text-xs text-skin-muted">{new Date(post.created_at).toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
            </div>

            {/* Image */}
            <div className="aspect-[3/4] bg-black relative overflow-hidden" onDoubleClick={handleLike}>
                <img 
                    src={post.image_url} 
                    alt="" 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                    loading="lazy"
                />
                {/* Heart Animation Overlay */}
                <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${isLikeAnimating ? 'opacity-100' : 'opacity-0'}`}>
                    <i className="ph-fill ph-heart text-white text-8xl drop-shadow-lg animate-bounce"></i>
                </div>
            </div>

            {/* Actions & Content */}
            <div className="p-4">
                <div className="flex items-center gap-4 mb-3">
                    <button 
                        onClick={handleLike}
                        className={`text-2xl transition-all active:scale-90 ${isLiked ? 'text-pink-500' : 'text-skin-muted hover:text-pink-500'}`}
                    >
                        <i className={`ph-fill ${isLiked ? 'ph-heart' : 'ph-heart'}`}></i>
                    </button>
                    <button 
                        onClick={() => onCommentClick(post)}
                        className="text-2xl text-skin-muted hover:text-blue-400 transition"
                    >
                        <i className="ph-fill ph-chat-circle"></i>
                    </button>
                    <button className="text-2xl text-skin-muted hover:text-green-400 transition ml-auto">
                        <i className="ph-fill ph-share-network"></i>
                    </button>
                </div>
                
                <p className="font-bold text-sm mb-1 text-skin-base">{likesCount} lượt thích</p>
                
                {post.caption && (
                    <p className="text-sm text-skin-base mb-2">
                        <span className="font-bold mr-2 cursor-pointer hover:underline" onClick={() => onUserClick && post.user && onUserClick(post.user_id)}>
                            {post.user?.display_name}
                        </span>
                        {post.caption}
                    </p>
                )}
                
                <button 
                    onClick={() => onCommentClick(post)}
                    className="text-xs text-skin-muted hover:text-skin-base transition"
                >
                    {post.comments_count > 0 ? `Xem tất cả ${post.comments_count} bình luận` : 'Viết bình luận...'}
                </button>
            </div>
        </div>
    );
};

export default PostCard;
