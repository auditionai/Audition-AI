
import React, { useState, useEffect, useCallback, useRef } from 'react';
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

    // 3D Tilt Effect Ref
    const cardRef = useRef<HTMLDivElement>(null);

    // Fetch Posts
    const fetchPosts = useCallback(async () => {
        if (!supabase || !user) return;
        
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
            
            updateUserProfile({ weekly_points: (user.weekly_points || 0) + 20 });

        } catch (e: any) {
            showToast(e.message || "Lỗi khi đăng bài", "error");
        } finally {
            setIsPosting(false);
        }
    };

    // Handle 3D Tilt Effect
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const { left, top, width, height } = cardRef.current.getBoundingClientRect();
        const x = (e.clientX - left - width / 2) / 20;
        const y = (e.clientY - top - height / 2) / 20;
        cardRef.current.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
    };

    const handleMouseLeave = () => {
        if (!cardRef.current) return;
        cardRef.current.style.transform = `rotateY(0deg) rotateX(0deg)`;
    };

    if (!user) return null;

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="tool" onNavigate={navigate} onCheckInClick={() => {}} />
            
            <main className="flex-grow pt-24 container mx-auto px-4 max-w-5xl">
                
                {/* NEW: 3D Profile Card Section */}
                <div className="profile-3d-wrapper" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                    <div className="profile-card-glass" ref={cardRef}>
                        <div className="holo-shine"></div>
                        
                        <div className="profile-card-content">
                            {/* Avatar */}
                            <div className="profile-avatar-wrapper">
                                <UserAvatar 
                                    url={user.photo_url} 
                                    alt={user.display_name} 
                                    frameId={user.equipped_frame_id} 
                                    level={user.level} 
                                    size="xl"
                                    className="shadow-2xl"
                                />
                            </div>

                            {/* Name & Title */}
                            <div>
                                <h1 className="text-3xl font-black text-white tracking-wide drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] uppercase">
                                    {user.display_name}
                                </h1>
                                <div className="flex justify-center mt-2">
                                    <UserBadge titleId={user.equipped_title_id} level={user.level} className="scale-110" />
                                </div>
                            </div>

                            {/* Bio */}
                            <p className="profile-bio">
                                {user.bio || "Dân chơi Audition sành điệu - Chưa cập nhật tiểu sử."}
                            </p>

                            {/* Stats Row */}
                            <div className="profile-stats-row">
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-pink-400">{user.total_likes || 0}</span>
                                    <span className="profile-stat-label">Hearts</span>
                                </div>
                                <div className="w-px bg-white/10"></div>
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-cyan-400">{user.profile_views || 0}</span>
                                    <span className="profile-stat-label">Views</span>
                                </div>
                                <div className="w-px bg-white/10"></div>
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-yellow-400">{user.weekly_points || 0}</span>
                                    <span className="profile-stat-label">Fame</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions (Absolute Top Right) */}
                        <div className="profile-actions-floating">
                             <button onClick={() => navigate('settings')} className="text-white/50 hover:text-white transition p-2">
                                <i className="ph-fill ph-gear text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Actions Bar */}
                <div className="flex justify-center my-8">
                    <button 
                        onClick={handleOpenPostModal}
                        className="themed-button-primary px-8 py-3 font-bold flex items-center gap-2 rounded-full shadow-[0_0_20px_rgba(236,72,153,0.4)] hover:shadow-[0_0_30px_rgba(236,72,153,0.6)] transition-all transform hover:-translate-y-1"
                    >
                        <i className="ph-fill ph-plus-circle text-xl"></i> Đăng Ảnh Mới
                    </button>
                </div>

                {/* Content Tabs */}
                <div className="border-b border-skin-border mb-6">
                    <div className="flex gap-6 justify-center">
                        <button className="pb-3 border-b-2 border-skin-accent text-skin-accent font-bold px-4">Bảng Tin</button>
                        <button className="pb-3 border-b-2 border-transparent text-skin-muted hover:text-skin-base font-semibold transition px-4" onClick={() => navigate('my-creations')}>Tủ Đồ</button>
                    </div>
                </div>

                {/* Feed Grid */}
                {isLoadingPosts ? (
                    <div className="text-center py-12"><div className="w-8 h-8 border-4 border-skin-accent border-t-transparent rounded-full animate-spin mx-auto"></div></div>
                ) : posts.length === 0 ? (
                    <div className="text-center py-20 bg-skin-fill-secondary rounded-xl border border-skin-border border-dashed opacity-60">
                        <i className="ph-fill ph-camera text-6xl text-skin-muted mb-4"></i>
                        <p className="text-lg font-semibold">Nhà cửa vắng quá!</p>
                        <p className="text-skin-muted">Hãy đăng tấm ảnh đầu tiên để khoe với mọi người nào.</p>
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
                                    <div key={img.id} onClick={() => setSelectedImageForPost(img)} className="aspect-[3/4] cursor-pointer rounded-md overflow-hidden border-2 border-transparent hover:border-skin-accent hover:scale-105 transition">
                                        <img src={img.image_url} className="w-full h-full object-cover" alt="" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-4">
                            <div className="w-1/3 aspect-[3/4] rounded-md overflow-hidden border border-skin-border">
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
