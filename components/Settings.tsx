import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiKey, AdminManagedUser, CreditPackage, AdminTransaction, TransactionLogEntry, Announcement } from '../types';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';
import Modal from './common/Modal';
import { RANKS } from '../constants/ranks';
import Dashboard from './admin/Dashboard';
import RedeemGiftCode from '../user/RedeemGiftCode';
import GiftCodeManager from '../admin/GiftCodeManager';

// --- NEW ---
interface CheckInReward {
    id: string;
    consecutive_days: number;
    diamond_reward: number;
    xp_reward: number;
    is_active: boolean;
    created_at: string;
}

const EditCheckInRewardModal: React.FC<{ reward: CheckInReward; onClose: () => void; onSave: (id: string, updates: Partial<CheckInReward>) => void; }> = ({ reward, onClose, onSave }) => {
    const [days, setDays] = useState(reward.consecutive_days);
    const [diamonds, setDiamonds] = useState(reward.diamond_reward);
    const [xp, setXp] = useState(reward.xp_reward);

    const handleSave = () => {
        onSave(reward.id, {
            consecutive_days: Number(days),
            diamond_reward: Number(diamonds),
            xp_reward: Number(xp),
        });
        onClose();
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Chỉnh sửa Mốc Thưởng">
            <div className="space-y-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Mốc (ngày)</label><input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className="auth-input" disabled={days === 1} /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Thưởng Kim cương</label><input type="number" value={diamonds} onChange={(e) => setDiamonds(Number(e.target.value))} className="auth-input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Thưởng XP</label><input type="number" value={xp} onChange={(e) => setXp(Number(e.target.value))} className="auth-input" /></div>
                <div className="flex gap-4 mt-6"><button onClick={onClose} className="flex-1 py-2 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition">Hủy</button><button onClick={handleSave} className="flex-1 py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition">Lưu</button></div>
            </div>
        </Modal>
    );
};
// --- END NEW ---


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
    const [name, setName] = useState(pkg.name);
    const [creditsAmount, setCreditsAmount] = useState(pkg.credits_amount);
    const [bonusCredits, setBonusCredits] = useState(pkg.bonus_credits);
    const [priceVnd, setPriceVnd] = useState(pkg.price_vnd);
    const [isFlashSale, setIsFlashSale] = useState(pkg.is_flash_sale);
    const [tag, setTag] = useState(pkg.tag || '');
    const [isFeatured, setIsFeatured] = useState(pkg.is_featured);

    const handleSave = () => {
        onSave(pkg.id, {
            name: name,
            credits_amount: creditsAmount,
            bonus_credits: bonusCredits,
            price_vnd: priceVnd,
            is_flash_sale: isFlashSale,
            tag: tag,
            is_featured: isFeatured,
        });
        onClose();
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Chỉnh sửa Gói Nạp">
            <div className="space-y-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Tên Gói</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="auth-input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Kim cương</label><input type="number" value={creditsAmount} onChange={(e) => setCreditsAmount(Number(e.target.value))} className="auth-input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Kim cương Thưởng</label><input type="number" value={bonusCredits} onChange={(e) => setBonusCredits(Number(e.target.value))} className="auth-input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Giá (VNĐ)</label><input type="number" value={priceVnd} onChange={(e) => setPriceVnd(Number(e.target.value))} className="auth-input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1">Nhãn dán (VD: Best Seller)</label><input type="text" value={tag} onChange={(e) => setTag(e.target.value)} className="auth-input" placeholder="Để trống nếu không có nhãn" /></div>
                <div className="flex items-center justify-between pt-2"><label className="text-sm font-medium text-gray-300">Flash Sale</label><input type="checkbox" checked={isFlashSale} onChange={(e) => setIsFlashSale(e.target.checked)} className="w-5 h-5 rounded text-pink-500 bg-gray-700 border-gray-600 focus:ring-pink-600" /></div>
                <div className="flex items-center justify-between pt-2"><label className="text-sm font-medium text-gray-300">Nổi bật (hiện ở trang chủ)</label><input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="w-5 h-5 rounded text-pink-500 bg-gray-700 border-gray-600 focus:ring-pink-600" /></div>
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
    
    // Transaction history state
    const [history, setHistory] = useState<TransactionLogEntry[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyFilter, setHistoryFilter] = useState<'all' | 'earned' | 'spent'>('all');


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
    const [newPackage, setNewPackage] = useState({ name: '', credits_amount: 0, bonus_credits: 0, price_vnd: 0, tag: '', is_featured: false });

    // Transaction management state
    const [pendingTransactions, setPendingTransactions] = useState<AdminTransaction[]>([]);
    const [isTransactionsLoading, setIsTransactionsLoading] = useState(false);
    const [processingTransactionId, setProcessingTransactionId] = useState<string | null>(null);

    // Announcement state
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);
    const [isAnnouncementLoading, setIsAnnouncementLoading] = useState(false);
    const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);

    // --- NEW ---
    // Check-in reward management state
    const [checkInRewards, setCheckInRewards] = useState<CheckInReward[]>([]);
    const [isRewardsLoading, setIsRewardsLoading] = useState(false);
    const [editingReward, setEditingReward] = useState<CheckInReward | null>(null);
    const [newReward, setNewReward] = useState({ consecutive_days: 0, diamond_reward: 0, xp_reward: 0 });
    // --- END NEW ---


    const rank = user ? getRankForLevel(user.level) : null;
    
    const fetchAdminData = useCallback(async () => {
        if (!session || !user?.is_admin) return;
        const fetchOptions = {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-cache' as RequestCache
        };

        // All existing admin fetches...
        setIsKeysLoading(true);
        try {
             const response = await fetch('/.netlify/functions/api-keys', fetchOptions);
            if (!response.ok) throw new Error('Không thể tải API keys.');
            setApiKeys(await response.json());
        } catch (error: any) { showToast(error.message, 'error'); } 
        finally { setIsKeysLoading(false); }
        
        setIsUsersLoading(true);
        try {
             const response = await fetch('/.netlify/functions/admin-users', fetchOptions);
            if (!response.ok) throw new Error('Không thể tải danh sách người dùng.');
            setAllUsers(await response.json());
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsUsersLoading(false); }
        
        setIsPackagesLoading(true);
        try {
            const res = await fetch('/.netlify/functions/credit-packages?include_inactive=true', fetchOptions);
            if (!res.ok) throw new Error('Không thể tải gói nạp.');
            setPackages(await res.json());
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsPackagesLoading(false); }

        setIsTransactionsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-transactions', fetchOptions);
            if (!res.ok) throw new Error('Không thể tải các giao dịch chờ duyệt.');
            setPendingTransactions(await res.json());
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsTransactionsLoading(false); }

        // New fetch for announcement
        setIsAnnouncementLoading(true);
        try {
            const res = await fetch('/.netlify/functions/announcements', fetchOptions); // Admin GET
            if (!res.ok) throw new Error('Không thể tải thông báo.');
            setAnnouncement(await res.json());
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsAnnouncementLoading(false); }
        
        // --- NEW ---
        // Fetch for check-in rewards
        setIsRewardsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', fetchOptions);
            if (!res.ok) throw new Error('Không thể tải cấu hình thưởng điểm danh.');
            setCheckInRewards(await res.json());
        } catch (error: any) { showToast(error.message, 'error'); }
        finally { setIsRewardsLoading(false); }
        // --- END NEW ---


    }, [session, showToast, user?.is_admin]);
    
    const fetchTransactionHistory = useCallback(async () => {
        if (!session) return;
        setIsHistoryLoading(true);
        try {
            const res = await fetch('/.netlify/functions/transaction-history', {
                headers: { Authorization: `Bearer ${session.access_token}` },
                cache: 'no-cache'
            });
            if (!res.ok) throw new Error('Không thể tải lịch sử giao dịch.');
            setHistory(await res.json());
        } catch (e: any) { showToast(e.message, 'error'); }
        finally { setIsHistoryLoading(false); }
    }, [session, showToast]);

    useEffect(() => {
        fetchTransactionHistory();
        if (user?.is_admin) {
            fetchAdminData();
        }
    }, [user?.is_admin, fetchAdminData, fetchTransactionHistory]);

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
            setNewPackage({ name: '', credits_amount: 0, bonus_credits: 0, price_vnd: 0, tag: '', is_featured: false });
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

    const handleSaveAnnouncement = async () => {
        if (!announcement) return;
        setIsSavingAnnouncement(true);
        try {
            const res = await fetch('/.netlify/functions/announcements', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(announcement),
            });
            if (!res.ok) throw new Error('Không thể lưu thông báo.');
            showToast('Đã lưu thông báo thành công!', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSavingAnnouncement(false);
        }
    };
    
    // --- NEW ---
    const handleAddReward = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newReward.consecutive_days <= 0) {
            showToast('Số ngày phải lớn hơn 0.', 'error');
            return;
        }
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(newReward),
            });
            const addedReward = await res.json();
            if (!res.ok) throw new Error(addedReward.error);
            setCheckInRewards(prev => [...prev, addedReward].sort((a,b) => a.consecutive_days - b.consecutive_days));
            setNewReward({ consecutive_days: 0, diamond_reward: 0, xp_reward: 0 });
            showToast('Thêm mốc thưởng thành công!', 'success');
        } catch (e: any) { showToast(e.message, 'error'); }
    };
    
    const handleUpdateReward = async (id: string, updates: Partial<CheckInReward>) => {
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id, ...updates }),
            });
            const updatedReward = await res.json();
            if (!res.ok) throw new Error(updatedReward.error);
            setCheckInRewards(prev => prev.map(r => r.id === id ? updatedReward : r).sort((a, b) => a.consecutive_days - b.consecutive_days));
            showToast('Cập nhật mốc thưởng thành công!', 'success');
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleDeleteReward = async (id: string) => {
        if (!window.confirm('Bạn có chắc muốn xóa mốc thưởng này?')) return;
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) throw new Error('Xóa thất bại.');
            setCheckInRewards(prev => prev.filter(r => r.id !== id));
            showToast('Xóa mốc thưởng thành công!', 'success');
        } catch (e: any) { showToast(e.message, 'error'); }
    };
    // --- END NEW ---

    const handleLogoutClick = (e: React.MouseEvent) => {
        e.preventDefault();
        logout();
    };

    const filteredHistory = history.filter(item => {
        if (historyFilter === 'earned') return item.amount > 0;
        if (historyFilter === 'spent') return item.amount < 0;
        return true;
    });

    if (!user || !rank) return null;

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in max-w-6xl">
             {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={handleUpdateUser} />}
             {editingPackage && <EditPackageModal pkg={editingPackage} onClose={() => setEditingPackage(null)} onSave={handlePackageUpdate} />}
             {editingReward && <EditCheckInRewardModal reward={editingReward} onClose={() => setEditingReward(null)} onSave={handleUpdateReward} />}

            {user.is_admin && <Dashboard />}

            <div className="text-center mb-12 mt-8">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Cài đặt Tài khoản</h1>
                <p className="text-lg text-gray-400">Quản lý thông tin cá nhân và các cài đặt khác.</p>
            </div>
            
             {/* Redesigned Profile Section */}
            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 mb-8 text-center max-w-4xl mx-auto">
                <div className="relative inline-block group w-28 h-28">
                    <img src={avatarPreview || user.photo_url} alt={user.display_name} className="w-28 h-28 rounded-full border-4 border-pink-500/50" />
                </div>
                
                {isEditingName ? (
                    <div className="flex items-center gap-2 max-w-sm mx-auto mt-4">
                        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="auth-input text-2xl font-bold py-1 w-full text-center" autoFocus />
                    </div>
                ) : (
                     <h2 className="text-3xl font-bold mt-4">{user.display_name}</h2>
                )}
                
                <p className="text-gray-400">{user.email}</p>
                <div className={`mt-2 font-semibold text-lg flex items-center justify-center gap-2 ${rank.color}`}>
                    {rank.icon} {rank.title} - Cấp {user.level}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    <label htmlFor="avatar-upload" className="flex-1 cursor-pointer px-4 py-2 text-sm font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center justify-center gap-2">
                        <i className="ph-fill ph-camera"></i> Đổi Ảnh Đại Diện
                        <input id="avatar-upload" type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleAvatarSelect} />
                    </label>
                    {isEditingName ? (
                        <div className="flex-1 flex gap-2">
                             <button onClick={() => { setIsEditingName(false); setDisplayName(user.display_name); }} className="flex-1 px-4 py-2 text-sm font-semibold bg-red-500/20 text-red-300 rounded-lg"><i className="ph-fill ph-x"></i> Hủy</button>
                            <button onClick={handleUpdateName} disabled={isUpdating} className="flex-1 px-4 py-2 text-sm font-semibold bg-green-500/20 text-green-300 rounded-lg disabled:opacity-50"><i className={`ph-fill ${isUpdating ? 'ph-spinner animate-spin' : 'ph-check'}`}></i> Lưu</button>
                        </div>
                    ) : (
                         <button onClick={() => setIsEditingName(true)} className="flex-1 px-4 py-2 text-sm font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center justify-center gap-2">
                            <i className="ph-fill ph-pencil-simple"></i> Sửa Tên Hiển Thị
                        </button>
                    )}
                </div>
                 {avatarPreview && (
                    <div className="flex gap-4 mt-4 pt-4 border-t border-white/10 max-w-sm mx-auto">
                        <button onClick={() => { setAvatarPreview(null); setAvatarFile(null); }} className="flex-1 py-2 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition">Hủy</button>
                        <button onClick={handleAvatarUpload} disabled={isUploadingAvatar} className="flex-1 py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition disabled:opacity-50">
                            {isUploadingAvatar ? 'Đang tải lên...' : 'Lưu ảnh'}
                        </button>
                    </div>
                )}
                <div className="mt-6 border-t border-white/10 pt-6">
                    <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                </div>
            </div>
            
            <RedeemGiftCode />
            
            {/* How to Earn XP Section */}
            <div className="bg-[#12121A]/80 border border-cyan-500/20 rounded-2xl shadow-lg p-6 mb-8 relative overflow-hidden max-w-4xl mx-auto">
                 <div className="glowing-border glowing-border-active" style={{'--glow-color1': '#22d3ee', '--glow-color2': '#0e7490'} as React.CSSProperties}></div>
                 <h3 className="text-2xl font-bold mb-4 text-cyan-300 flex items-center gap-3"><i className="ph-fill ph-rocket-launch"></i><span className="neon-text-flow" style={{animationDuration: '5s'}}>Bí Kíp Thăng Cấp: Cách Kiếm XP</span></h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="bg-white/5 p-4 rounded-lg text-center"><p className="font-bold text-lg text-white">Tạo Ảnh</p><p className="font-semibold text-cyan-400">+10 XP</p><p className="text-xs text-gray-400">mỗi tác phẩm</p></div>
                    <div className="bg-white/5 p-4 rounded-lg text-center"><p className="font-bold text-lg text-white">Điểm Danh</p><p className="font-semibold text-cyan-400">+50 XP</p><p className="text-xs text-gray-400">mỗi ngày</p></div>
                    <div className="bg-white/5 p-4 rounded-lg text-center"><p className="font-bold text-lg text-white">Hoạt Động</p><p className="font-semibold text-cyan-400">+1 XP</p><p className="text-xs text-gray-400">mỗi phút</p></div>
                    <div className="bg-white/5 p-4 rounded-lg text-center"><p className="font-bold text-lg text-white">Nạp Kim Cương</p><p className="font-semibold text-cyan-400">+XP</p><p className="text-xs text-gray-400">1.000đ = 1 XP</p></div>
                 </div>
            </div>
            
            {/* Transaction History Section */}
            <div className="bg-[#12121A]/80 border border-purple-500/20 rounded-2xl shadow-lg p-6 mb-8 max-w-4xl mx-auto">
                <h3 className="text-2xl font-bold mb-4 text-purple-400 flex items-center gap-2"><i className="ph-fill ph-list-dashes"></i>Lịch sử Giao dịch</h3>
                <div className="flex items-center gap-2 mb-4 p-1 bg-black/30 rounded-full w-full max-w-md">
                    <button onClick={() => setHistoryFilter('all')} className={`w-1/3 py-1.5 rounded-full font-semibold text-sm transition ${historyFilter === 'all' ? 'bg-purple-600' : 'text-gray-300'}`}>Tất cả</button>
                    <button onClick={() => setHistoryFilter('earned')} className={`w-1/3 py-1.5 rounded-full font-semibold text-sm transition ${historyFilter === 'earned' ? 'bg-green-600' : 'text-gray-300'}`}>Kim cương Nhận</button>
                    <button onClick={() => setHistoryFilter('spent')} className={`w-1/3 py-1.5 rounded-full font-semibold text-sm transition ${historyFilter === 'spent' ? 'bg-red-600' : 'text-gray-300'}`}>Kim cương Tiêu</button>
                </div>
                {isHistoryLoading ? <p>Đang tải lịch sử...</p> : (
                    <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                        {filteredHistory.length > 0 ? filteredHistory.map(log => (
                            <div key={log.id} className="grid grid-cols-12 gap-2 items-center p-3 bg-white/5 rounded-lg text-sm">
                                <div className="col-span-2">
                                    <span className={`flex items-center justify-center w-8 h-8 rounded-full ${log.amount > 0 ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                                        <i className={`ph-fill ${log.amount > 0 ? 'ph-arrow-down' : 'ph-arrow-up'}`}></i>
                                    </span>
                                </div>
                                <div className="col-span-6">
                                    <p className="font-semibold text-white">{log.description}</p>
                                    <p className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString('vi-VN')}</p>
                                </div>
                                <div className={`col-span-4 text-right font-bold text-lg ${log.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()} 💎
                                </div>
                            </div>
                        )) : <p className="text-center text-gray-500 py-8">Chưa có giao dịch nào.</p>}
                    </div>
                )}
            </div>

            {/* Admin Panel */}
            {user.is_admin && (
                 <div className="space-y-8 mt-8 pt-8 border-t-2 border-dashed border-yellow-500/20">
                    
                    <GiftCodeManager />
                    
                    <div className="bg-[#12121A]/80 border border-cyan-500/20 rounded-2xl shadow-lg p-6">
                        <h3 className="text-2xl font-bold mb-4 text-cyan-400 flex items-center gap-2"><i className="ph-fill ph-calendar-check"></i>Admin: Quản lý Thưởng Điểm Danh</h3>
                        {isRewardsLoading ? <p>Đang tải cấu hình thưởng...</p> : (
                            <div className="space-y-4">
                                <form onSubmit={handleAddReward} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-black/20 rounded-lg">
                                    <input type="number" placeholder="Mốc (ngày)" value={newReward.consecutive_days || ''} onChange={e => setNewReward({...newReward, consecutive_days: Number(e.target.value)})} className="auth-input md:col-span-3" required />
                                    <input type="number" placeholder="Thưởng KC" value={newReward.diamond_reward || ''} onChange={e => setNewReward({...newReward, diamond_reward: Number(e.target.value)})} className="auth-input md:col-span-3" required />
                                    <input type="number" placeholder="Thưởng XP" value={newReward.xp_reward || ''} onChange={e => setNewReward({...newReward, xp_reward: Number(e.target.value)})} className="auth-input md:col-span-4" required />
                                    <button type="submit" className="md:col-span-2 bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-md">Thêm</button>
                                </form>
                                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                                    {checkInRewards.map(reward => (
                                        <div key={reward.id} className="grid grid-cols-12 gap-4 items-center p-3 bg-white/5 rounded-lg text-sm">
                                            <div className="col-span-3 font-semibold">Ngày thứ {reward.consecutive_days}</div>
                                            <div className="col-span-2 font-semibold text-pink-300">💎 +{reward.diamond_reward}</div>
                                            <div className="col-span-2 font-semibold text-cyan-300">XP +{reward.xp_reward}</div>
                                            <div className="col-span-5 flex items-center justify-end gap-2">
                                                <button onClick={() => handleUpdateReward(reward.id, { is_active: !reward.is_active })} className={`px-3 py-1 text-xs font-semibold rounded-full ${reward.is_active ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>{reward.is_active ? 'Active' : 'Inactive'}</button>
                                                <button onClick={() => setEditingReward(reward)} className="text-gray-400 hover:text-white"><i className="ph-fill ph-pencil-simple"></i></button>
                                                {reward.consecutive_days > 1 && <button onClick={() => handleDeleteReward(reward.id)} className="text-gray-400 hover:text-red-500"><i className="ph-fill ph-trash"></i></button>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                     <div className="bg-[#12121A]/80 border border-orange-500/20 rounded-2xl shadow-lg p-6">
                        <h3 className="text-2xl font-bold mb-4 text-orange-400 flex items-center gap-2"><i className="ph-fill ph-megaphone"></i>Admin: Quản lý Thông báo</h3>
                        {isAnnouncementLoading ? <p>Đang tải thông báo...</p> : announcement ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-300">Kích hoạt thông báo</label>
                                    <input type="checkbox" checked={announcement.is_active} onChange={(e) => setAnnouncement({...announcement, is_active: e.target.checked})} className="w-5 h-5 rounded text-pink-500 bg-gray-700 border-gray-600 focus:ring-pink-600" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Tiêu đề</label>
                                    <input type="text" value={announcement.title} onChange={(e) => setAnnouncement({...announcement, title: e.target.value})} className="auth-input" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Nội dung</label>
                                    <textarea value={announcement.content} onChange={(e) => setAnnouncement({...announcement, content: e.target.value})} rows={5} className="auth-input resize-y" />
                                </div>
                                <button onClick={handleSaveAnnouncement} disabled={isSavingAnnouncement} className="w-full py-2 font-bold text-white bg-gradient-to-r from-orange-500 to-amber-600 rounded-lg hover:opacity-90 transition disabled:opacity-50">
                                    {isSavingAnnouncement ? 'Đang lưu...' : 'Lưu Thông Báo'}
                                </button>
                            </div>
                        ) : <p className="text-gray-500 text-center">Không tìm thấy thông báo nào.</p>}
                    </div>
                    
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
                    
                    <div className="bg-[#12121A]/80 border border-green-500/20 rounded-2xl shadow-lg p-6">
                        <h3 className="text-2xl font-bold mb-4 text-green-400 flex items-center gap-2"><i className="ph-fill ph-package"></i>Admin: Quản lý Gói Nạp</h3>
                        {isPackagesLoading ? <p>Đang tải các gói...</p> : (
                            <div className="space-y-4">
                                <form onSubmit={handleAddPackage} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-black/20 rounded-lg">
                                    <input type="text" placeholder="Tên Gói" value={newPackage.name || ''} onChange={e => setNewPackage({...newPackage, name: e.target.value})} className="auth-input md:col-span-3" />
                                    <input type="number" placeholder="KC" value={newPackage.credits_amount || ''} onChange={e => setNewPackage({...newPackage, credits_amount: Number(e.target.value)})} className="auth-input md:col-span-2" />
                                    <input type="number" placeholder="KC Thưởng" value={newPackage.bonus_credits || ''} onChange={e => setNewPackage({...newPackage, bonus_credits: Number(e.target.value)})} className="auth-input md:col-span-2" />
                                    <input type="number" placeholder="Giá (VND)" value={newPackage.price_vnd || ''} onChange={e => setNewPackage({...newPackage, price_vnd: Number(e.target.value)})} className="auth-input md:col-span-2" />
                                    <div className="flex items-center justify-center text-xs md:col-span-2 gap-2">
                                        <input type="checkbox" id="new-featured" checked={newPackage.is_featured} onChange={e => setNewPackage({...newPackage, is_featured: e.target.checked})} className="w-4 h-4 text-pink-500 bg-gray-700 border-gray-600 rounded focus:ring-pink-600"/>
                                        <label htmlFor="new-featured" className="text-gray-300 font-semibold">Nổi bật</label>
                                        <button type="submit" className="flex-grow bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-md ml-4">Thêm</button>
                                    </div>
                                </form>
                                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                                    {packages.map(pkg => (
                                        <div key={pkg.id} className="grid grid-cols-12 gap-4 items-center p-3 bg-white/5 rounded-lg text-sm">
                                            <div className="col-span-3 font-semibold truncate flex items-center gap-2">
                                                {pkg.is_featured && <i className="ph-fill ph-star text-yellow-400" title="Gói nổi bật"></i>}
                                                {pkg.name}
                                            </div>
                                            <div className="col-span-3 font-semibold">💎 {pkg.credits_amount.toLocaleString()} (+{pkg.bonus_credits.toLocaleString()})</div>
                                            <div className="col-span-2 text-green-400 font-bold">{pkg.price_vnd.toLocaleString()}đ</div>
                                            <div className="col-span-4 flex items-center justify-end gap-2">
                                                {pkg.tag && <span className="text-xs font-bold bg-yellow-500 text-black px-2 py-0.5 rounded-full">{pkg.tag}</span>}
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

            <div className="bg-[#12121A]/80 border border-red-500/20 rounded-2xl shadow-lg p-6 mt-8 max-w-4xl mx-auto">
                <h3 className="text-2xl font-bold text-red-400 mb-4">Khu vực nguy hiểm</h3>
                <div className="flex justify-between items-center">
                    <p>Đăng xuất khỏi tài khoản của bạn.</p>
                    <button onClick={handleLogoutClick} className="px-6 py-2 font-bold bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors">Đăng xuất</button>
                </div>
            </div>
        </div>
    );
};

export default Settings;