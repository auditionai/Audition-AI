
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import ThemeEffects from '../components/themes/ThemeEffects';
import UserAvatar from '../components/common/UserAvatar';
import UserBadge from '../components/common/UserBadge';
import UserName from '../components/common/UserName'; // Import UserName
import { Post, GalleryImage, CosmeticItem } from '../types';
import BottomNavBar from '../components/common/BottomNavBar';
import Modal from '../components/common/Modal';
import PostCard from '../components/social/PostCard';
import CommentModal from '../components/social/CommentModal';
import { useTranslation } from '../hooks/useTranslation';

const ProfilePage: React.FC = () => {
    const { user, session, supabase, showToast, navigate, updateUserProfile } = useAuth();
    const { theme } = useTheme();
    const { t } = useTranslation();
    
    // Tabs
    const [activeTab, setActiveTab] = useState<'feed' | 'inventory'>('feed');

    // Feed Logic
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoadingPosts, setIsLoadingPosts] = useState(true);
    const [isPostModalOpen, setIsPostModalOpen] = useState(false);
    const [myImages, setMyImages] = useState<GalleryImage[]>([]);
    const [selectedImageForPost, setSelectedImageForPost] = useState<GalleryImage | null>(null);
    const [caption, setCaption] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);

    // Inventory Logic
    const [inventoryItems, setInventoryItems] = useState<CosmeticItem[]>([]);
    const [isLoadingInventory, setIsLoadingInventory] = useState(false);

    // 3D Tilt Effect Ref
    const cardRef = useRef<HTMLDivElement>(null);

    // --- FETCH POSTS (Server-side) ---
    const fetchPosts = useCallback(async () => {
        if (!session) return;
        
        try {
            const response = await fetch('/.netlify/functions/get-posts', {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            
            if (!response.ok) throw new Error('Failed to load posts');
            
            const data = await response.json();
            setPosts(data);
        } catch (error) {
            console.error("Error fetching posts:", error);
        } finally {
            setIsLoadingPosts(false);
        }
    }, [session]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // --- FETCH INVENTORY ---
    const fetchInventory = useCallback(async () => {
        if (!session) return;
        setIsLoadingInventory(true);
        try {
            const res = await fetch('/.netlify/functions/get-shop-items', {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (!res.ok) throw new Error('Failed to load inventory');
            const allItems: CosmeticItem[] = await res.json();
            
            // Filter: Show ONLY owned items or default items (price 0)
            const ownedItems = allItems.filter(item => item.owned || item.price === 0);
            setInventoryItems(ownedItems);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingInventory(false);
        }
    }, [session]);

    useEffect(() => {
        if (activeTab === 'inventory') {
            fetchInventory();
        }
    }, [activeTab, fetchInventory]);

    // --- EQUIP ITEM ---
    const handleEquip = async (type: 'frame' | 'title' | 'name_effect', itemId: string) => {
        if (!session) return;
        
        // Optimistic UI update value (null if default)
        const optimisticValue = itemId === 'default' ? undefined : itemId;

        try {
            // Update local state immediately for responsiveness
            if (type === 'frame') updateUserProfile({ equipped_frame_id: optimisticValue });
            if (type === 'title') updateUserProfile({ equipped_title_id: optimisticValue });
            if (type === 'name_effect') updateUserProfile({ equipped_name_effect_id: optimisticValue });

            const res = await fetch('/.netlify/functions/update-appearance', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ type, itemId }),
            });
            
            if (!res.ok) throw new Error('Failed to update appearance');
            
            showToast(t('creator.settings.personalization.success'), 'success');
        } catch (error: any) {
            // Revert on error would be complex here without storing previous state, 
            // but usually not critical for cosmetic equip.
            showToast(error.message, 'error');
        }
    };

    // --- POSTING LOGIC ---
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
        if (!selectedImageForPost || !user || !session) return;
        setIsPosting(true);
        try {
            const response = await fetch('/.netlify/functions/create-post', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    imageUrl: selectedImageForPost.image_url,
                    caption: caption
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Lỗi khi đăng bài");
            
            showToast(data.message, "success");
            
            // Update local state immediately
            setIsPostModalOpen(false);
            setCaption('');
            setSelectedImageForPost(null);
            
            // Prepend new post to list
            if (data.post) {
                setPosts(prev => [data.post, ...prev]);
            } else {
                fetchPosts(); // Fallback
            }
            
            // Update points in context
            if (data.newWeeklyPoints !== undefined) {
                updateUserProfile({ weekly_points: data.newWeeklyPoints });
            }

        } catch (e: any) {
            showToast(e.message || "Lỗi khi đăng bài", "error");
        } finally {
            setIsPosting(false);
        }
    };

    // --- DELETE POST ---
    const handleDeletePost = async (postId: string) => {
        if (!session) return;
        if (!confirm(t('creator.myCreations.delete.confirm'))) return;

        try {
            const res = await fetch('/.netlify/functions/delete-post', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ postId })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setPosts(prev => prev.filter(p => p.id !== postId));
            showToast(t('creator.myCreations.delete.success'), "success");
        } catch (e: any) {
            showToast(e.message, "error");
        }
    };

    // --- 3D CARD EFFECT ---
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
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="profile" onNavigate={navigate} onCheckInClick={() => {}} />
            
            <main className="flex-grow pt-24 container mx-auto px-4 max-w-5xl">
                
                {/* 3D Profile Card Section */}
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
                                    <UserName user={user} />
                                </h1>
                                <div className="flex justify-center mt-2">
                                    <UserBadge titleId={user.equipped_title_id} level={user.level} className="scale-110" />
                                </div>
                            </div>

                            {/* Bio */}
                            <p className="profile-bio">
                                {user.bio || t('creator.profile.bioPlaceholder')}
                            </p>

                            {/* Stats Row */}
                            <div className="profile-stats-row">
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-pink-400">{user.total_likes || 0}</span>
                                    <span className="profile-stat-label">{t('creator.profile.hearts')}</span>
                                </div>
                                <div className="w-px bg-white/10"></div>
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-cyan-400">{user.profile_views || 0}</span>
                                    <span className="profile-stat-label">{t('creator.profile.views')}</span>
                                </div>
                                <div className="w-px bg-white/10"></div>
                                <div className="profile-stat-item">
                                    <span className="profile-stat-value text-yellow-400">{user.weekly_points || 0}</span>
                                    <span className="profile-stat-label">{t('creator.profile.fame')}</span>
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

                {/* Actions Bar (Only visible in Feed tab) */}
                {activeTab === 'feed' && (
                    <div className="flex justify-center my-8">
                        <button 
                            onClick={handleOpenPostModal}
                            className="themed-button-primary px-8 py-3 font-bold flex items-center gap-2 rounded-full shadow-[0_0_20px_rgba(236,72,153,0.4)] hover:shadow-[0_0_30px_rgba(236,72,153,0.6)] transition-all transform hover:-translate-y-1"
                        >
                            <i className="ph-fill ph-plus-circle text-xl"></i> {t('creator.profile.newPost')}
                        </button>
                    </div>
                )}

                {/* Content Tabs */}
                <div className="border-b border-skin-border mb-6 mt-8">
                    <div className="flex gap-6 justify-center">
                        <button 
                            onClick={() => setActiveTab('feed')}
                            className={`pb-3 border-b-2 font-bold px-4 transition ${activeTab === 'feed' ? 'border-skin-accent text-skin-accent' : 'border-transparent text-skin-muted hover:text-skin-base'}`}
                        >
                            {t('creator.profile.tabs.feed')}
                        </button>
                        <button 
                            onClick={() => setActiveTab('inventory')}
                            className={`pb-3 border-b-2 font-bold px-4 transition ${activeTab === 'inventory' ? 'border-skin-accent text-skin-accent' : 'border-transparent text-skin-muted hover:text-skin-base'}`}
                        >
                            {t('creator.profile.tabs.inventory')}
                        </button>
                        <button 
                            className="pb-3 border-b-2 border-transparent text-skin-muted hover:text-skin-base font-semibold transition px-4" 
                            onClick={() => navigate('my-creations')}
                        >
                            {t('creator.profile.tabs.creations')}
                        </button>
                    </div>
                </div>

                {/* --- TAB CONTENT: FEED --- */}
                {activeTab === 'feed' && (
                    <>
                        {isLoadingPosts ? (
                            <div className="text-center py-12"><div className="w-8 h-8 border-4 border-skin-accent border-t-transparent rounded-full animate-spin mx-auto"></div></div>
                        ) : posts.length === 0 ? (
                            <div className="text-center py-20 bg-skin-fill-secondary rounded-xl border border-skin-border border-dashed opacity-60">
                                <i className="ph-fill ph-camera text-6xl text-skin-muted mb-4"></i>
                                <p className="text-lg font-semibold">{t('creator.profile.feedEmpty')}</p>
                                <p className="text-skin-muted">{t('creator.profile.feedEmptyDesc')}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
                                {posts.map(post => (
                                    <PostCard 
                                        key={post.id} 
                                        post={post} 
                                        currentUser={user} 
                                        onCommentClick={(p) => setSelectedPostForComments(p)} 
                                        onDelete={handleDeletePost}
                                        onUserClick={(id) => navigate(`user/${id}`)}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* --- TAB CONTENT: INVENTORY --- */}
                {activeTab === 'inventory' && (
                    <div className="animate-fade-in">
                        {isLoadingInventory ? (
                            <div className="text-center py-12"><div className="w-8 h-8 border-4 border-skin-accent border-t-transparent rounded-full animate-spin mx-auto"></div></div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {/* Frames Section */}
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">{t('creator.profile.inventory.frames')}</h3>
                                    <div className="grid grid-cols-3 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                                        {inventoryItems.filter(i => i.type === 'frame').map(frame => {
                                            const isActive = user.equipped_frame_id === frame.id;
                                            const displayName = frame.nameKey ? t(frame.nameKey) : frame.name;
                                            return (
                                                <div 
                                                    key={frame.id}
                                                    onClick={() => handleEquip('frame', frame.id)}
                                                    className={`aspect-square bg-skin-fill-secondary rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer relative transition hover:scale-105 ${isActive ? 'border-skin-accent shadow-lg shadow-skin-accent/20' : 'border-transparent hover:border-white/20'}`}
                                                >
                                                    {isActive && <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full shadow-sm"></div>}
                                                    <div className="relative w-12 h-12 mb-2">
                                                        <div className={`absolute inset-0 rounded-full overflow-hidden ${frame.cssClass}`}>
                                                            <img src={user.photo_url} alt="preview" className="w-full h-full object-cover opacity-80" />
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] text-center px-1 truncate w-full text-gray-300">{displayName}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Titles Section */}
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">{t('creator.profile.inventory.titles')}</h3>
                                    <div className="grid grid-cols-2 gap-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                                        {inventoryItems.filter(i => i.type === 'title').map(title => {
                                            const isActive = user.equipped_title_id === title.id;
                                            return (
                                                <div 
                                                    key={title.id}
                                                    onClick={() => handleEquip('title', title.id)}
                                                    className={`p-3 bg-skin-fill-secondary rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer relative transition hover:scale-105 ${isActive ? 'border-skin-accent shadow-lg shadow-skin-accent/20' : 'border-transparent hover:border-white/20'}`}
                                                >
                                                    {isActive && <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full shadow-sm"></div>}
                                                    <div className="mb-2">
                                                        <UserBadge titleId={title.id} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Name Effects Section (NEW) */}
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">Hiệu Ứng Tên</h3>
                                    <div className="grid grid-cols-1 gap-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                                        {inventoryItems.filter(i => i.type === 'name_effect').map(effect => {
                                            const isActive = user.equipped_name_effect_id === effect.id;
                                            return (
                                                <div 
                                                    key={effect.id}
                                                    onClick={() => handleEquip('name_effect', effect.id)}
                                                    className={`p-3 bg-skin-fill-secondary rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer relative transition hover:scale-105 ${isActive ? 'border-skin-accent shadow-lg shadow-skin-accent/20' : 'border-transparent hover:border-white/20'}`}
                                                >
                                                    {isActive && <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full shadow-sm"></div>}
                                                    <div className="mb-1">
                                                        <UserName name={user.display_name} effectId={effect.id} className="text-lg" />
                                                    </div>
                                                    <span className="text-[10px] text-gray-400">{effect.name}</span>
                                                </div>
                                            );
                                        })}
                                        {/* Option to unequip */}
                                        <div 
                                            onClick={() => handleEquip('name_effect', 'default')}
                                            className={`p-3 bg-skin-fill-secondary rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer relative transition hover:scale-105 border-transparent hover:border-white/20`}
                                        >
                                            <span className="text-gray-400">Mặc định (Không hiệu ứng)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </main>

            <CreatorFooter onInfoLinkClick={() => {}} />
            <BottomNavBar activeTab="profile" onTabChange={navigate} onCheckInClick={() => {}} />

            {/* Post Modal */}
            <Modal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} title={t('creator.profile.postModal.title')}>
                <div className="space-y-4">
                    {!selectedImageForPost ? (
                        <div>
                            <p className="mb-2 text-sm text-skin-muted">{t('creator.profile.postModal.select')}</p>
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
                                    placeholder={t('creator.profile.postModal.caption')}
                                    value={caption}
                                    onChange={e => setCaption(e.target.value)}
                                />
                                <div className="flex gap-2 mt-auto">
                                    <button onClick={() => setSelectedImageForPost(null)} className="themed-button-secondary flex-1 text-sm">{t('creator.profile.postModal.change')}</button>
                                    <button onClick={handlePost} disabled={isPosting} className="themed-button-primary flex-1 text-sm">
                                        {isPosting ? t('creator.profile.postModal.posting') : t('creator.profile.postModal.post')}
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
