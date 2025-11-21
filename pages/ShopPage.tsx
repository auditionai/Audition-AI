
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import ThemeEffects from '../components/themes/ThemeEffects';
import BottomNavBar from '../components/common/BottomNavBar';
import { CosmeticItem } from '../types';
import ConfirmationModal from '../components/ConfirmationModal';
import UserAvatar from '../components/common/UserAvatar';
import UserBadge from '../components/common/UserBadge';

const ShopPage: React.FC = () => {
    const { user, session, navigate, showToast, updateUserDiamonds } = useAuth();
    const { theme } = useTheme();
    
    const [items, setItems] = useState<CosmeticItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'frame' | 'title'>('frame');
    const [selectedItem, setSelectedItem] = useState<CosmeticItem | null>(null);
    const [isBuying, setIsBuying] = useState(false);

    useEffect(() => {
        if (session) {
            fetchShopItems();
        }
    }, [session]);

    const fetchShopItems = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/get-shop-items', {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            if (!res.ok) throw new Error('Failed to load shop');
            const data = await res.json();
            setItems(data);
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBuy = async () => {
        if (!selectedItem || !session) return;
        setIsBuying(true);
        try {
            const res = await fetch('/.netlify/functions/shop-buy', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    Authorization: `Bearer ${session.access_token}` 
                },
                body: JSON.stringify({ itemId: selectedItem.id })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            showToast(data.message, 'success');
            updateUserDiamonds(data.newDiamonds);
            
            // Update local state: Mark as owned (which effectively hides it due to filtering)
            setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, owned: true } : i));
            setSelectedItem(null);

        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsBuying(false);
        }
    };

    // Filter Logic: Show only UNOWNED items for the current tab
    const filteredItems = items.filter(i => i.type === activeTab && !i.owned);

    // Rarity color helper
    const getRarityColor = (rarity: string) => {
        switch (rarity) {
            case 'common': return 'text-gray-400 border-gray-600';
            case 'rare': return 'text-blue-400 border-blue-500 shadow-blue-500/20';
            case 'epic': return 'text-purple-400 border-purple-500 shadow-purple-500/20';
            case 'legendary': return 'text-yellow-400 border-yellow-500 shadow-yellow-500/20';
            case 'mythic': return 'text-red-500 border-red-600 shadow-red-500/30';
            default: return 'text-gray-400 border-gray-600';
        }
    };

    if (!user) return null;

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => navigate('buy-credits')} activeTab="shop" onNavigate={navigate} onCheckInClick={() => {}} />
            
            {selectedItem && (
                <ConfirmationModal 
                    isOpen={!!selectedItem}
                    onClose={() => setSelectedItem(null)}
                    onConfirm={handleBuy}
                    cost={selectedItem.price || 0}
                    isLoading={isBuying}
                />
            )}

            <main className="flex-grow pt-24 container mx-auto px-4 max-w-6xl animate-fade-in">
                
                {/* Header Banner */}
                <div className="relative rounded-2xl overflow-hidden mb-8 border border-skin-border interactive-3d">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-900 via-pink-800 to-red-900 opacity-80"></div>
                    <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="text-center md:text-left">
                            <h1 className="text-4xl md:text-5xl font-black text-white mb-2 drop-shadow-lg tracking-tight uppercase">
                                Cửa Hàng <span className="text-yellow-400">Thời Trang</span>
                            </h1>
                            <p className="text-pink-200 text-lg">Nâng tầm đẳng cấp - Thể hiện cá tính</p>
                        </div>
                        <div className="flex items-center gap-4 bg-black/30 px-6 py-3 rounded-full border border-white/10 backdrop-blur-sm">
                            <span className="text-sm text-gray-300">Số dư của bạn:</span>
                            <span className="text-2xl font-black text-white flex items-center gap-2">
                                {user.diamonds.toLocaleString()} <i className="ph-fill ph-diamonds-four text-pink-400"></i>
                            </span>
                            <button onClick={() => navigate('buy-credits')} className="ml-2 w-8 h-8 bg-skin-accent rounded-full flex items-center justify-center text-white hover:scale-110 transition">
                                <i className="ph-bold ph-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex justify-center gap-4 mb-8">
                    <button 
                        onClick={() => setActiveTab('frame')}
                        className={`px-8 py-3 rounded-full font-bold text-lg transition-all ${activeTab === 'frame' ? 'bg-skin-accent text-white shadow-lg shadow-skin-accent/30 scale-105' : 'bg-skin-fill-secondary text-skin-muted hover:bg-white/10'}`}
                    >
                        Khung Avatar
                    </button>
                    <button 
                        onClick={() => setActiveTab('title')}
                        className={`px-8 py-3 rounded-full font-bold text-lg transition-all ${activeTab === 'title' ? 'bg-skin-accent text-white shadow-lg shadow-skin-accent/30 scale-105' : 'bg-skin-fill-secondary text-skin-muted hover:bg-white/10'}`}
                    >
                        Danh Hiệu
                    </button>
                </div>

                {/* Items Grid */}
                {isLoading ? (
                    <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-t-skin-accent border-white/10 rounded-full animate-spin"></div></div>
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-20 text-skin-muted opacity-70">
                        <i className="ph-fill ph-shopping-bag-open text-6xl mb-4"></i>
                        <p className="text-lg font-semibold">Bạn đã sở hữu tất cả vật phẩm trong danh mục này!</p>
                        <p className="text-sm">Hãy kiểm tra bên Tủ Đồ trong trang cá nhân.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6 pb-12">
                        {filteredItems.map(item => (
                            <div 
                                key={item.id} 
                                className={`bg-skin-fill-secondary rounded-xl p-4 flex flex-col items-center border-2 transition-all duration-300 hover:-translate-y-2 group relative ${getRarityColor(item.rarity)}`}
                            >
                                {/* Rarity Badge */}
                                <div className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-black/50 backdrop-blur-sm border border-white/10`}>
                                    {item.rarity}
                                </div>

                                {/* Preview Area */}
                                <div className="h-28 w-full flex items-center justify-center mb-4 relative">
                                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition"></div>
                                    {item.type === 'frame' ? (
                                        <UserAvatar url={user.photo_url} alt="preview" size="lg" frameId={item.id} className="scale-110" />
                                    ) : (
                                        // Manually constructing title preview for shop to force use of this specific title
                                        <div className="scale-125">
                                            <UserBadge titleId={item.id} level={user.level} />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <h3 className="font-bold text-white text-center mb-1 truncate w-full">{item.name || item.nameKey}</h3>
                                <div className="mb-3 h-4"></div>

                                {/* Action Button */}
                                <button 
                                    onClick={() => setSelectedItem(item)}
                                    className="w-full py-2 bg-white/10 hover:bg-skin-accent hover:text-white text-white font-bold rounded-lg border border-white/20 transition-colors flex items-center justify-center gap-1"
                                >
                                    <i className="ph-fill ph-shopping-cart"></i> {item.price} 💎
                                </button>
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

export default ShopPage;
