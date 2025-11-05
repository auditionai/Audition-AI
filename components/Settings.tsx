import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { getRankForLevel, calculateLevelFromXp } from '../utils/rankUtils.ts';
import XPProgressBar from './common/XPProgressBar.tsx';
import ConfirmationModal from './ConfirmationModal.tsx';

const Settings: React.FC = () => {
    const { user, logout, showToast } = useAuth();
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);

    useEffect(() => {
        if (user) {
            setDisplayName(user.display_name);
        }
    }, [user]);

    if (!user) {
        return <div className="text-center p-12 text-white">Vui lòng đăng nhập để xem cài đặt.</div>;
    }

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // In a real app, this would be an API call
            // For the demo, we'll just simulate it.
            console.log("Saving new display name:", displayName);
            showToast('Tên hiển thị đã được cập nhật!', 'success');
            // Optimistic update in real app would be done in context
        } catch (error) {
            showToast('Lỗi khi cập nhật tên.', 'error');
        } finally {
            setIsSaving(false);
            setIsEditing(false);
        }
    };
    
    const handleLogout = async () => {
        await logout();
        setLogoutModalOpen(false);
    };

    const userLevel = calculateLevelFromXp(user.xp);
    const rank = getRankForLevel(userLevel);

    return (
        <div className="container mx-auto px-4 py-8 text-white animate-fade-in max-w-2xl">
            <h1 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Cài đặt Tài khoản</h1>

            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <img src={user.photo_url} alt={user.display_name} className="w-24 h-24 rounded-full border-4 border-pink-500/50" />
                    <div className="flex-grow text-center sm:text-left">
                        {isEditing ? (
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full bg-white/10 text-2xl font-bold p-2 rounded-md outline-none ring-2 ring-pink-500"
                            />
                        ) : (
                            <h2 className="text-2xl font-bold">{displayName}</h2>
                        )}
                        <p className={`text-sm font-semibold flex items-center justify-center sm:justify-start gap-1.5 mt-1 ${rank.color}`}>
                            {rank.icon} Cấp {userLevel} - {rank.title}
                        </p>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                             <button onClick={() => { setIsEditing(false); setDisplayName(user.display_name); }} className="px-4 py-2 text-sm font-semibold bg-white/10 rounded-md hover:bg-white/20 transition">Hủy</button>
                             <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 text-sm font-bold bg-pink-600 rounded-md hover:bg-pink-500 transition disabled:opacity-50">
                                {isSaving ? 'Đang lưu...' : 'Lưu'}
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
                            <i className="ph-fill ph-pencil-simple text-xl"></i>
                        </button>
                    )}
                </div>
                
                <div className="mt-8 border-t border-white/10 pt-6">
                     <XPProgressBar currentXp={user.xp} currentLevel={userLevel} />
                </div>
            </div>
            
            <div className="mt-6 bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
                <h3 className="font-semibold mb-4">Quản lý Tài khoản</h3>
                <button 
                    onClick={() => setLogoutModalOpen(true)}
                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors flex items-center gap-3"
                >
                    <i className="ph-fill ph-sign-out text-xl"></i>
                    <span>Đăng xuất</span>
                </button>
            </div>

            <ConfirmationModal
                isOpen={isLogoutModalOpen}
                onClose={() => setLogoutModalOpen(false)}
                onConfirm={handleLogout}
                title="Xác nhận Đăng xuất"
                message="Bạn có chắc chắn muốn đăng xuất khỏi tài khoản của mình không?"
                confirmText="Đăng xuất"
            />
        </div>
    );
};

export default Settings;
