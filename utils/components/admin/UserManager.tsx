import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminManagedUser } from '../../types';
import Modal from '../common/Modal';

const EditUserModal: React.FC<{ user: AdminManagedUser | null; onClose: () => void; onSave: (userId: string, updates: any) => Promise<void> }> = ({ user, onClose, onSave }) => {
    const [diamonds, setDiamonds] = useState(user?.diamonds || 0);
    const [xp, setXp] = useState(user?.xp || 0);
    const [isAdmin, setIsAdmin] = useState(user?.is_admin || false);
    const [isSaving, setIsSaving] = useState(false);

    if (!user) return null;

    const handleSave = async () => {
        setIsSaving(true);
        const updates = {
            diamonds: Number(diamonds),
            xp: Number(xp),
            is_admin: isAdmin,
        };
        await onSave(user.id, updates);
        setIsSaving(false);
        onClose();
    };

    return (
        <Modal isOpen={!!user} onClose={onClose} title={`Chỉnh sửa: ${user.display_name}`}>
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <img src={user.photo_url} alt={user.display_name} className="w-16 h-16 rounded-full" />
                    <div>
                        <p className="font-bold text-lg">{user.display_name}</p>
                        <p className="text-sm text-gray-400">{user.email}</p>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Kim cương</label>
                    <input type="number" value={diamonds} onChange={e => setDiamonds(Number(e.target.value))} className="auth-input w-full mt-1" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">XP</label>
                    <input type="number" value={xp} onChange={e => setXp(Number(e.target.value))} className="auth-input w-full mt-1" />
                </div>
                <div className="flex items-center justify-between">
                    <label className="font-medium text-gray-300">Quyền Admin</label>
                    <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} className="h-5 w-5 rounded text-pink-500 focus:ring-pink-500" />
                </div>
                <div className="flex gap-4 pt-4">
                    <button onClick={onClose} className="flex-1 py-2 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20">Hủy</button>
                    <button onClick={handleSave} disabled={isSaving} className="flex-1 py-2 font-bold text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50">
                        {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

const UserManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const [users, setUsers] = useState<AdminManagedUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<AdminManagedUser | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchUsers = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-users', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!res.ok) throw new Error('Không thể tải danh sách người dùng.');
            setUsers(await res.json());
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSaveUser = async (userId: string, updates: any) => {
        try {
            const res = await fetch('/.netlify/functions/admin-users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ userId, updates }),
            });
            const updatedUser = await res.json();
            if (!res.ok) throw new Error(updatedUser.error || 'Cập nhật thất bại.');
            
            setUsers(users.map(u => u.id === userId ? updatedUser : u));
            showToast('Cập nhật người dùng thành công!', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const filteredUsers = users.filter(u => 
        u.display_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) return <p className="text-center p-8">Đang tải danh sách người dùng...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
            <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={handleSaveUser} />
            <h3 className="text-2xl font-bold mb-4 text-cyan-400">Quản lý Người Dùng</h3>
            <input 
                type="text" 
                placeholder="Tìm kiếm theo tên hoặc email..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="auth-input w-full mb-4"
            />
            <div className="overflow-x-auto max-h-[60vh] custom-scrollbar">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-400 uppercase bg-white/5 sticky top-0">
                        <tr>
                            <th scope="col" className="px-6 py-3">Người dùng</th>
                            <th scope="col" className="px-6 py-3">Kim cương / XP</th>
                            <th scope="col" className="px-6 py-3">Ngày tạo</th>
                            <th scope="col" className="px-6 py-3">Trạng thái</th>
                            <th scope="col" className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user.id} className="border-b border-white/10 hover:bg-white/5">
                                <td className="px-6 py-4 flex items-center gap-3">
                                    <img src={user.photo_url} alt="" className="w-10 h-10 rounded-full" />
                                    <div>
                                        <div className="font-semibold text-white">{user.display_name}</div>
                                        <div className="text-gray-400">{user.email}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-semibold text-pink-400">{user.diamonds} 💎</div>
                                    <div className="text-cyan-400">{user.xp} XP</div>
                                </td>
                                <td className="px-6 py-4 text-gray-300">{new Date(user.created_at).toLocaleDateString('vi-VN')}</td>
                                <td className="px-6 py-4">
                                    {user.is_admin && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-300">Admin</span>}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => setEditingUser(user)} className="font-medium text-pink-400 hover:underline">Sửa</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UserManager;
