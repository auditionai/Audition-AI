
import React, { useState, useEffect, useRef } from 'react';
import Modal from '../common/Modal';
import { Post, PostComment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../common/UserAvatar';
import UserName from '../common/UserName'; // Import UserName
import { calculateLevelFromXp } from '../../utils/rankUtils';

interface CommentModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: Post | null;
}

const CommentModal: React.FC<CommentModalProps> = ({ isOpen, onClose, post }) => {
    const { supabase, user, showToast, session } = useAuth();
    const [comments, setComments] = useState<PostComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && post && supabase) {
            fetchComments();
        } else {
            setComments([]);
            setReplyTo(null);
        }
    }, [isOpen, post]);

    const fetchComments = async () => {
        if (!post || !supabase) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('post_comments')
                .select(`
                    id, content, created_at, user_id, parent_id,
                    user:users (display_name, photo_url, equipped_frame_id, equipped_name_effect_id, xp),
                    parent_comment:post_comments!parent_id (
                        user:users (display_name)
                    )
                `)
                .eq('post_id', post.id)
                .order('created_at', { ascending: true });
            
            if (error) throw error;

            const formattedComments = data.map((comment: any) => ({
                ...comment,
                user: comment.user ? {
                    ...comment.user,
                    level: calculateLevelFromXp(comment.user.xp || 0)
                } : null
            }));

            setComments(formattedComments as PostComment[]); 
        } catch (e) {
            console.error("Fetch comments error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !post || !user || !session) return;
        
        setIsSubmitting(true);
        try {
            const response = await fetch('/.netlify/functions/create-comment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    postId: post.id,
                    content: newComment.trim(),
                    parentId: replyTo?.id || null
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Lỗi khi gửi bình luận");
            
            setNewComment('');
            setReplyTo(null);
            fetchComments(); // Refresh list
            showToast('Đã gửi bình luận', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!session) return;
        if (!confirm("Bạn có chắc muốn xóa bình luận này?")) return;

        try {
            const res = await fetch('/.netlify/functions/delete-comment', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}` 
                },
                body: JSON.stringify({ commentId })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setComments(prev => prev.filter(c => c.id !== commentId));
            showToast('Đã xóa bình luận', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const handleReply = (comment: PostComment) => {
        if (!comment.user) return;
        setReplyTo({ id: comment.id, name: comment.user.display_name });
        inputRef.current?.focus();
    };

    if (!isOpen || !post) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Bình luận">
            <div className="flex flex-col h-[60vh]">
                {/* Comments List */}
                <div className="flex-grow overflow-y-auto custom-scrollbar p-1 space-y-4">
                    {isLoading ? (
                        <div className="text-center py-4 text-skin-muted">Đang tải bình luận...</div>
                    ) : comments.length === 0 ? (
                        <div className="text-center py-8 text-skin-muted italic">Chưa có bình luận nào. Hãy là người đầu tiên!</div>
                    ) : (
                        comments.map(comment => {
                            const isOwner = user && comment.user_id === user.id;
                            const isPostOwner = user && post.user_id === user.id;
                            const isReply = !!comment.parent_id;
                            
                            return (
                                <div key={comment.id} className={`flex gap-3 group ${isReply ? 'ml-8' : ''}`}>
                                    <UserAvatar 
                                        url={comment.user?.photo_url || ''} 
                                        alt={comment.user?.display_name || 'User'} 
                                        frameId={comment.user?.equipped_frame_id}
                                        level={comment.user?.level}
                                        size="sm" 
                                    />
                                    <div className="flex flex-col flex-grow">
                                        <div className="bg-skin-fill-secondary rounded-2xl rounded-tl-none px-4 py-2 border border-skin-border relative">
                                            <p className="text-xs font-bold text-skin-base mb-0.5">
                                                <UserName user={comment.user} />
                                            </p>
                                            
                                            {/* Replying to... */}
                                            {comment.parent_comment?.user && (
                                                <p className="text-[10px] text-skin-muted mb-1">
                                                    Trả lời <span className="font-bold text-skin-accent">{comment.parent_comment.user.display_name}</span>
                                                </p>
                                            )}

                                            <p className="text-sm text-gray-300 break-words pr-6">{comment.content}</p>
                                            
                                            {/* Delete Button */}
                                            {(isOwner || isPostOwner) && (
                                                <button 
                                                    onClick={() => handleDeleteComment(comment.id)}
                                                    className="absolute top-2 right-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Xóa bình luận"
                                                >
                                                    <i className="ph-fill ph-trash"></i>
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex gap-4 text-[10px] text-skin-muted ml-2 mt-1">
                                            <span>{new Date(comment.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            <button onClick={() => handleReply(comment)} className="font-bold hover:text-skin-base transition">Trả lời</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Reply Indicator */}
                {replyTo && (
                    <div className="flex items-center justify-between bg-skin-fill-secondary px-4 py-2 text-xs border-t border-skin-border">
                        <span className="text-skin-muted">Đang trả lời <span className="font-bold text-skin-base">{replyTo.name}</span></span>
                        <button onClick={() => setReplyTo(null)} className="text-skin-muted hover:text-red-400"><i className="ph-fill ph-x-circle text-lg"></i></button>
                    </div>
                )}

                {/* Input Area */}
                <form onSubmit={handleSubmit} className="mt-auto flex gap-2 pt-4 border-t border-skin-border">
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Viết bình luận..."
                        className="flex-grow bg-skin-fill-secondary border border-skin-border rounded-full px-4 py-2 text-sm text-skin-base focus:border-skin-accent focus:outline-none"
                        disabled={isSubmitting}
                    />
                    <button 
                        type="submit" 
                        disabled={isSubmitting || !newComment.trim()}
                        className="bg-skin-accent hover:bg-skin-accent/80 text-white p-2 rounded-full transition-colors disabled:opacity-50 aspect-square flex items-center justify-center"
                    >
                        {isSubmitting ? <i className="ph ph-spinner animate-spin"></i> : <i className="ph-fill ph-paper-plane-right"></i>}
                    </button>
                </form>
            </div>
        </Modal>
    );
};

export default CommentModal;
