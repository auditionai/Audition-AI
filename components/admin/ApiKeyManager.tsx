import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiKey } from '../../types';

const ApiKeyManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [newName, setNewName] = useState('');
    const [newValue, setNewValue] = useState('');

    const fetchData = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/api-keys', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!res.ok) throw new Error('Could not fetch API keys.');
            setKeys(await res.json());
        } catch (e: any) { showToast(e.message, 'error'); } 
        finally { setIsLoading(false); }
    }, [session, showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);
    
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/.netlify/functions/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ name: newName, key_value: newValue }),
            });
            if (!res.ok) throw new Error(await res.text());
            showToast('Tạo key thành công!', 'success');
            setNewName(''); setNewValue('');
            fetchData();
        } catch (e: any) { showToast(e.message, 'error'); }
    };
    
    const handleToggle = async (key: ApiKey) => {
        try {
            const res = await fetch('/.netlify/functions/api-keys', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id: key.id, status: key.status === 'active' ? 'inactive' : 'active' }),
            });
            if (!res.ok) throw new Error('Cập nhật thất bại.');
            showToast('Cập nhật thành công!', 'success');
            fetchData();
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    if (isLoading) return <p className="text-center p-8">Đang tải...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-cyan-400">Quản lý API Keys</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tên gợi nhớ" className="auth-input md:col-span-1"/>
                <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Giá trị API Key" className="auth-input md:col-span-1"/>
                <button type="submit" className="themed-button-primary py-2 md:col-span-1">Thêm Key Mới</button>
            </form>
            <div className="space-y-2">
                {keys.map(k => (
                    <div key={k.id} className="grid grid-cols-4 gap-4 items-center p-2 bg-white/5 rounded">
                        <div className="font-semibold">{k.name}</div>
                        <div className="text-gray-400 text-xs truncate font-mono">...{k.key_value.slice(-8)}</div>
                        <div className="text-gray-300">Lượt dùng: {k.usage_count}</div>
                        <button onClick={() => handleToggle(k)} className={`px-3 py-1 text-xs font-semibold rounded-full w-20 ${k.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
                            {k.status === 'active' ? 'Active' : 'Inactive'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ApiKeyManager;
