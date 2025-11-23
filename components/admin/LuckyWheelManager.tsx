
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LuckyWheelReward } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

const LuckyWheelManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [rewards, setRewards] = useState<LuckyWheelReward[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [newReward, setNewReward] = useState<Partial<LuckyWheelReward>>({
        label: '', type: 'diamond', amount: 1, probability: 10, color: '#FF0000', is_active: true
    });

    useEffect(() => {
        const fetchRewards = async () => {
            try {
                const res = await fetch('/.netlify/functions/admin-lucky-wheel', {
                    headers: { Authorization: `Bearer ${session?.access_token}` }
                });
                if (res.ok) setRewards(await res.json());
            } catch (e) { console.error(e); } finally { setIsLoading(false); }
        };
        fetchRewards();
    }, [session]);

    const handleSave = async () => {
        try {
            const res = await fetch('/.netlify/functions/admin-lucky-wheel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(newReward)
            });
            if (!res.ok) throw new Error('Failed to add reward');
            setRewards([...rewards, await res.json()]);
            setNewReward({ label: '', type: 'diamond', amount: 1, probability: 10, color: '#FF0000', is_active: true });
            showToast(t('creator.settings.admin.luckyWheel.success'), 'success');
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleUpdate = async (id: string, updates: Partial<LuckyWheelReward>) => {
        try {
            const res = await fetch('/.netlify/functions/admin-lucky-wheel', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id, ...updates })
            });
            if (!res.ok) throw new Error('Failed to update reward');
            const updated = await res.json();
            setRewards(prev => prev.map(r => r.id === id ? updated : r));
            showToast('Cập nhật thành công!', 'success');
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc chắn muốn xóa?')) return;
        try {
            await fetch('/.netlify/functions/admin-lucky-wheel', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id })
            });
            setRewards(rewards.filter(r => r.id !== id));
        } catch (e) { console.error(e); }
    };

    // Calculate total probability
    const totalProb = rewards.reduce((acc, r) => acc + r.probability, 0);

    if (isLoading) return <div>Loading...</div>;

    return (
        <div className="bg-[#12121A]/80 border border-yellow-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-yellow-400">{t('creator.settings.admin.luckyWheel.title')}</h3>
            
            {/* Add Form */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-6 bg-black/20 p-4 rounded-lg items-center">
                <div className="md:col-span-3">
                    <input className="auth-input" placeholder={t('creator.settings.admin.luckyWheel.form.label')} value={newReward.label} onChange={e => setNewReward({...newReward, label: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                    <select className="auth-input" value={newReward.type} onChange={e => setNewReward({...newReward, type: e.target.value as any})}>
                        <option value="diamond">{t('creator.settings.admin.luckyWheel.form.types.diamond')}</option>
                        <option value="xp">{t('creator.settings.admin.luckyWheel.form.types.xp')}</option>
                        <option value="ticket">{t('creator.settings.admin.luckyWheel.form.types.ticket')}</option>
                        <option value="lucky">{t('creator.settings.admin.luckyWheel.form.types.lucky')}</option>
                    </select>
                </div>
                <div className="md:col-span-2">
                    <input type="number" className="auth-input" placeholder={t('creator.settings.admin.luckyWheel.form.amount')} value={newReward.amount} onChange={e => setNewReward({...newReward, amount: Number(e.target.value)})} />
                </div>
                <div className="md:col-span-2">
                    <input type="number" className="auth-input" placeholder="%" value={newReward.probability} onChange={e => setNewReward({...newReward, probability: Number(e.target.value)})} />
                </div>
                <div className="md:col-span-1">
                    <input type="color" className="w-full h-10 rounded cursor-pointer border-0 bg-transparent" value={newReward.color} onChange={e => setNewReward({...newReward, color: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                    <button onClick={handleSave} className="themed-button-primary w-full py-2 text-xs">{t('creator.settings.admin.luckyWheel.form.add')}</button>
                </div>
            </div>

            {/* List - Inline Editing */}
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-400 uppercase px-2">
                    <div className="col-span-3">Tên</div>
                    <div className="col-span-2">Loại</div>
                    <div className="col-span-2">Số lượng</div>
                    <div className="col-span-2">Tỷ lệ (%)</div>
                    <div className="col-span-1">Màu</div>
                    <div className="col-span-2 text-right">Action</div>
                </div>
                {rewards.map(r => (
                    <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-2 bg-white/5 rounded border-l-4" style={{ borderLeftColor: r.color }}>
                        <div className="col-span-3">
                            <input 
                                className="w-full bg-transparent border-b border-transparent focus:border-white text-white text-sm focus:outline-none" 
                                value={r.label} 
                                onChange={(e) => {
                                    const newLabel = e.target.value;
                                    setRewards(prev => prev.map(item => item.id === r.id ? { ...item, label: newLabel } : item));
                                }}
                                onBlur={(e) => handleUpdate(r.id, { label: e.target.value })}
                            />
                        </div>
                        <div className="col-span-2 text-xs text-gray-400 uppercase">{r.type}</div>
                        <div className="col-span-2">
                             <input 
                                type="number"
                                className="w-full bg-transparent border-b border-transparent focus:border-white text-white text-sm focus:outline-none" 
                                value={r.amount} 
                                onChange={(e) => setRewards(prev => prev.map(item => item.id === r.id ? { ...item, amount: Number(e.target.value) } : item))}
                                onBlur={(e) => handleUpdate(r.id, { amount: Number(e.target.value) })}
                            />
                        </div>
                        <div className="col-span-2">
                             <input 
                                type="number"
                                className="w-full bg-transparent border-b border-transparent focus:border-white text-white text-sm focus:outline-none font-bold text-yellow-300" 
                                value={r.probability} 
                                onChange={(e) => setRewards(prev => prev.map(item => item.id === r.id ? { ...item, probability: Number(e.target.value) } : item))}
                                onBlur={(e) => handleUpdate(r.id, { probability: Number(e.target.value) })}
                            />
                        </div>
                        <div className="col-span-1">
                            <input 
                                type="color" 
                                value={r.color} 
                                onChange={(e) => {
                                    setRewards(prev => prev.map(item => item.id === r.id ? { ...item, color: e.target.value } : item));
                                    // Debounce or save on blur/change could be better, but color picker triggers change fast.
                                    // We'll update on blur if possible, or specific save button.
                                }}
                                onBlur={(e) => handleUpdate(r.id, { color: e.target.value })}
                                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                            />
                        </div>
                        <div className="col-span-2 text-right">
                            <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-300 text-xs bg-red-500/10 px-2 py-1 rounded">Xóa</button>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className={`mt-4 text-right text-sm font-bold ${totalProb !== 100 ? 'text-red-400' : 'text-green-400'}`}>
                Tổng tỷ lệ: {totalProb}% {totalProb !== 100 && '(Cảnh báo: Nên bằng 100%)'}
            </div>
        </div>
    );
};

export default LuckyWheelManager;
