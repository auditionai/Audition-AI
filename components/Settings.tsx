
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import XPProgressBar from './common/XPProgressBar';
import Dashboard from './admin/Dashboard';
import GiftCodeManager from './admin/GiftCodeManager';
import TransactionManager from './admin/TransactionManager';
import UserManager from './admin/UserManager';
import CreditPackageManager from './admin/CreditPackageManager';
import CheckInRewardManager from './admin/CheckInRewardManager';
import AnnouncementManager from './admin/AnnouncementManager';
import ApiKeyManager from './admin/ApiKeyManager';
import GameConfigManager from './admin/GameConfigManager'; // NEW
import { resizeImage } from '../utils/imageUtils';
import { useTranslation } from '../hooks/useTranslation';
import UserAvatar from './common/UserAvatar';
import UserBadge from './common/UserBadge';
import { useGameConfig } from '../contexts/GameConfigContext'; // NEW

// Personalization Panel (Dynamic)
const PersonalizationPanel: React.FC = () => {
    const { user, session, updateUserProfile, showToast } = useAuth();
    const { frames, titles } = useGameConfig(); // Use Dynamic Config
    const { t } = useTranslation();
    
    if (!user) return null;

    const handleEquip = async (type: 'frame' | 'title', itemId: string) => {
        try {
            const res = await fetch('/.netlify/functions/update-appearance', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ type, itemId }),
            });
            
            if (!res.ok) throw new Error('Failed to update appearance');
            
            if (type === 'frame') updateUserProfile({ equipped_frame_id: itemId });
            if (type === 'title') updateUserProfile({ equipped_title_id: itemId });
            
            showToast(t('creator.settings.personalization.success'), 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const isLocked = (condition?: { level?: number }) => {
        if (!condition) return false;
        if (condition.level && user.level < condition.level) return true;
        return false;
    };

    return (
        <div className="bg-[#12121A]/80 border border-pink-500/20 rounded-2xl shadow-lg p-6 mt-8">
             <h3 className="text-2xl font-bold mb-6 text-pink-400 flex items-center gap-2">
                <i className="ph-fill ph-paint-brush-broad"></i>{t('creator.settings.personalization.title')}
            </h3>
            
            {/* Avatar Frames */}
            <div className="mb-8">
                <h4 className="text-lg font-semibold text-white mb-3">{t('creator.settings.personalization.frames')}</h4>
                <div className="cosmetic-list-horizontal">
                    {frames.map(frame => {
                        const locked = isLocked(frame.unlockCondition);
                        const active = user.equipped_frame_id === frame.id || (!user.equipped_frame_id && frame.id === 'default');
                        const displayName = frame.nameKey ? t(frame.nameKey) : frame.name;
                        
                        return (
                            <div 
                                key={frame.id} 
                                onClick={() => !locked && handleEquip('frame', frame.id)}
                                className={`cosmetic-item rarity-${frame.rarity} ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
                            >
                                <div className={`avatar-frame-container ${frame.cssClass || 'frame-none'} mb-2`} style={{ width: '64px', height: '64px' }}>
                                    <img src={user.photo_url} className="w-full h-full rounded-full object-cover" alt="preview" />
                                    {frame.imageUrl && (
                                        <img src={frame.imageUrl} alt="frame" className="absolute inset-0 w-full h-full scale-110 object-cover z-10" />
                                    )}
                                </div>
                                <span className="text-center text-gray-300 text-xs px-1" title={displayName}>{displayName}</span>
                                {locked && <span className="text-[10px] text-red-400 mt-1">Lv.{frame.unlockCondition?.level}</span>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Titles */}
            <div>
                <h4 className="text-lg font-semibold text-white mb-3">{t('creator.settings.personalization.titles')}</h4>
                <div className="cosmetic-list-horizontal">
                    {titles.map(title => {
                        const locked = isLocked(title.unlockCondition);
                        const active = user.equipped_title_id === title.id || (!user.equipped_title_id && title.id === 'newbie');
                        const displayName = title.nameKey ? t(title.nameKey) : title.name;

                        return (
                             <div 
                                key={title.id} 
                                onClick={() => !locked && handleEquip('title', title.id)}
                                className={`cosmetic-item rarity-${title.rarity} ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
                            >
                                <div className="h-12 flex items-center justify-center w-full px-2 overflow-hidden">
                                    {title.imageUrl ? (
                                        <img src={title.imageUrl} alt={displayName} className="max-h-8 w-auto object-contain" />
                                    ) : (
                                        <span className={`title-badge ${title.cssClass} text-[0.6rem]`}>{displayName}</span>
                                    )}
                                </div>
                                <span className="text-center text-gray-300 mt-2 text-xs px-1" title={displayName}>{displayName}</span>
                                {locked && <span className="text-[10px] text-red-400 mt-1">Lv.{title.unlockCondition?.level}</span>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// Admin Panel
const AdminPanel: React.FC = () => {
    const { t } = useTranslation();
    type AdminTab = 'dashboard' | 'transactions' | 'users' | 'gift_codes' | 'packages' | 'rewards' | 'announcements' | 'api_keys' | 'game_config';
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
            case 'game_config': return <GameConfigManager />;
            default: return <p className="text-center text-gray-500 py-8">Chức năng này đang được phát triển.</p>;
        }
    };
    
    return (
        <div className="mt-12">
            <h2 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-red-500 to-orange-500 text-transparent bg-clip-text">{t('creator.settings.admin.title')}</h2>
            <div className="flex flex-wrap justify-center gap-2 border-b border-white/10 mb-6 pb-4">
                <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.dashboard')}</button>
                <button onClick={() => setActiveTab('game_config')} className={activeTab === 'game_config' ? 'admin-tab-active' : 'admin-tab'}>Game Config</button>
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
                        {/* Updated to use UserAvatar with current frame */}
                        <UserAvatar 
                            url={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id}
                            size="lg"
                            className="w-28 h-28" 
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
                        <form onSubmit={handleProfileUpdate} className="flex flex-col sm:flex-row gap-4 items-center">
                            <div className="flex-grow w-full">
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="auth-input"
                                />
                                {/* Display Title Badge Preview */}
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{t('creator.settings.personalization.currentTitle')}:</span>
                                    <UserBadge titleId={user.equipped_title_id} />
                                </div>
                            </div>
                            <button type="submit" disabled={isSaving || displayName.trim() === user.display_name} className="themed-button-primary w-full sm:w-auto px-6 py-2 font-semibold">
                                {isSaving ? t('creator.settings.saving') : t('creator.settings.save')}
                            </button>
                        </form>
                        <div className="mt-4 w-full">
                            <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                        </div>
                    </div>
                </div>
                
                {/* Cosmetic Settings */}
                <PersonalizationPanel />

                {user.is_admin && <AdminPanel />}
                
                {/* Other settings blocks ... */}
            </div>
        </div>
    );
};

export default Settings;
