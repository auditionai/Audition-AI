import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import ThemeEffects from '../components/themes/ThemeEffects';
import UserAvatar from '../components/common/UserAvatar';
import UserBadge from '../components/common/UserBadge';
import { User, Post } from '../types';
import BottomNavBar from '../components/common/BottomNavBar';
import PostCard from '../components/social/PostCard';
import CommentModal from '../components/social/CommentModal';

const UserProfilePage: React.FC = () => {
    const { navigate, supabase, user, showToast, session } = useAuth();
    const { theme } = useTheme();
    const userId = window.location.pathname.split('/').pop();
    
    const [viewUser, setViewUser] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);
    const [isCreatingChat, setIsCreatingChat] = useState(false);

    // 3D Tilt Effect Ref
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!userId || !supabase) return;
        
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // 1. Fetch User Profile
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();
                
                if (userError) throw userError;
                setViewUser(userData);

                // 2. Fetch User Posts using Server Function (Bypass RLS & Handle Likes)
                // Use session access token for authorization
                const response = await fetch(`/.netlify/functions/get-posts?userId=${userId}`, {
                    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
                });
                
                if (response.ok) {
                    const postsData = await response.json();
                    setPosts(postsData);
                } else {
                    console.error("Failed to load posts");
                }

            } catch (e) {
                console.error("Failed to load user profile", e);
                navigate('home');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [userId, supabase, navigate, user, session]);

    const handleMessageClick = async () => {
        if (!supabase || !user || !viewUser) return;
        if (isCreatingChat) return;
        setIsCreatingChat(true);

        try {
            const { data: conversationId, error } = await supabase
                .rpc('get_or_create_conversation', { other_user_id: viewUser.id });

            if (error) throw error;
            navigate(`messages?conversationId=${conversationId}`);
        } catch (e: any) {
            showToast("Không thể tạo cuộc trò chuyện.", "error");
            console.error(e);
        } finally {
            setIsCreatingChat(false);
        }
    };

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

    if (isLoading) {
        return <div className="min-h-screen bg-skin-fill flex items-center justify-center"><div className="w-8 h-8 border-4 border-skin-accent border-t-transparent rounded-full animate-spin"></div></div>;
    }

    if (!viewUser) return null;

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="tool" onNavigate={navigate} onCheckInClick={() => {}} />
            
            <main className="flex-grow pt-24 container mx-auto px-4 max-w-5xl">
                
                {/* 3D Profile Card (View Mode) */}
                <div className="profile-3d-wrapper" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                    <div className="profile-card-glass" ref={cardRef}>
                        <div className="holo-shine"></div>
                        
                        <div className="profile-card-content">
                            <div className="profile-avatar-wrapper">
                                <UserAvatar 
                                    url={viewUser.photo_url} 
                                    alt={viewUser.display_name} 
                                    frameId={viewUser.equipped_frame_id} 
                                    level={viewUser.level} 
                                    size="xl"
                                    className="shadow-2xl"
                                />
                            </div>

                            <div>
                                <h1 className="text-3xl font-black text-white tracking-wide drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] uppercase">
                                    {viewUser.display_name}
                                </h1>
                                <div className="flex justify-center mt-2">
                                    <UserBadge titleId={viewUser.equipped_title_id} level={viewUser.level} className="scale-110" />
                                </div>
                            </div>

                            <p className="profile-bio">
                                {viewUser.bio || "Người chơi này rất bí ẩn..."}
                            </p>

                            <div className="profile-stats-row">
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-pink-400">{viewUser.total_likes || 0}</span>
                                    <span className="profile-stat-label">Hearts</span>
                                </div>
                                <div className="w-px bg-white/10"></div>
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-cyan-400">{viewUser.profile_views || 0}</span>
                                    <span className="profile-stat-label">Views</span>
                                </div>
                                <div className="w-px bg-white/10"></div>
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-yellow-400">{viewUser.weekly_points || 0}</span>
                                    <span className="profile-stat-label">Fame</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Public Actions */}
                {user && user.id !== viewUser.id && (
                    <div className="flex justify-center gap-4 my-8">
                        <button 
                            onClick={handleMessageClick}
                            disabled={isCreatingChat}
                            className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold border border-white/20 text-sm flex items-center transition-colors disabled:opacity-50 backdrop-blur-sm"
                        >
                            {isCreatingChat ? <i className="ph ph-spinner animate-spin mr-2"></i> : <i className="ph-fill ph-chat-circle-text mr-2"></i>}
                            Gửi Tin Nhắn
                        </button>
                        <button className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded-full font-bold shadow-lg transition-all transform hover:-translate-y-1">
                            <i className="ph-fill ph-heart mr-2"></i> Kết Bạn
                        </button>
                    </div>
                )}

                {/* Feed */}
                <div className="border-b border-skin-border mb-6">
                    <div className="flex gap-6 justify-center">
                        <button className="pb-3 border-b-2 border-skin-accent text-skin-accent font-bold px-4">Bảng Tin</button>
                    </div>
                </div>

                {posts.length === 0 ? (
                    <div className="text-center py-20 text-skin-muted opacity-60">
                        <i className="ph-fill ph-ghost text-4xl mb-2"></i>
                        <p>Người dùng này chưa đăng bài viết nào.</p>
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

            <CommentModal 
                isOpen={!!selectedPostForComments} 
                onClose={() => setSelectedPostForComments(null)} 
                post={selectedPostForComments} 
            />
        </div>
    );
};

export default UserProfilePage;