import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiKey, GalleryImage, AdminManagedUser, CreditPackage, AdminTransaction } from '../types';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';
import ImageModal from './common/ImageModal';
import Modal from './common/Modal';
import { RANKS } from '../constants/ranks';

// Component for a single API Key in the admin panel
const ApiKeyRow: React.FC<{ apiKey: ApiKey; onUpdate: (id: string, status: 'active' | 'inactive') => void; onDelete: (id: string) => void; }> = ({ apiKey, onUpdate, onDelete }) => {
    const cost = apiKey.usage_count * 1000;
    return (
        <div className="grid grid-cols-12 gap-4 items-center p-3 bg-white/5 rounded-lg text-sm">
            <div className="col-span-3 truncate">
                <p className="font-semibold text-white">{apiKey.name}</p>
                <p className="text-xs text-gray-500 truncate">{apiKey.id}</p>
            </div>
            <div className="col-span-3 text-xs text-gray-400 truncate">{apiKey.key_value}</div>
            <div className="col-span-2 text-center">
                <p className="font-mono text-lg text-white">{apiKey.usage_count}</p>
            </div>
            <div className="col-span-2 text-center">
                <p className="font-mono text-lg text-pink-400">{cost.toLocaleString('vi-VN')}đ</p>
            </div>
            <div className="col-span-2 flex items-center justify-end gap-2">
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
};


const EditUserModal: React.FC<{ user: AdminManagedUser; onClose: () => void; onSave: (userId: string, updates: any) => Promise<void>; }> = ({ user, onClose, onSave }) => {
    const [diamonds, setDiamonds] = useState(user.diamonds);
    const [xp, setXp] = useState(user.xp);
    const [isAdmin, setIsAdmin] = useState(!!user.is_admin);
    const [newPassword, setNewPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        const updates: { [key: string]: any } = {
            diamonds: Number(diamonds),
            xp: Number(xp),
            is_admin: isAdmin,
        };
        if (newPassword.trim()) {
            updates.password = newPassword.trim();
        }
        await onSave(user.id, updates);
        setIsSaving(false);
        onClose();
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={`Chỉnh sửa ${user.display_name}`}>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Kim cương</label>
                    <input type="number" value={diamonds} onChange={(e) => setDiamonds(Number(e.target.value))} className="auth-input" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">XP</label>
                    <input type="number" value={xp} onChange={(e) => setXp(Number(e.target.value))} className="auth-input" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Mật khẩu mới (bỏ trống nếu không đổi)</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="auth-input" placeholder="••••••••" />
                </div>
                <div className="flex items-center justify-between pt-2">
                    <label className="text-sm font-medium text-gray-300">Quyền Admin</label>
                    <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="w-5 h-5 rounded text-pink-500 bg-gray-700 border-gray-600 focus:ring-pink-600" />
                </div>
                <div className="flex gap-4 mt-6">
                    <button onClick={onClose} className="flex-1 py-2 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition">Hủy</button>
                    <button onClick={handleSave} disabled={isSaving} className="flex-1 py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition disabled:opacity-50">
                        {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};


const EditPackageModal: React.FC<{ pkg: CreditPackage; onClose: () => void; onSave: (id: string, updates: Partial<CreditPackage>) => void; }> = ({ pkg, onClose, onSave }) => {
    const [creditsAmount, setCreditsAmount] = useState(pkg.credits_amount);
    const [bonusCredits, setBonusCredits] = useState(pkg.bonus_credits);
    const [priceVnd, setPriceVnd] = useState(pkg.price_vnd);
    const [isFlashSale, setIsFlashSale] = useState(pkg.is_flash_sale);

    const handleSave = () => {
        onSave(pkg.id, {
            credits_amount: creditsAmount,
            bonus_credits: bonusCredits,
            price_vnd: priceVnd,
            is_flash_sale: isFlashSale,
        });
        onClose();
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Chỉnh sửa Gói Nạp">
            <div className="space-y-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Kim cương</label><input type="number" value={creditsAmount} onChange={(e) => setCreditsAmount(Number(e.target.value))} className="auth-input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Kim cương Thưởng</label><input type="number" value={bonusCredits} onChange={(e) => setBonusCredits(Number(e.target.value))} className="auth-input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Giá (VNĐ)</label><input type="number" value={priceVnd} onChange={(e) => setPriceVnd(Number(e.target.value))} className="auth-input" /></div>
                <div className="flex items-center justify-between pt-2"><label className="text-sm font-medium text-gray-300">Flash Sale</label><input type="checkbox" checked={isFlashSale} onChange={(e) => setIsFlashSale(e.target.checked)} className="w-5 h-5 rounded text-pink-500 bg-gray-700 border-gray-600 focus:ring-pink-600" /></div>
                <div className="flex gap-4 mt-6"><button onClick={onClose} className="flex-1 py-2 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition">Hủy</button><button onClick={handleSave} className="flex-1 py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition">Lưu</button></div>
            </div>
        </Modal>
    );
};


const Settings: React.FC = () => {
    const { user, logout, showToast, updateUserProfile, session } = useAuth();
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [isEditingName, setIsEditingName] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);


    // Admin state
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [isKeysLoading, setIsKeysLoading] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');
    const [isAddingKey, setIsAddingKey] = useState(false);
    
    // User management state
    const [allUsers, setAllUsers] = useState<AdminManagedUser[]>([]);
    const [isUsersLoading, setIsUsersLoading] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminManagedUser | null>(null);

    // Package management state
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isPackagesLoading, setIsPackagesLoading] = useState(false);
    const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
    const [newPackage, setNewPackage] = useState({ credits_amount: 0, bonus_credits: 0, price_vnd: 0 });

    // Transaction management state
    const [pendingTransactions, setPendingTransactions] = useState<AdminTransaction[]>([]);
    const [isTransactionsLoading, setIsTransactionsLoading] = useState(false);
    const [processingTransactionId, setProcessingTransactionId] = useState<string | null>(null);

    // Gallery state
    const [userImages, setUserImages] = useState<GalleryImage[]>([]);
    const [isImagesLoading, setIsImagesLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

    const rank = user ? getRankForLevel(user.level) : null;
    
    const fetchAdminData = useCallback(async () => {
        if (!session || !user?.is_admin) return;

        // Fetch API Keys
        setIsKeysLoading(true);
        try {
             const response = await fetch('/.netlify/functions/api-keys', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!response.ok) throw new Error('Không thể tải API keys.');
            setApiKeys(await response.json());
        } catch (error: any) { showToast(error.message, 'error'); } 
        finally { setIsKeysLoading(false); }
        
        // Fetch All Users
        setIsUsersLoading(true);
        try {
             const response = await fetch('/.netlify/functions/admin-users', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!response.ok) throw new Error('Không thể tải danh sách người dùng.');
            setAllUsers(await response.json());
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsUsersLoading(false); }
        
        // Fetch Credit Packages
        setIsPackagesLoading(true);
        try {
            const res = await fetch('/.netlify/functions/credit-packages?include_inactive=true', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!res.ok) throw new Error('Không thể tải gói nạp.');
            setPackages(await res.json());
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsPackagesLoading(false); }

        // Fetch Pending Transactions
        setIsTransactionsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-transactions', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!res.ok) throw new Error('Không thể tải các giao dịch chờ duyệt.');
            setPendingTransactions(await res.json());
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsTransactionsLoading(false); }

    }, [session, showToast, user?.is_admin]);

    useEffect(() => {
        const fetchUserImages = async () => {
            if (!session) return;
            setIsImagesLoading(true);
            try {
                const response = await fetch('/.netlify/functions/user-gallery', { headers: { Authorization: `Bearer ${session.access_token}` } });
                if (!response.ok) throw new Error('Không thể tải ảnh của bạn.');
                setUserImages(await response.json());
            } catch (error: any) { showToast(error.message, 'error'); } 
            finally { setIsImagesLoading(false); }
        };

        fetchUserImages();
        if (user?.is_admin) {
            fetchAdminData();
        }
    }, [session, showToast, user?.is_admin, fetchAdminData]);

    const handleUpdateName = async () => {
        if (!user || !displayName.trim() || displayName.trim() === user.display_name) {
            setIsEditingName(false); return;
        }
        setIsUpdating(true);
        try {
            const response = await fetch('/.netlify/functions/user-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ display_name: displayName.trim() }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            updateUserProfile({ display_name: result.display_name });
            showToast('Cập nhật tên thành công!', 'success');
            setIsEditingName(false);
        } catch (error: any) { showToast(error.message, 'error'); } 
        finally { setIsUpdating(false); }
    };
    
    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleAvatarUpload = async () => {
        if (!avatarFile) return;
        setIsUploadingAvatar(true);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(avatarFile);
            reader.onloadend = async () => {
                const base64Image = reader.result;
                const response = await fetch('/.netlify/functions/upload-avatar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                    body: JSON.stringify({ image: base64Image }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                updateUserProfile({ photo_url: result.photo_url });
                showToast('Cập nhật ảnh đại diện thành công!', 'success');
                setAvatarFile(null);
                setAvatarPreview(null);
            };
        } catch (error: any) { showToast(error.message, 'error'); } 
        finally { setIsUploadingAvatar(false); }
    };

    const handleAddApiKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim() || !newKeyValue.trim()) return;
        setIsAddingKey(true);
        try {
            const response = await fetch('/.netlify/functions/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ name: newKeyName, key_value: newKeyValue }),
            });
            const newKey = await response.json();
            if (!response.ok) throw new Error(newKey.error);
            setApiKeys([newKey, ...apiKeys]);
            setNewKeyName(''); setNewKeyValue('');
            showToast('Thêm API key thành công!', 'success');
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsAddingKey(false); }
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
        } catch (error: any) { showToast(error.message, 'error'); }
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
        } catch (error: any) { showToast(error.message, 'error'); }
    };
    
    const handleUpdateUser = async (userId: string, updates: Partial<AdminManagedUser>) => {
        try {
            const response = await fetch('/.netlify/functions/admin-users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ userId, updates }),
            });
            const updatedUser = await response.json();
            if (!response.ok) throw new Error(updatedUser.error);
            setAllUsers(allUsers.map(u => u.id === userId ? { ...u, ...updatedUser } : u));
            showToast('Cập nhật người dùng thành công!', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handlePackageUpdate = async (id: string, updates: Partial<CreditPackage>) => {
        try {
            const res = await fetch('/.netlify/functions/credit-packages', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id, ...updates }),
            });
            const updatedPkg = await res.json();
            if (!res.ok) throw new Error(updatedPkg.error);
            setPackages(packages.map(p => p.id === id ? { ...p, ...updatedPkg } : p));
            showToast('Cập nhật gói thành công!', 'success');
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleAddPackage = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/.netlify/functions/credit-packages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(newPackage),
            });
            const addedPkg = await res.json();
            if (!res.ok) throw new Error(addedPkg.error);
            setPackages([...packages, addedPkg]);
            setNewPackage({ credits_amount: 0, bonus_credits: 0, price_vnd: 0 });
            showToast('Thêm gói mới thành công!', 'success');
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleTransactionAction = async (transactionId: string, action: 'approve' | 'reject') => {
        setProcessingTransactionId(transactionId);
        try {
            const response = await fetch('/.netlify/functions/admin-transactions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ transactionId, action }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            
            setPendingTransactions(prev => prev.filter(t => t.id !== transactionId));
            showToast(`Giao dịch đã được ${action === 'approve' ? 'phê duyệt' : 'từ chối'}!`, 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setProcessingTransactionId(null);
        }
    };


    if (!user || !rank) return null;

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in max-w-4xl">
             <ImageModal isOpen={!!selectedImage} onClose={() => setSelectedImage(null)} image={selectedImage} />
             {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={handleUpdateUser} />}
             {editingPackage && <EditPackageModal pkg={editingPackage} onClose={() => setEditingPackage(null)} onSave={handlePackageUpdate} />}

            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Cài đặt Tài khoản</h1>
                <p className="text-lg text-gray-400">Quản lý thông tin cá nhân, xem lại tác phẩm và các cài đặt khác.</p>
            </div>
            
            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 mb-8">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative group w-24 h-24 flex-shrink-0">
                        <img src={avatarPreview || user.photo_url} alt={user.display_name} className="w-24 h-24 rounded-full border-4 border-pink-500/50" />
                        <label htmlFor="avatar-upload" className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                            <i className="ph-fill ph-pencil-simple text-2xl"></i>
                            <input id="avatar-upload" type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleAvatarSelect} />
                        </label>
                    </div>
                    <div className="flex-grow text-center sm:text-left w-full">
                        {isEditingName ? (
                            <div className="flex items-center gap-2">
                                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="auth-input text-2xl font-bold py-1 w-full" autoFocus />
                                <button onClick={handleUpdateName} disabled={isUpdating} className="p-2 bg-green-500/20 text-green-300 rounded-md disabled:opacity-50"><i className={`ph-fill ${isUpdating ? 'ph-spinner animate-spin' : 'ph-check'}`}></i></button>
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
                {avatarPreview && (
                    <div className="flex gap-4 mt-4 pt-4 border-t border-white/10">
                        <button onClick={() => { setAvatarPreview(null); setAvatarFile(null); }} className="flex-1 py-2 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition">Hủy</button>
                        <button onClick={handleAvatarUpload} disabled={isUploadingAvatar} className="flex-1 py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition disabled:opacity-50">
                            {isUploadingAvatar ? 'Đang tải lên...' : 'Lưu ảnh đại diện'}
                        </button>
                    </div>
                )}
                <div className="mt-6 border-t border-white/10 pt-6">
                    <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                </div>
            </div>
            
            <div className="mb-8">
                <h3 className="text-2xl font-bold mb-4 text-center">Tác phẩm của bạn</h3>
                <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
                    {isImagesLoading ? <p className="text-center text-gray-400">Đang tải tác phẩm...</p> : userImages.length > 0 ? (
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
                    ) : <p className="text-center text-gray-400 py-8">Bạn chưa tạo ảnh nào. Hãy bắt đầu sáng tạo ngay!</p>}
                </div>
            </div>


            {user.is_admin && (
                <div className="space-y-8">
                     {/* Quản lý Giao dịch */}
                    <div className="bg-[#12121A]/80 border border-blue-500/20 rounded-2xl shadow-lg p-6">
                        <h3 className="text-2xl font-bold mb-4 text-blue-400 flex items-center gap-2"><i className="ph-fill ph-check-square-offset"></i>Admin: Phê Duyệt Giao Dịch</h3>
                        {isTransactionsLoading ? <p>Đang tải giao dịch...</p> : (
                            <div className="max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                {pendingTransactions.length > 0 ? (
                                    <div className="space-y-3">
                                        {pendingTransactions.map(t => (
                                            <div key={t.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center p-3 bg-white/5 rounded-lg text-sm">
                                                <div className="md:col-span-5 flex items-center gap-3">
                                                    <img src={t.users.photo_url} alt={t.users.display_name} className="w-10 h-10 rounded-full flex-shrink-0" />
                                                    <div className="truncate">
                                                        <p className="font-semibold text-white truncate">{t.users.display_name}</p>
                                                        <p className="text-xs text-gray-400 truncate">{t.users.email}</p>
                                                    </div>
                                                </div>
                                                <div className="md:col-span-3">
                                                    <p className="font-mono text-xs text-gray-300">Order: {t.order_code}</p>
                                                    <p className="font-semibold text-green-400">{t.amount_vnd.toLocaleString('vi-VN')}đ</p>
                                                </div>
                                                <div className="md:col-span-2 text-pink-400 font-bold flex items-center gap-1.5">
                                                    <i className="ph-fill ph-diamonds-four"></i> +{t.diamonds_received}
                                                </div>
                                                <div className="md:col-span-2 flex justify-end items-center gap-2">
                                                    <button onClick={() => handleTransactionAction(t.id, 'reject')} disabled={processingTransactionId === t.id} className="px-3 py-1 text-xs font-semibold bg-red-500/20 text-red-300 rounded-md hover:bg-red-500/30 disabled:opacity-50">Từ chối</button>
                                                    <button onClick={() => handleTransactionAction(t.id, 'approve')} disabled={processingTransactionId === t.id} className="px-3 py-1 text-xs font-semibold bg-green-500/20 text-green-300 rounded-md hover:bg-green-500/30 disabled:opacity-50">Duyệt</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-gray-500 py-8">Không có giao dịch nào đang chờ phê duyệt.</p>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* Quản lý Gói Nạp */}
                    <div className="bg-[#12121A]/80 border border-green-500/20 rounded-2xl shadow-lg p-6">
                        <h3 className="text-2xl font-bold mb-4 text-green-400 flex items-center gap-2"><i className="ph-fill ph-package"></i>Admin: Quản lý Gói Nạp</h3>
                        {isPackagesLoading ? <p>Đang tải các gói...</p> : (
                            <div className="space-y-4">
                                {/* Form thêm gói mới */}
                                <form onSubmit={handleAddPackage} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-black/20 rounded-lg">
                                    <input type="number" placeholder="KC" value={newPackage.credits_amount || ''} onChange={e => setNewPackage({...newPackage, credits_amount: Number(e.target.value)})} className="auth-input" />
                                    <input type="number" placeholder="KC Thưởng" value={newPackage.bonus_credits || ''} onChange={e => setNewPackage({...newPackage, bonus_credits: Number(e.target.value)})} className="auth-input" />
                                    <input type="number" placeholder="Giá (VND)" value={newPackage.price_vnd || ''} onChange={e => setNewPackage({...newPackage, price_vnd: Number(e.target.value)})} className="auth-input" />
                                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-md">Thêm Gói</button>
                                </form>
                                {/* Danh sách các gói */}
                                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                                    {packages.map(pkg => (
                                        <div key={pkg.id} className="grid grid-cols-12 gap-4 items-center p-3 bg-white/5 rounded-lg text-sm">
                                            <div className="col-span-5 font-semibold">💎 {pkg.credits_amount.toLocaleString()} (+{pkg.bonus_credits.toLocaleString()})</div>
                                            <div className="col-span-3 text-green-400 font-bold">{pkg.price_vnd.toLocaleString()}đ</div>
                                            <div className="col-span-4 flex items-center justify-end gap-2">
                                                {pkg.is_flash_sale && <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">Sale</span>}
                                                <button onClick={() => handlePackageUpdate(pkg.id, { is_active: !pkg.is_active })} className={`px-3 py-1 text-xs font-semibold rounded-full ${pkg.is_active ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>{pkg.is_active ? 'Active' : 'Inactive'}</button>
                                                <button onClick={() => setEditingPackage(pkg)} className="text-gray-400 hover:text-white"><i className="ph-fill ph-pencil-simple"></i></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-[#12121A]/80 border border-yellow-500/20 rounded-2xl shadow-lg p-6">
                        <h3 className="text-2xl font-bold mb-4 text-yellow-400 flex items-center gap-2"><i className="ph-fill ph-key"></i>Admin: Quản lý API Keys</h3>
                        {isKeysLoading ? <p>Đang tải keys...</p> : (
                            <div className="space-y-4">
                                <form onSubmit={handleAddApiKey} className="grid grid-cols-12 gap-4">
                                    <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Tên gợi nhớ" className="col-span-12 sm:col-span-3 auth-input" />
                                    <input type="text" value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} placeholder="Giá trị API Key" className="col-span-12 sm:col-span-7 auth-input" />
                                    <button type="submit" disabled={isAddingKey} className="col-span-12 sm:col-span-2 bg-pink-600 hover:bg-pink-700 text-white font-bold p-2 rounded-md disabled:opacity-50">
                                        {isAddingKey ? <i className="ph-fill ph-spinner animate-spin"></i> : 'Thêm'}
                                    </button>
                                </form>
                                 <div className="grid grid-cols-12 gap-4 px-3 text-xs font-semibold text-gray-400 border-b border-white/10 pb-2">
                                    <div className="col-span-3">Tên / ID</div>
                                    <div className="col-span-3">Key</div>
                                    <div className="col-span-2 text-center">Sử dụng</div>
                                    <div className="col-span-2 text-center">Chi phí</div>
                                    <div className="col-span-2 text-right">Thao tác</div>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                                    {apiKeys.length > 0 ? (
                                        apiKeys.map(key => <ApiKeyRow key={key.id} apiKey={key} onUpdate={handleUpdateApiKey} onDelete={handleDeleteApiKey} />)
                                    ) : (
                                        <p className="text-center text-gray-500 py-4">Chưa có API key nào. Hãy thêm một key mới ở trên.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-[#12121A]/80 border border-cyan-500/20 rounded-2xl shadow-lg p-6">
                        <h3 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2"><i className="ph-fill ph-users"></i>Admin: Quản lý Người dùng</h3>
                        {isUsersLoading ? <p>Đang tải danh sách người dùng...</p> : (
                            <div className="max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                {allUsers.length > 0 ? (
                                <div className="space-y-2">
                                    {allUsers.map(u => (
                                        <div key={u.id} className="grid grid-cols-12 gap-4 items-center p-2 bg-white/5 rounded-lg">
                                            <div className="col-span-12 sm:col-span-6 flex items-center gap-4">
                                                <img src={u.photo_url} alt={u.display_name} className="w-10 h-10 rounded-full flex-shrink-0" />
                                                <div className="truncate">
                                                    <p className="font-semibold text-white truncate">{u.display_name} {u.is_admin && <span className="text-xs text-yellow-400">(Admin)</span>}</p>
                                                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                                                </div>
                                            </div>
                                            <div className="col-span-6 sm:col-span-2 text-left sm:text-right text-xs">
                                                <p className="text-pink-300 font-mono flex items-center gap-1"><i className="ph-fill ph-diamonds-four"></i> {u.diamonds}</p>
                                            </div>
                                            <div className="col-span-6 sm:col-span-2 text-left sm:text-right text-xs">
                                                <p className="text-cyan-300 font-mono">{u.xp} XP</p>
                                            </div>
                                            <div className="col-span-12 sm:col-span-2 flex justify-end items-center">
                                                <button onClick={() => setEditingUser(u)} className="p-2 text-gray-300 hover:text-white"><i className="ph-fill ph-pencil-simple text-lg"></i></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                ) : (
                                     <p className="text-center text-gray-500 py-4">Không tìm thấy người dùng nào.</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-[#12121A]/80 border border-purple-500/20 rounded-2xl shadow-lg p-6">
                        <h3 className="text-2xl font-bold mb-4 text-purple-400 flex items-center gap-2"><i className="ph-fill ph-barricade"></i>Admin: Quản lý Cấp Bậc (Xem)</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Các cấp bậc hiện được định cấu hình tĩnh trong mã nguồn. Việc chỉnh sửa yêu cầu thay đổi ở backend và không có sẵn trong giao diện này.
                        </p>
                        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                            {RANKS.map(rank => (
                                <div key={rank.levelThreshold} className="grid grid-cols-12 gap-4 items-center p-3 bg-white/5 rounded-lg">
                                    <div className="col-span-3 lg:col-span-2 font-bold text-lg text-center">
                                        Cấp {rank.levelThreshold}+
                                    </div>
                                    <div className={`col-span-9 lg:col-span-10 flex items-center gap-4 ${rank.color}`}>
                                        <span className="text-3xl">{rank.icon}</span>
                                        <span className="font-semibold text-lg">{rank.title}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-[#12121A]/80 border border-red-500/20 rounded-2xl shadow-lg p-6 mt-8">
                <h3 className="text-2xl font-bold text-red-400 mb-4">Khu vực nguy hiểm</h3>
                <div className="flex justify-between items-center">
                    <p>Đăng xuất khỏi tài khoản của bạn.</p>
                    <button onClick={logout} className="px-6 py-2 font-bold bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors">Đăng xuất</button>
                </div>
            </div>
        </div>
    );
};

export default Settings;