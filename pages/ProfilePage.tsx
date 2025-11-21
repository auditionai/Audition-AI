
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import ThemeEffects from '../components/themes/ThemeEffects';
import UserAvatar from '../components/common/UserAvatar';
import UserBadge from '../components/common/UserBadge';
import { Post, GalleryImage } from '../types';
import BottomNavBar from '../components/common/BottomNavBar';
import Modal from '../components/common/Modal';
import PostCard from '../components/social/PostCard';
import CommentModal from '../components/social/CommentModal';

const ProfilePage: React.FC = () => {
    const { user, session, supabase, showToast, navigate, updateUserProfile } = useAuth();
    const { theme } = useTheme();
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoadingPosts, setIsLoadingPosts] = useState(true);
    
    // Posting Logic
    const [isPostModalOpen, setIsPostModalOpen] = useState(false);
    const [myImages, setMyImages] = useState<GalleryImage[]>([]);
    const [selectedImageForPost, setSelectedImageForPost] = useState<GalleryImage | null>(null);
    const [caption, setCaption] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    // Comment Logic
    const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);

    // Fetch Posts
    const fetchPosts = useCallback(async () => {
        if (!supabase || !user) return;
        
        // Check for likes using a subquery or separate fetch would be better, 
        // but for now let's just fetch posts and we'll assume 'is_liked_by_user' isn't perfectly synced 
        // on self-profile without a complex join or rpc.
        // Actually, we can do a quick check if needed, but standard SELECT * is fine for MVP.
        
        const { data, error } = await supabase
            .from('posts')
            .select(`
                *,
                user:users (display_name, photo_url, level, equipped_frame_id, equipped_title_id)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        
        if (error) console.error("Error fetching posts:", error);
        else setPosts(data || []);
        setIsLoadingPosts(false);
    }, [supabase, user]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // Fetch user's generated images for the picker
    const fetchMyImages = async () => {
        if (!session) return;
        try {
            const { data, error } = await supabase!
                .from('generated_images')
                .select('*')
                .eq('user_id', user?.id)
                .not('image_url', 'is', null)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            setMyImages(data as GalleryImage[]);
        } catch (e) {
            console.error(e);
        }
    };

    const handleOpenPostModal = () => {
        fetchMyImages();
        setIsPostModalOpen(true);
    }

    const handlePost = async () => {
        if (!selectedImageForPost || !user || !supabase) return;
        setIsPosting(true);
        try {
            const { error } = await supabase.from('posts').insert({
                user_id: user.id,
                image_url: selectedImageForPost.image_url,
                caption: caption
            });
            
            if (error) throw error;
            
            showToast("Đăng bài thành công! +20 Điểm HOT", "success");
            setIsPostModalOpen(false);
            setCaption('');
            setSelectedImageForPost(null);
            fetchPosts(); // Refresh feed
            
            // Optimistically update stats
            updateUserProfile({ weekly_points: (user.weekly_points || 0) + 20 });

        } catch (e: any) {
            showToast(e.message || "Lỗi khi đăng bài", "error");
        } finally {
            setIsPosting(false);
        }
    };

    if (!user) return null;

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="tool" onNavigate={navigate} onCheckInClick={() => {}} />
            
            <main className="flex-grow pt-20 container mx-auto px-4 max-w-5xl">
                {/* Cover Photo Area */}
                <div className="relative h-48 md:h-64 w-full rounded-b-2xl overflow-hidden mb-12">
                    <img 
                        src={user.cover_url || "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?q=80&w=2574&auto=format&fit=crop"} 
                        alt="Cover" 
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-skin-fill via-transparent to-transparent"></div>
                    
                    {/* Profile Info Overlay */}
                    <div className="absolute -bottom-10 left-4 md:left-8 flex items-end gap-4">
                        <div className="relative group">
                            <UserAvatar 
                                url={user.photo_url} 
                                alt={user.display_name} 
                                frameId={user.equipped_frame_id} 
                                level={user.level} 
                                size="xl"
                                className="border-4 border-skin-fill bg-skin-fill rounded-full"
                            />
                            <div className="absolute bottom-0 right-0 bg-green-500 w-4 h-4 rounded-full border-2 border-skin-fill"></div>
                        </div>
                        <div className="mb-12 md:mb-10">
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl md:text-3xl font-black text-white drop-shadow-md">{user.display_name}</h1>
                                <UserBadge titleId={user.equipped_title_id} level={user.level} />
                            </div>
                            <p className="text-skin-muted text-sm max-w-md line-clamp-1">{user.bio || "Chưa cập nhật tiểu sử..."}</p>
                        </div>
                    </div>
                </div>

                {/* Stats & Actions Bar */}
                <div className="flex flex-col md:flex-row justify-end items-center gap-4 mb-8 mt-16 md:mt-4">
                    <div className="flex gap-6 text-center bg-skin-fill-secondary px-6 py-3 rounded-xl border border-skin-border">
                        <div>
                            <p className="text-xs text-skin-muted uppercase font-bold">Lượt Thích</p>
                            <p className="text-xl font-black text-pink-400">{user.total_likes || 0}</p>
                        </div>
                        <div className="w-px bg-skin-border"></div>
                        <div>
                            <p className="text-xs text-skin-muted uppercase font-bold">Lượt Xem</p>
                            <p className="text-xl font-black text-cyan-400">{user.profile_views || 0}</p>
                        </div>
                        <div className="w-px bg-skin-border"></div>
                        <div>
                            <p className="text-xs text-skin-muted uppercase font-bold">Điểm Tuần</p>
                            <p className="text-xl font-black text-yellow-400">{user.weekly_points || 0}</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleOpenPostModal}
                        className="themed-button-primary px-6 py-3 font-bold flex items-center gap-2"
                    >
                        <i className="ph-fill ph-plus-circle text-xl"></i> Đăng Ảnh Mới
                    </button>
                </div>

                {/* Content Tabs */}
                <div className="border-b border-skin-border mb-6">
                    <div className="flex gap-6">
                        <button className="pb-3 border-b-2 border-skin-accent text-skin-accent font-bold">Bảng Tin</button>
                        <button className="pb-3 border-b-2 border-transparent text-skin-muted hover:text-skin-base font-semibold transition" onClick={() => navigate('my-creations')}>Tủ Đồ</button>
                    </div>
                </div>

                {/* Feed Grid */}
                {isLoadingPosts ? (
                    <div className="text-center py-12"><div className="w-8 h-8 border-4 border-skin-accent border-t-transparent rounded-full animate-spin mx-auto"></div></div>
                ) : posts.length === 0 ? (
                    <div className="text-center py-20 bg-skin-fill-secondary rounded-xl border border-skin-border border-dashed">
                        <i className="ph-fill ph-camera text-6xl text-skin-muted mb-4"></i>
                        <p className="text-lg font-semibold">Nhà cửa vắng quá!</p>
                        <p className="text-skin-muted">Hãy đăng tấm ảnh đầu tiên để khoe với mọi người nào.</p>
                        <button onClick={handleOpenPostModal} className="mt-4 text-skin-accent hover:underline">Đăng ngay</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
                        {posts.map(post => (
                            <PostCard 
                                key={post.id} 
                                post={post} 
                                currentUser={user} 
                                onCommentClick={(p) => setSelectedPostForComments(p)} 
                            />
                        ))}
                    </div>
                )}
            </main>

            <CreatorFooter onInfoLinkClick={() => {}} />
            <BottomNavBar activeTab="tool" onTabChange={navigate} onCheckInClick={() => {}} />

            {/* Post Modal */}
            <Modal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} title="Đăng bài mới">
                <div className="space-y-4">
                    {!selectedImageForPost ? (
                        <div>
                            <p className="mb-2 text-sm text-skin-muted">Chọn một ảnh từ kho tác phẩm của bạn:</p>
                            <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                                {myImages.map(img => (
                                    <div key={img.id} onClick={() => setSelectedImageForPost(img)} className="aspect-[3/4] cursor-pointer rounded-md overflow-hidden border-2 border-transparent hover:border-skin-accent">
                                        <img src={img.image_url} className="w-full h-full object-cover" alt="" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-4">
                            <div className="w-1/3 aspect-[3/4] rounded-md overflow-hidden">
                                <img src={selectedImageForPost.image_url} className="w-full h-full object-cover" alt="Selected" />
                            </div>
                            <div className="w-2/3 flex flex-col gap-3">
                                <textarea 
                                    className="auth-input w-full h-24 resize-none" 
                                    placeholder="Viết chú thích cho ảnh này..."
                                    value={caption}
                                    onChange={e => setCaption(e.target.value)}
                                />
                                <div className="flex gap-2 mt-auto">
                                    <button onClick={() => setSelectedImageForPost(null)} className="themed-button-secondary flex-1 text-sm">Chọn ảnh khác</button>
                                    <button onClick={handlePost} disabled={isPosting} className="themed-button-primary flex-1 text-sm">
                                        {isPosting ? 'Đang đăng...' : 'Đăng bài'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <CommentModal 
                isOpen={!!selectedPostForComments} 
                onClose={() => setSelectedPostForComments(null)} 
                post={selectedPostForComments} 
            />
        </div>
    );
};

export default ProfilePage;
