import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiKey } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

const ApiKeyManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [newName, setNewName] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const fetchApiKeys = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/api-keys', { headers: { Authorization: `Bearer ${session?.access_token}` } });
            if (!res.ok) throw new Error(t('creator.settings.admin.apiKeys.error.load'));
            setApiKeys(await res.json());
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast, t]);

    useEffect(() => { fetchApiKeys(); }, [fetchApiKeys]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newKeyValue) return;
        setIsCreating(true);
        try {
            const res = await fetch('/.netlify/functions/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ name: newName, key_value: newKeyValue }),
            });
            const newKey = await res.json();
            if (!res.ok) throw new Error(newKey.error);
            setApiKeys([newKey, ...apiKeys]);
            setNewName(''); setNewKeyValue('');
            showToast(t('creator.settings.admin.apiKeys.success'), 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsCreating(false);
        }
    };
    
    const handleToggle = async (key: ApiKey) => {
        const newStatus = key.status === 'active' ? 'inactive' : 'active';
        try {
             const res = await fetch('/.netlify/functions/api-keys', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id: key.id, status: newStatus }),
            });
            const updatedKey = await res.json();
            if (!res.ok) throw new Error(updatedKey.error);
            setApiKeys(apiKeys.map(k => k.id === key.id ? updatedKey : k));
        } catch(e: any) {
            showToast(e.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(t('creator.settings.admin.apiKeys.confirmDelete'))) return;
        try {
             await fetch('/.netlify/functions/api-keys', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            setApiKeys(apiKeys.filter(k => k.id !== id));
        } catch(e: any) {
            showToast(e.message, 'error');
        }
    };

    if (isLoading) return <p className="text-center text-gray-400 p-8">{t('creator.settings.admin.apiKeys.loading')}</p>;
    
    return (
        <div className="bg-[#12121A]/80 border border-red-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-red-400">{t('creator.settings.admin.apiKeys.title')}</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-12 gap-2 p-4 bg-black/20 rounded-lg mb-6">
                 <input type="text" placeholder={t('creator.settings.admin.apiKeys.form.name')} value={newName} onChange={e => setNewName(e.target.value)} className="auth-input col-span-4" required />
                 <input type="password" placeholder={t('creator.settings.admin.apiKeys.form.key')} value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} className="auth-input col-span-6" required />
                 <button type="submit" disabled={isCreating} className="col-span-2 bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-md disabled:opacity-50">{t('creator.settings.admin.apiKeys.form.add')}</button>
            </form>
             <div className="grid grid-cols-12 gap-2 items-center p-2 text-xs font-bold text-gray-400 uppercase border-b border-white/10 mb-2">
                <div className="col-span-3">{t('creator.settings.admin.apiKeys.table.name')}</div>
                <div className="col-span-4">{t('creator.settings.admin.apiKeys.table.key')}</div>
                <div className="col-span-2">{t('creator.settings.admin.apiKeys.table.cost')}</div>
                <div className="col-span-3 text-right">{t('creator.settings.admin.apiKeys.table.actions')}</div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                {apiKeys.map(k => (
                    <div key={k.id} className="grid grid-cols-12 gap-2 items-center p-2 bg-white/5 rounded-lg text-sm">
                        <div className="col-span-3 font-semibold text-white">{k.name}</div>
                        <div className="col-span-4 font-mono text-gray-400">...{k.key_value.slice(-6)}</div>
                        <div className="col-span-2 text-yellow-300 font-semibold">{(k.usage_count * 1000).toLocaleString('vi-VN')}đ</div>
                        <div className="col-span-3 flex justify-end gap-2">
                             <button onClick={() => handleToggle(k)} className={`px-2 py-1 text-xs rounded-full ${k.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>{k.status}</button>
                             <button onClick={() => handleDelete(k.id)} className="text-red-400 hover:text-red-300 text-xs">{t('common.delete')}</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ApiKeyManager;