import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiKey, GalleryImage } from '../types';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';
import ImageModal from './common/ImageModal';

// Component for a single API Key in the admin panel
const ApiKeyRow: React.FC<{ apiKey: ApiKey; onUpdate: (id: string, status: 'active' | 'inactive') => void; onDelete: (id: string) => void; }> = ({ apiKey, onUpdate, onDelete }) => (
    <div className="grid grid-cols-12 gap-4 items-center p-3 bg-white/5 rounded-lg">
        <div className="col-span-4 truncate">
            <p className="font-semibold text-white">{apiKey.name}</p>
            <p className="text-xs text-gray-500 truncate">{apiKey.id}</p>
        </div>
        <div className="col-span-4 text-xs text-gray-400 truncate">{apiKey.key_value}</div>
        <div className="col-span-1 text-center font-mono text-lg">{apiKey.usage_count}</div>
        <div className="col-span-3 flex items-center justify-end gap-2">
            <button
                onClick={() => onUpdate(apiKey.id, apiKey.status === 'active' ? 'inactive' : 'active')}
                className={`px-3 py-1 text-xs font-semibold rounded-full ${apiKey.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}
            >
                {apiKey.status === 'active' ? 'Active' : 'Inactive'}
            </button>
            <button onClick={() => onDelete(apiKey.id)} className="text-gray-400 hover:text-red-500 transition-colors"><i className="ph-fill ph-trash"></i></button>
        </div>
    </div>
);


const Settings: React.FC = () => {
    const { user, logout, showToast, updateUserProfile, session } = useAuth();
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [isEditingName, setIsEditingName] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    // Admin state
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [isKeysLoading, setIsKeysLoading] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');

    // Gallery state
    const [userImages, setUserImages] = useState<GalleryImage[]>([]);
    const [isImagesLoading, setIsImagesLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

    const rank = user ? getRankForLevel(user.level) : null;
    
    // Fetch user-created images
    const fetchUserImages = useCallback(async () => {
        if (!session) return;
        setIsImagesLoading(true);
        try {
            const response = await fetch('/.netlify/functions/user-gallery', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error('Không thể tải ảnh của bạn.');
            const data = await response.json();
            setUserImages(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsImagesLoading(false);
        }
    }, [session, showToast]);

    // Fetch API Keys for admin
    const fetchApiKeys = useCallback(async () => {
        if (!session || !user?.is_admin) return;
        setIsKeysLoading(true);
        try {
             const response = await fetch('/.netlify/functions/api-keys', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error('Không thể tải API keys.');
            const data = await response.json();
            setApiKeys(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsKeysLoading(false);
        }
    }, [session, showToast, user?.is_admin]);

    useEffect(() => {
        fetchUserImages();
        if (user?.is_admin) {
            fetchApiKeys();
        }
    }, [fetchUserImages, fetchApiKeys, user?.is_admin]);

    const handleUpdateName = async () => {
        if (!user || !displayName.trim() || displayName.trim() === user.display_name) {
            setIsEditingName(false);
            return;
        }
        setIsUpdating(true);
        try {
            const response = await fetch('/.netlify/functions/user-profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ display_name: displayName.trim() }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            
            updateUserProfile({ display_name: result.display_name });
            showToast('Cập nhật tên thành công!', 'success');
            setIsEditingName(false);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsUpdating(false);
        }
    };
    
    const handleAddApiKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim() || !newKeyValue.trim()) return;
        try {
            const response = await fetch('/.netlify/functions/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ name: newKeyName, key_value: newKeyValue }),
            });
            const newKey = await response.json();
            if (!response.ok) throw new Error(newKey.error);
            setApiKeys([newKey, ...apiKeys]);
            setNewKeyName('');
            setNewKeyValue('');
            showToast('Thêm API key thành công!', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleUpdateApiKey = async (id: string, status: 'active' | 'inactive') => {
        try {
            const response = await fetch('/.netlify/functions/api-keys', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id, status }),
            });
            const updatedKey = await response.json();
            if (!response.ok) throw new Error(updatedKey.error);
            setApiKeys(apiKeys.map(k => k.id === id ? updatedKey : k));
            showToast('Cập nhật key thành công!', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleDeleteApiKey = async (id: string) => {
        if (!window.confirm('Bạn có chắc muốn xóa key này không?')) return;
        try {
            const response = await fetch('/.netlify/functions/api-keys', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Lỗi khi xóa key.');
            }
            setApiKeys(apiKeys.filter(k => k.id !== id));
            showToast('Xóa key thành công!', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };
    

    if (!user || !rank) return null;

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in max-w-4xl">
             <ImageModal isOpen={!!selectedImage} onClose={() => setSelectedImage(null)} image={selectedImage} />
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Cài đặt Tài khoản</h1>
                <p className="text-lg text-gray-400">Quản lý thông tin cá nhân, xem lại tác phẩm và các cài đặt khác.</p>
            </div>
            
            {/* User Profile Section */}
            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 mb-8">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <img src={user.photo_url} alt={user.display_name} className="w-24 h-24 rounded-full border-4 border-pink-500/50" />
                    <div className="flex-grow text-center sm:text-left">
                        {isEditingName ? (
                            <div className="flex items-center gap-2">
                                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="bg-white/10 text-2xl font-bold px-3 py-1 rounded-md w-full" autoFocus />
                                <button onClick={handleUpdateName} disabled={isUpdating} className="p-2 bg-green-500/20 text-green-300 rounded-md disabled:opacity-50"><i className="ph-fill ph-check"></i></button>
                                <button onClick={() => { setIsEditingName(false); setDisplayName(user.display_name); }} className="p-2 bg-red-500/20 text-red-300 rounded-md"><i className="ph-fill ph-x"></i></button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 justify-center sm:justify-start">
                                <h2 className="text-2xl font-bold">{user.display_name}</h2>
                                <button onClick={() => setIsEditingName(true)} className="text-gray-400 hover:text-white"><i className="ph-fill ph-pencil-simple"></i></button>
                            </div>
                        )}
                        <p className="text-gray-400">{user.email}</p>
                        <div className={`mt-2 font-semibold text-lg flex items-center justify-center sm:justify-start gap-2 ${rank.color}`}>
                            {rank.icon} {rank.title} - Cấp {user.level}
                        </div>
                    </div>
                </div>
                <div className="mt-6 border-t border-white/10 pt-6">
                    <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                </div>
            </div>

            {/* User Gallery Section */}
            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 mb-8">
                <h3 className="text-2xl font-bold mb-4">Tác phẩm của bạn</h3>
                {isImagesLoading ? <p>Đang tải...</p> : userImages.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {userImages.map(img => (
                            <div key={img.id} className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer" onClick={() => setSelectedImage(img)}>
                                <img src={img.image_url} alt={img.prompt} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <i className="ph-fill ph-eye text-3xl text-white"></i>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-gray-400">Bạn chưa tạo ảnh nào. Hãy bắt đầu sáng tạo ngay!</p>}
            </div>

            {/* Admin Panel */}
            {user.is_admin && (
                 <div className="bg-[#12121A]/80 border border-yellow-500/20 rounded-2xl shadow-lg p-6 mb-8">
                    <h3 className="text-2xl font-bold mb-4 text-yellow-400 flex items-center gap-2"><i className="ph-fill ph-crown-simple"></i>Admin Panel: Quản lý API Keys</h3>
                     {isKeysLoading ? <p>Loading keys...</p> : (
                         <div className="space-y-4">
                            <form onSubmit={handleAddApiKey} className="grid grid-cols-12 gap-4">
                                <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Tên gợi nhớ" className="col-span-3 bg-white/5 p-2 rounded-md" />
                                <input type="text" value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} placeholder="Giá trị API Key" className="col-span-7 bg-white/5 p-2 rounded-md" />
                                <button type="submit" className="col-span-2 bg-pink-600 hover:bg-pink-700 text-white font-bold p-2 rounded-md">Thêm Key</button>
                            </form>
                             <div className="space-y-2">
                                {apiKeys.map(key => <ApiKeyRow key={key.id} apiKey={key} onUpdate={handleUpdateApiKey} onDelete={handleDeleteApiKey} />)}
                            </div>
                         </div>
                     )}
                </div>
            )}


            {/* Danger Zone */}
            <div className="bg-[#12121A]/80 border border-red-500/20 rounded-2xl shadow-lg p-6">
                <h3 className="text-2xl font-bold text-red-400 mb-4">Khu vực nguy hiểm</h3>
                <div className="flex justify-between items-center">
                    <p>Đăng xuất khỏi tài khoản của bạn.</p>
                    <button onClick={logout} className="px-6 py-2 font-bold bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors">
                        Đăng xuất
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
