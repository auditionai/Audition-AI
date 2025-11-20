import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { TransactionLogEntry, CosmeticItem } from '../types';
import XPProgressBar from './common/XPProgressBar';
import RedeemGiftCode from './user/RedeemGiftCode';
import Dashboard from './admin/Dashboard';
import GiftCodeManager from './admin/GiftCodeManager';
import TransactionManager from './admin/TransactionManager';
import UserManager from './admin/UserManager';
import CreditPackageManager from './admin/CreditPackageManager';
import CheckInRewardManager from './admin/CheckInRewardManager';
import AnnouncementManager from './admin/AnnouncementManager';
import ApiKeyManager from './admin/ApiKeyManager';
import { resizeImage } from '../utils/imageUtils';
import { useTranslation } from '../hooks/useTranslation';
import { AVATAR_FRAMES, ACHIEVEMENT_TITLES, checkRequirement } from '../constants/cosmetics';
import UserAvatar from './common/UserAvatar';
import UserBadge from './common/UserBadge';

// --- NEW: Personalization Panel Component ---
const PersonalizationPanel: React.FC = () => {
    const { user, updateUserProfile, showToast, session } = useAuth();
    const { t } = useTranslation();
    const [activeSubTab, setActiveSubTab] = useState<'frames' | 'titles'>('frames');
    const [isLoading, setIsLoading] = useState(false);
    
    // Calculate user stats for locking logic (Approximation using available data)
    // Ideally, we should fetch precise 'creations_count' from DB, but user.xp correlates somewhat.
    // For a perfect implementation, we'd need to fetch creation count. For now, let's mock creations based on XP/10.
    const userStats = useMemo(() => ({
        level: user?.level || 1,
        xp: user?.xp || 0,
        diamonds: user?.diamonds || 0,
        creations: Math.floor((user?.xp || 0) / 10), // Approx
        checkinStreak: user?.consecutive_check_in_days || 0
    }), [user]);

    const handleEquip = async (item: CosmeticItem) => {
        if (!user || !session) return;
        
        // Optimistic update
        if (item.type === 'frame') updateUserProfile({ equipped_frame_id: item.id });
        else updateUserProfile({ equipped_title_id: item.id });

        try {
            await fetch('/.netlify/functions/update-appearance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ type: item.type, itemId: item.id }),
            });
            showToast(t('creator.settings.personalization.equipped'), 'success');
        } catch (e) {
            showToast('Lỗi khi lưu trang bị.', 'error');
        }
    };

    const renderItems = (items: CosmeticItem[]) => (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {items.map(item => {
                const isUnlocked = checkRequirement(item, userStats);
                const isEquipped = item.type === 'frame' ? user?.equipped_frame_id === item.id : user?.equipped_title_id === item.id;
                
                return (
                    <div 
                        key={item.id} 
                        className={`relative bg-[#12121A] border rounded-xl p-4 flex flex-col items-center text-center transition-all duration-300 ${isEquipped ? 'border-skin-accent shadow-accent' : 'border-skin-border hover:border-skin-border-accent'}`}
                        onClick={() => isUnlocked && handleEquip(item)}
                    >
                        {/* Visual Preview */}
                        <div className="mb-4 h-20 flex items-center justify-center w-full">
                            {item.type === 'frame' ? (
                                <div className={`avatar-frame-container ${item.cssClass} w-16 h-16`}>
                                    <img src={user?.photo_url} alt="" className="rounded-full w-full h-full object-cover" />
                                </div>
                            ) : (
                                <span className={`title-badge ${item.cssClass} text-base`}>{item.name}</span>
                            )}
                        </div>

                        <h4 className="font-bold text-sm text-skin-base mb-1">{item.name}</h4>
                        <p className="text-xs text-skin-muted mb-3 line-clamp-2 h-8">{item.description}</p>

                        {isEquipped ? (
                             <div className="mt-auto px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full flex items-center gap-1">
                                <i className="ph-fill ph-check-circle"></i> {t('creator.settings.personalization.using')}
                             </div>
                        ) : isUnlocked ? (
                            <button className="mt-auto px-3 py-1 bg-skin-accent/10 text-skin-accent hover:bg-skin-accent/20 text-xs font-bold rounded-full w-full transition">
                                {t('creator.settings.personalization.equip')}
                            </button>
                        ) : (
                            <div className="mt-auto text-xs text-gray-500 flex flex-col items-center gap-1">
                                <i className="ph-fill ph-lock-key text-lg"></i>
                                <span>{item.requirement.description}</span>
                            </div>
                        )}
                        
                        {/* Rarity Badge */}
                        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full rarity-${item.rarity} bg-current`}></div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="bg-[#12121A]/80 border border-skin-border rounded-2xl shadow-lg p-6 mt-8 animate-fade-in">
            <h3 className="text-2xl font-bold mb-6 text-skin-accent flex items-center gap-2">
                <i className="ph-fill ph-paint-brush-broad"></i> {t('creator.settings.personalization.title')}
            </h3>
            
            <div className="flex border-b border-skin-border mb-6">
                <button 
                    onClick={() => setActiveSubTab('frames')} 
                    className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${activeSubTab === 'frames' ? 'border-skin-accent text-skin-accent' : 'border-transparent text-skin-muted hover:text-skin-base'}`}
                >
                    {t('creator.settings.personalization.frames')}
                </button>
                <button 
                    onClick={() => setActiveSubTab('titles')} 
                    className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${activeSubTab === 'titles' ? 'border-skin-accent text-skin-accent' : 'border-transparent text-skin-muted hover:text-skin-base'}`}
                >
                    {t('creator.settings.personalization.titles')}
                </button>
            </div>
            
            {activeSubTab === 'frames' ? renderItems(AVATAR_FRAMES) : renderItems(ACHIEVEMENT_TITLES)}
        </div>
    );
};


// User-facing Transaction History Component
const TransactionHistory: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [logs, setLogs] = useState<TransactionLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!session) return;
            try {
                const res = await fetch('/.netlify/functions/transaction-history', {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                if (!res.ok) throw new Error(t('creator.settings.transactionHistory.error'));
                setLogs(await res.json());
            } catch (e: any) {
                showToast(e.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchHistory();
    }, [session, showToast, t]);

    if (isLoading) return <p className="text-center text-gray-400">{t('creator.settings.transactionHistory.loading')}</p>;

    return (
        <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2">
            {logs.length > 0 ? logs.map(log => (
                <div key={log.id} className="grid grid-cols-12 gap-2 items-center p-3 bg-white/5 rounded-lg text-sm">
                    <div className="col-span-3 md:col-span-2 text-gray-400">{new Date(log.created_at).toLocaleDateString('vi-VN')}</div>
                    <div className="col-span-6 md:col-span-7 text-white">{log.description}</div>
                    <div className={`col-span-3 text-right font-bold ${log.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {log.amount >= 0 ? '+' : ''}{log.amount.toLocaleString()} 💎
                    </div>
                </div>
            )) : <p className="text-center text-gray-500 py-8">{t('creator.settings.transactionHistory.empty')}</p>}
        </div>
    );
};

// Admin Panel
const AdminPanel: React.FC = () => {
    const { t } = useTranslation();
    type AdminTab = 'dashboard' | 'transactions' | 'users' | 'gift_codes' | 'packages' | 'rewards' | 'announcements' | 'api_keys';
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard />;
            case 'transactions': return <TransactionManager />;
            case 'users': return <UserManager />;
            case 'gift_codes': return <GiftCodeManager />;
            case 'packages': return <CreditPackageManager />;
            case 'rewards': return <CheckInRewardManager />;
            case 'announcements': return <AnnouncementManager />;
            case 'api_keys': return <ApiKeyManager />;
            default: return <p className="text-center text-gray-500 py-8">Chức năng này đang được phát triển.</p>;
        }
    };
    
    return (
        <div className="mt-12">
            <h2 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-red-500 to-orange-500 text-transparent bg-clip-text">{t('creator.settings.admin.title')}</h2>
            <div className="flex flex-wrap justify-center gap-2 border-b border-white/10 mb-6 pb-4">
                <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.dashboard')}</button>
                <button onClick={() => setActiveTab('transactions')} className={activeTab === 'transactions' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.transactions')}</button>
                <button onClick={() => setActiveTab('users')} className={activeTab === 'users' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.users')}</button>
                <button onClick={() => setActiveTab('gift_codes')} className={activeTab === 'gift_codes' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.giftCodes')}</button>
                <button onClick={() => setActiveTab('packages')} className={activeTab === 'packages' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.packages')}</button>
                <button onClick={() => setActiveTab('rewards')} className={activeTab === 'rewards' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.rewards')}</button>
                <button onClick={() => setActiveTab('announcements')} className={activeTab === 'announcements' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.announcements')}</button>
                <button onClick={() => setActiveTab('api_keys')} className={activeTab === 'api_keys' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.apiKeys')}</button>
            </div>
            <div>{renderContent()}</div>
        </div>
    );
}

// Main Settings Component
const Settings: React.FC = () => {
    const { user, session, showToast, updateUserProfile } = useAuth();
    const { t } = useTranslation();
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    
    if (!user) return null;

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (displayName.trim() === user.display_name || !displayName.trim()) return;
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/user-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`},
                body: JSON.stringify({ display_name: displayName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            updateUserProfile({ display_name: data.display_name });
            showToast(t('creator.settings.updateSuccess'), 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !session) return;

        setIsUploadingAvatar(true);
        try {
            const { dataUrl } = await resizeImage(file, 256); // Resize to 256x256 max

            const response = await fetch('/.netlify/functions/upload-avatar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ image: dataUrl }),
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || t('creator.settings.avatar.updateError'));
            }
            
            updateUserProfile({ photo_url: result.photo_url });
            showToast(t('creator.settings.avatar.updateSuccess'), 'success');

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsUploadingAvatar(false);
        }
    };
    
    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="max-w-4xl mx-auto">
                <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 flex flex-col md:flex-row items-center gap-6">
                    <div className="relative group flex-shrink-0">
                        <UserAvatar 
                            src={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id} 
                            size="xl" 
                        />
                        {isUploadingAvatar ? (
                            <div className="absolute inset-0 bg-black/70 rounded-full flex items-center justify-center">
                                <div className="w-8 h-8 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                            </div>
                        ) : (
                            <label htmlFor="avatar-upload" className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10">
                                <i className="ph-fill ph-camera text-3xl"></i>
                                <span className="sr-only">{t('creator.settings.avatar.change')}</span>
                            </label>
                        )}
                        <input
                            id="avatar-upload"
                            type="file"
                            accept="image/png, image/jpeg, image/gif"
                            className="hidden"
                            onChange={handleAvatarChange}
                            disabled={isUploadingAvatar}
                        />
                    </div>
                    <div className="flex-grow w-full">
                        <form onSubmit={handleProfileUpdate} className="flex flex-col gap-4">
                             <div className="flex flex-col sm:flex-row gap-4 items-center">
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="auth-input flex-grow"
                                />
                                <button type="submit" disabled={isSaving || displayName.trim() === user.display_name} className="themed-button-primary w-full sm:w-auto px-6 py-2 font-semibold">
                                    {isSaving ? t('creator.settings.saving') : t('creator.settings.save')}
                                </button>
                             </div>
                             <div className="flex justify-center md:justify-start">
                                <UserBadge titleId={user.equipped_title_id} className="text-sm" />
                             </div>
                        </form>
                        <div className="mt-4 w-full">
                            <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                        </div>
                    </div>
                </div>
                
                <PersonalizationPanel />

                <div className="bg-[#12121A]/80 border border-cyan-500/20 rounded-2xl shadow-lg p-6 mt-8">
                    <h3 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2">
                        <i className="ph-fill ph-star"></i>{t('creator.settings.xpGuide.title')}
                    </h3>
                    <ul className="space-y-3 text-sm text-gray-300">
                        <li className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                            <i className="ph-fill ph-calendar-check text-xl text-cyan-400 mt-1"></i>
                            <div>
                                <strong className="text-white">{t('creator.settings.xpGuide.checkIn.title')}</strong>
                                <p className="text-gray-400">{t('creator.settings.xpGuide.checkIn.description')}</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                            <i className="ph-fill ph-magic-wand text-xl text-cyan-400 mt-1"></i>
                            <div>
                                <strong className="text-white">{t('creator.settings.xpGuide.createImage.title')}</strong>
                                <p className="text-gray-400">{t('creator.settings.xpGuide.createImage.description')}</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
                            <i className="ph-fill ph-timer text-xl text-cyan-400 mt-1"></i>
                            <div>
                                <strong className="text-white">{t('creator.settings.xpGuide.active.title')}</strong>
                                <p className="text-gray-400">{t('creator.settings.xpGuide.active.description')}</p>
                            </div>
                        </li>
                    </ul>
                </div>

                <div className="mt-8">
                    <RedeemGiftCode />
                </div>

                <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 mt-8">
                     <h3 className="text-2xl font-bold mb-4 text-cyan-400">{t('creator.settings.transactionHistory.title')}</h3>
                    <TransactionHistory />
                </div>

                {user.is_admin && <AdminPanel />}
            </div>
        </div>
    );
};

export default Settings;
