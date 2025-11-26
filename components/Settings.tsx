
import React, { useState, useEffect } from 'react';
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
import GameConfigManager from './admin/GameConfigManager'; 
import LuckyWheelManager from './admin/LuckyWheelManager'; 
import SystemMessageManager from './admin/SystemMessageManager'; 
import PromotionManager from './admin/PromotionManager'; // NEW
import { resizeImage } from '../utils/imageUtils';
import { useTranslation } from '../hooks/useTranslation';
import UserAvatar from './common/UserAvatar';
import UserBadge from './common/UserBadge';
import RedeemGiftCode from './user/RedeemGiftCode'; 
import TransactionHistory from './user/TransactionHistory';

// XP Guide Component
const XPGuide: React.FC = () => {
    const { t } = useTranslation();
    
    const guides = [
        {
            icon: 'ph-calendar-check',
            color: 'text-green-400',
            bg: 'bg-green-500/10',
            key: 'checkIn'
        },
        {
            icon: 'ph-magic-wand',
            color: 'text-pink-400',
            bg: 'bg-pink-500/10',
            key: 'createImage'
        },
        {
            icon: 'ph-clock',
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            key: 'active'
        }
    ];

    return (
        <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl p-6 mb-8 shadow-lg">
            <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <i className="ph-fill ph-graduation-cap text-yellow-400"></i>
                {t('creator.xpGuide.title')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {guides.map((item) => (
                    <div key={item.key} className="bg-black/20 rounded-xl p-4 border border-white/5 flex flex-col items-center text-center h-full hover:bg-white/5 transition-colors">
                        <div className={`w-12 h-12 rounded-full ${item.bg} ${item.color} flex items-center justify-center mb-3 text-2xl shadow-lg`}>
                            <i className={`ph-fill ${item.icon}`}></i>
                        </div>
                        <h4 className="font-bold text-white text-sm mb-1">{t(`creator.xpGuide.${item.key}.title`)}</h4>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            {t(`creator.xpGuide.${item.key}.description`)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Referral Panel
const ReferralPanel: React.FC = () => {
    const { user, showToast } = useAuth();
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    if (!user) return null;

    // Generate referral code from user ID (first 8 chars, uppercase)
    const referralCode = user.id.substring(0, 8).toUpperCase();

    const handleCopy = () => {
        navigator.clipboard.writeText(referralCode);
        setCopied(true);
        showToast(t('modals.image.copied'), 'success');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-gradient-to-r from-indigo-900/80 to-purple-900/80 border border-indigo-500/30 rounded-2xl shadow-lg p-6 mb-8 max-w-4xl mx-auto relative overflow-hidden">
            {/* Decorative background */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-1">
                    <h3 className="text-2xl font-bold mb-2 text-indigo-300 flex items-center gap-2">
                        <i className="ph-fill ph-users-three"></i> {t('creator.settings.referral.title')}
                    </h3>
                    <p className="text-indigo-100/80 text-sm leading-relaxed">
                        {t('creator.settings.referral.desc')} <span className="font-bold text-yellow-400">{t('creator.settings.referral.bonus')}</span>.
                    </p>
                </div>
                
                <div className="flex flex-col items-center gap-2 w-full md:w-auto">
                    <span className="text-xs text-indigo-300 font-semibold uppercase">{t('creator.settings.referral.myCode')}</span>
                    <div className="flex items-center gap-2 w-full">
                        <div className="bg-black/30 border border-indigo-500/30 rounded-lg px-4 py-3 font-mono text-xl font-bold text-white tracking-wider text-center flex-grow md:w-48">
                            {referralCode}
                        </div>
                        <button 
                            onClick={handleCopy}
                            className={`p-3 rounded-lg transition-all duration-300 ${copied ? 'bg-green-500 text-white' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}
                        >
                            <i className={`ph-fill ${copied ? 'ph-check' : 'ph-copy'} text-xl`}></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Admin Panel
const AdminPanel: React.FC = () => {
    const { t } = useTranslation();
    type AdminTab = 'dashboard' | 'transactions' | 'users' | 'gift_codes' | 'packages' | 'promotions' | 'rewards' | 'announcements' | 'api_keys' | 'game_config' | 'lucky_wheel' | 'broadcast';
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard />;
            case 'transactions': return <TransactionManager />;
            case 'users': return <UserManager />;
            case 'gift_codes': return <GiftCodeManager />;
            case 'packages': return <CreditPackageManager />;
            case 'promotions': return <PromotionManager />; // NEW
            case 'rewards': return <CheckInRewardManager />;
            case 'announcements': return <AnnouncementManager />;
            case 'api_keys': return <ApiKeyManager />;
            case 'game_config': return <GameConfigManager />;
            case 'lucky_wheel': return <LuckyWheelManager />;
            case 'broadcast': return <SystemMessageManager />;
            default: return <p className="text-center text-gray-500 py-8">Chức năng này đang được phát triển.</p>;
        }
    };
    
    return (
        <div className="mt-12">
            <h2 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-red-500 to-orange-500 text-transparent bg-clip-text">{t('creator.settings.admin.title')}</h2>
            <div className="flex flex-wrap justify-center gap-2 border-b border-white/10 mb-6 pb-4">
                <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.dashboard')}</button>
                <button onClick={() => setActiveTab('broadcast')} className={activeTab === 'broadcast' ? 'admin-tab-active' : 'admin-tab'}><i className="ph-fill ph-megaphone mr-1"></i> {t('creator.settings.admin.tabs.broadcast')}</button>
                <button onClick={() => setActiveTab('game_config')} className={activeTab === 'game_config' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.gameConfig.title')}</button>
                <button onClick={() => setActiveTab('lucky_wheel')} className={activeTab === 'lucky_wheel' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.luckyWheel')}</button>
                <button onClick={() => setActiveTab('transactions')} className={activeTab === 'transactions' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.transactions')}</button>
                <button onClick={() => setActiveTab('users')} className={activeTab === 'users' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.users')}</button>
                <button onClick={() => setActiveTab('gift_codes')} className={activeTab === 'gift_codes' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.giftCodes')}</button>
                <button onClick={() => setActiveTab('packages')} className={activeTab === 'packages' ? 'admin-tab-active' : 'admin-tab'}>{t('creator.settings.admin.tabs.packages')}</button>
                {/* NEW PROMOTION TAB */}
                <button onClick={() => setActiveTab('promotions')} className={activeTab === 'promotions' ? 'admin-tab-active' : 'admin-tab'}><i className="ph-fill ph-percent mr-1"></i> Khuyến Mại</button>
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
    const { user, session, showToast, updateUserProfile, updateUserDiamonds } = useAuth();
    const { t } = useTranslation();
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    
    // Check for pending referral code on mount
    useEffect(() => {
        const checkReferral = async () => {
            const pendingCode = localStorage.getItem('pendingReferralCode');
            if (pendingCode && session) {
                try {
                    const res = await fetch('/.netlify/functions/process-referral', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({ referralCode: pendingCode }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                        showToast('Nhập mã giới thiệu thành công! +5 Kim Cương', 'success');
                        updateUserDiamonds(user!.diamonds + 5);
                    } else {
                        console.log("Referral process info:", data.error);
                    }
                } catch (e) {
                    console.error("Referral error:", e);
                } finally {
                    localStorage.removeItem('pendingReferralCode');
                }
            }
        };
        checkReferral();
    }, [session, showToast, updateUserDiamonds, user]);

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
            const { dataUrl } = await resizeImage(file, 256); 

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
                <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 flex flex-col md:flex-row items-center gap-6 mb-8">
                    <div className="relative group flex-shrink-0">
                        <UserAvatar 
                            url={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id}
                            level={user.level}
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
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{t('creator.settings.personalization.currentTitle')}:</span>
                                    <UserBadge titleId={user.equipped_title_id} level={user.level} />
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
                
                <XPGuide />
                <ReferralPanel />
                <RedeemGiftCode />
                
                {/* Transaction History for all users */}
                <TransactionHistory />

                {/* Admin Panel if applicable */}
                {user.is_admin && <AdminPanel />}
            </div>
        </div>
    );
};

export default Settings;
