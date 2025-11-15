import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminManagedUser } from '../../types';
import Modal from '../common/Modal';
import { calculateLevelFromXp } from '../../utils/rankUtils';
import { useTranslation } from '../../hooks/useTranslation';

const UserManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [users, setUsers] = useState<AdminManagedUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<AdminManagedUser | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [updatedValues, setUpdatedValues] = useState<Partial<AdminManagedUser>>({});
    const [isSaving, setIsSaving] = useState(false);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-users', {
                headers: { Authorization: `Bearer ${session?.access_token}` },
            });
            if (!res.ok) throw new Error(t('creator.settings.admin.users.error'));
            setUsers(await res.json());
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast, t]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleEditClick = (user: AdminManagedUser) => {
        setEditingUser(user);
        setUpdatedValues({
            diamonds: user.diamonds,
            xp: user.xp,
            is_admin: user.is_admin,
        });
        setIsModalOpen(true);
    };
    
    const handleSave = async () => {
        if (!editingUser) return;
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/admin-users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ userId: editingUser.id, updates: updatedValues }),
            });
            const updatedUser = await res.json();
            if (!res.ok) throw new Error(updatedUser.error || t('creator.settings.admin.users.saveError'));

            setUsers(users.map(u => u.id === editingUser.id ? updatedUser : u));
            showToast(t('creator.settings.admin.users.saveSuccess'), 'success');
            setIsModalOpen(false);
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <p className="text-center text-gray-400 p-8">{t('creator.settings.admin.users.loading')}</p>;

    return (
        <div className="bg-[#12121A]/80 border border-purple-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-purple-400">{t('creator.settings.admin.users.title')}</h3>
            <div className="max-h-96 overflow-y-auto custom-scrollbar pr-2">
                <div className="grid grid-cols-12 gap-4 text-xs font-bold text-gray-400 uppercase p-2 border-b border-white/10">
                    <div className="col-span-3">{t('creator.settings.admin.users.header.user')}</div>
                    <div className="col-span-2">{t('creator.settings.admin.users.header.diamonds')}</div>
                    <div className="col-span-2">{t('creator.settings.admin.users.header.xp_level')}</div>
                    <div className="col-span-2">{t('creator.settings.admin.users.header.created_at')}</div>
                    <div className="col-span-1">{t('creator.settings.admin.users.header.admin')}</div>
                    <div className="col-span-2 text-right">{t('creator.settings.admin.users.header.actions')}</div>
                </div>
                {users.map(user => (
                    <div key={user.id} className="grid grid-cols-12 gap-4 items-center p-2 border-b border-white/5 text-sm">
                        <div className="col-span-3 flex items-center gap-2">
                            <img src={user.photo_url} alt="" className="w-8 h-8 rounded-full" />
                            <span className="truncate font-semibold text-white">{user.display_name}</span>
                        </div>
                        <div className="col-span-2 text-pink-300 font-semibold">{user.diamonds.toLocaleString()}</div>
                        <div className="col-span-2 text-cyan-300">{user.xp.toLocaleString()} / {calculateLevelFromXp(user.xp)}</div>
                        <div className="col-span-2 text-gray-400">{new Date(user.created_at).toLocaleDateString('vi-VN')}</div>
                        <div className="col-span-1">{user.is_admin ? '✅' : '❌'}</div>
                        <div className="col-span-2 text-right">
                            <button onClick={() => handleEditClick(user)} className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-md">{t('common.edit')}</button>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && editingUser && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('creator.settings.admin.users.editTitle', { name: editingUser.display_name })}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">{t('creator.settings.admin.users.diamonds')}</label>
                            <input
                                type="number"
                                value={updatedValues.diamonds ?? ''}
                                onChange={e => setUpdatedValues({ ...updatedValues, diamonds: Number(e.target.value) })}
                                className="auth-input mt-1"
                            />
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-300">{t('creator.settings.admin.users.xp')}</label>
                            <input
                                type="number"
                                value={updatedValues.xp ?? ''}
                                onChange={e => setUpdatedValues({ ...updatedValues, xp: Number(e.target.value) })}
                                className="auth-input mt-1"
                            />
                        </div>
                        <div className="flex items-center">
                             <input
                                id="is_admin" type="checkbox"
                                checked={updatedValues.is_admin ?? false}
                                onChange={e => setUpdatedValues({ ...updatedValues, is_admin: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-pink-500 focus:ring-pink-500"
                            />
                            <label htmlFor="is_admin" className="ml-2 block text-sm text-gray-300">{t('creator.settings.admin.users.isAdmin')}</label>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setIsModalOpen(false)} className="themed-button-secondary">{t('common.cancel')}</button>
                            <button onClick={handleSave} disabled={isSaving} className="themed-button-primary">{isSaving ? t('common.saving') : t('common.save')}</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
export default UserManager;