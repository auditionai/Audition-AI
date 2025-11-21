
import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { Post, PostComment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../common/UserAvatar';
import { calculateLevelFromXp } from '../../utils/rankUtils';

interface CommentModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: Post | null;
}

const CommentModal: React.FC<CommentModalProps> = ({ isOpen, onClose, post }) => {
    const { supabase, user, showToast } = useAuth();
    const [comments, setComments] = useState<PostComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && post && supabase) {
            fetchComments();
        }
    }, [isOpen, post]);

    const fetchComments = async () => {
        if (!post || !supabase) return;
        setIsLoading(true);
        try {
            // FIX: Fetch 'xp' instead of 'level' because 'level' column does not exist
            const { data, error } = await supabase
                .from('post_comments')
                .select(`
                    id, content, created_at,
                    user:users (display_name, photo_url, equipped_frame_id, xp)
                `)
                .eq('post_id', post.id)
                .order('created_at', { ascending: true });
            
            if (error) throw error;

            // Map xp to level for frontend display
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
        if (!newComment.trim() || !post || !user || !supabase) return;
        
        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('post_comments')
                .insert({
                    post_id: post.id,
                    user_id: user.id,
                    content: newComment.trim()
                });
            
            if (error) throw error;
            
            setNewComment('');
            fetchComments(); // Refresh list
            showToast('Đã gửi bình luận', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
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
                        comments.map(comment => (
                            <div key={comment.id} className="flex gap-3">
                                <UserAvatar 
                                    url={comment.user?.photo_url || ''} 
                                    alt={comment.user?.display_name || 'User'} 
                                    frameId={comment.user?.equipped_frame_id}
                                    level={comment.user?.level}
                                    size="sm" 
                                />
                                <div className="flex flex-col">
                                    <div className="bg-skin-fill-secondary rounded-2xl rounded-tl-none px-4 py-2 border border-skin-border">
                                        <p className="text-xs font-bold text-skin-base mb-0.5">{comment.user?.display_name}</p>
                                        <p className="text-sm text-gray-300 break-words">{comment.content}</p>
                                    </div>
                                    <span className="text-[10px] text-skin-muted ml-2 mt-1">
                                        {new Date(comment.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Input Area */}
                <form onSubmit={handleSubmit} className="mt-4 flex gap-2 pt-4 border-t border-skin-border">
                    <input 
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
