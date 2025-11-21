
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import ThemeEffects from '../components/themes/ThemeEffects';
import UserAvatar from '../components/common/UserAvatar';
import UserBadge from '../components/common/UserBadge';
import { User, Post } from '../types';
import BottomNavBar from '../components/common/BottomNavBar';

const UserProfilePage: React.FC = () => {
    const { navigate, supabase } = useAuth();
    const { theme } = useTheme();
    // Simplified ID extraction since we don't have react-router hooks
    const userId = window.location.pathname.split('/').pop();
    
    const [viewUser, setViewUser] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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

                // 2. Fetch User Posts
                const { data: postsData } = await supabase
                    .from('posts')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false });
                
                setPosts(postsData || []);

            } catch (e) {
                console.error("Failed to load user profile", e);
                navigate('home');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [userId, supabase, navigate]);

    if (isLoading) {
        return <div className="min-h-screen bg-skin-fill flex items-center justify-center"><div className="w-8 h-8 border-4 border-skin-accent border-t-transparent rounded-full animate-spin"></div></div>;
    }

    if (!viewUser) return null;

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="tool" onNavigate={navigate} onCheckInClick={() => {}} />
            
            <main className="flex-grow pt-20 container mx-auto px-4 max-w-5xl">
                {/* Cover Photo Area */}
                <div className="relative h-48 md:h-64 w-full rounded-b-2xl overflow-hidden mb-12">
                    <img 
                        src={viewUser.cover_url || "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?q=80&w=2574&auto=format&fit=crop"} 
                        alt="Cover" 
                        className="w-full h-full object-cover grayscale hover:grayscale-0 transition duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-skin-fill via-transparent to-transparent"></div>
                    
                    <div className="absolute -bottom-10 left-4 md:left-8 flex items-end gap-4">
                        <div className="relative">
                            <UserAvatar 
                                url={viewUser.photo_url} 
                                alt={viewUser.display_name} 
                                frameId={viewUser.equipped_frame_id} 
                                level={viewUser.level} 
                                size="xl"
                                className="border-4 border-skin-fill bg-skin-fill rounded-full"
                            />
                        </div>
                        <div className="mb-12 md:mb-10">
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl md:text-3xl font-black text-white drop-shadow-md">{viewUser.display_name}</h1>
                                <UserBadge titleId={viewUser.equipped_title_id} level={viewUser.level} />
                            </div>
                            <p className="text-skin-muted text-sm max-w-md line-clamp-1">{viewUser.bio || "Người chơi này rất bí ẩn..."}</p>
                        </div>
                    </div>
                </div>

                {/* Stats & Actions */}
                <div className="flex flex-col md:flex-row justify-end items-center gap-4 mb-8 mt-16 md:mt-4">
                    <div className="flex gap-6 text-center bg-skin-fill-secondary px-6 py-3 rounded-xl border border-skin-border">
                        <div>
                            <p className="text-xs text-skin-muted uppercase font-bold">Lượt Thích</p>
                            <p className="text-xl font-black text-pink-400">{viewUser.total_likes || 0}</p>
                        </div>
                        <div className="w-px bg-skin-border"></div>
                        <div>
                            <p className="text-xs text-skin-muted uppercase font-bold">Lượt Xem</p>
                            <p className="text-xl font-black text-cyan-400">{viewUser.profile_views || 0}</p>
                        </div>
                        <div className="w-px bg-skin-border"></div>
                        <div>
                            <p className="text-xs text-skin-muted uppercase font-bold">Điểm Tuần</p>
                            <p className="text-xl font-black text-yellow-400">{viewUser.weekly_points || 0}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-bold border border-skin-border text-sm">
                            <i className="ph-fill ph-chat-circle-text mr-2"></i> Nhắn tin
                        </button>
                        <button className="px-6 py-3 bg-skin-accent/10 hover:bg-skin-accent/20 text-skin-accent rounded-lg font-bold border border-skin-border-accent text-sm">
                            <i className="ph-fill ph-user-plus mr-2"></i> Kết bạn
                        </button>
                    </div>
                </div>

                {/* Feed */}
                <div className="border-b border-skin-border mb-6">
                    <div className="flex gap-6">
                        <button className="pb-3 border-b-2 border-skin-accent text-skin-accent font-bold">Bảng Tin</button>
                    </div>
                </div>

                {posts.length === 0 ? (
                    <div className="text-center py-20 text-skin-muted">
                        <p>Người dùng này chưa đăng bài viết nào.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
                        {posts.map(post => (
                            <div key={post.id} className="bg-skin-fill-secondary rounded-xl border border-skin-border overflow-hidden">
                                <div className="p-4 flex items-center gap-3">
                                    <UserAvatar url={viewUser.photo_url} alt={viewUser.display_name} frameId={viewUser.equipped_frame_id} level={viewUser.level} size="sm" />
                                    <div>
                                        <p className="font-bold text-sm">{viewUser.display_name}</p>
                                        <p className="text-xs text-skin-muted">{new Date(post.created_at).toLocaleDateString('vi-VN')}</p>
                                    </div>
                                </div>
                                <div className="aspect-[3/4] bg-black relative">
                                    <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="p-4">
                                    <div className="flex items-center gap-4 mb-3 text-skin-muted">
                                        <i className="ph-fill ph-heart"></i> {post.likes_count}
                                        <i className="ph-fill ph-chat-circle ml-2"></i> {post.comments_count}
                                    </div>
                                    <p className="text-sm text-skin-base">
                                        <span className="font-bold mr-2">{viewUser.display_name}</span>
                                        {post.caption}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            <CreatorFooter onInfoLinkClick={() => {}} />
            <BottomNavBar activeTab="tool" onTabChange={navigate} onCheckInClick={() => {}} />
        </div>
    );
};

export default UserProfilePage;
