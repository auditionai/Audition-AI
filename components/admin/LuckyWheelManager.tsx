
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
        const totalProb = rewards.reduce((acc, r) => acc + r.probability, 0) + (newReward.probability || 0);
        // Optional: Check if > 100, but server should handle logic or auto-normalize
        
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

    const handleDelete = async (id: string) => {
        try {
            await fetch('/.netlify/functions/admin-lucky-wheel', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id })
            });
            setRewards(rewards.filter(r => r.id !== id));
        } catch (e) { console.error(e); }
    };

    if (isLoading) return <div>Loading...</div>;

    return (
        <div className="bg-[#12121A]/80 border border-yellow-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-yellow-400">{t('creator.settings.admin.luckyWheel.title')}</h3>
            
            {/* Add Form */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-6 bg-black/20 p-4 rounded">
                <input className="auth-input" placeholder={t('creator.settings.admin.luckyWheel.form.label')} value={newReward.label} onChange={e => setNewReward({...newReward, label: e.target.value})} />
                <select className="auth-input" value={newReward.type} onChange={e => setNewReward({...newReward, type: e.target.value as any})}>
                    <option value="diamond">{t('creator.settings.admin.luckyWheel.form.types.diamond')}</option>
                    <option value="xp">{t('creator.settings.admin.luckyWheel.form.types.xp')}</option>
                    <option value="ticket">{t('creator.settings.admin.luckyWheel.form.types.ticket')}</option>
                    <option value="lucky">{t('creator.settings.admin.luckyWheel.form.types.lucky')}</option>
                </select>
                <input type="number" className="auth-input" placeholder={t('creator.settings.admin.luckyWheel.form.amount')} value={newReward.amount} onChange={e => setNewReward({...newReward, amount: Number(e.target.value)})} />
                <input type="number" className="auth-input" placeholder={t('creator.settings.admin.luckyWheel.form.probability')} value={newReward.probability} onChange={e => setNewReward({...newReward, probability: Number(e.target.value)})} />
                <input type="color" className="w-full h-10 rounded cursor-pointer" value={newReward.color} onChange={e => setNewReward({...newReward, color: e.target.value})} />
                <button onClick={handleSave} className="themed-button-primary text-xs">{t('creator.settings.admin.luckyWheel.form.add')}</button>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {rewards.map(r => (
                    <div key={r.id} className="flex justify-between items-center p-2 bg-white/5 rounded border-l-4" style={{ borderLeftColor: r.color }}>
                        <div>
                            <span className="font-bold text-white mr-2">{r.label}</span>
                            <span className="text-xs text-gray-400">({r.amount} {r.type}) - {r.probability}%</span>
                        </div>
                        <button onClick={() => handleDelete(r.id)} className="text-red-400 text-xs">Delete</button>
                    </div>
                ))}
            </div>
            
            <div className="mt-4 text-right text-xs text-gray-400">
                Total Probability: {rewards.reduce((acc, r) => acc + r.probability, 0)}%
            </div>
        </div>
    );
};

export default LuckyWheelManager;
