import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CheckInReward } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

const CheckInRewardManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [rewards, setRewards] = useState<CheckInReward[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [days, setDays] = useState<number|''>('');
    const [diamonds, setDiamonds] = useState<number|''>('');
    const [xp, setXp] = useState<number|''>('');
    const [isSaving, setIsSaving] = useState(false);

    const fetchRewards = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', { headers: { Authorization: `Bearer ${session?.access_token}` } });
            if (!res.ok) throw new Error(t('creator.settings.admin.rewards.error.load'));
            setRewards(await res.json());
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast, t]);

    useEffect(() => {
        fetchRewards();
    }, [fetchRewards]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!days || !diamonds || !xp) return;
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ consecutive_days: Number(days), diamond_reward: Number(diamonds), xp_reward: Number(xp) }),
            });
            const newReward = await res.json();
            if (!res.ok) throw new Error(newReward.error);
            setRewards([...rewards, newReward].sort((a,b) => a.consecutive_days - b.consecutive_days));
            setDays(''); setDiamonds(''); setXp('');
            showToast(t('creator.settings.admin.rewards.success.create'), 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async (id: string) => {
        if (!window.confirm(t('creator.settings.admin.rewards.confirmDelete'))) return;
        try {
             await fetch('/.netlify/functions/admin-check-in-rewards', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            setRewards(rewards.filter(r => r.id !== id));
            showToast(t('creator.settings.admin.rewards.success.delete'), 'success');
        } catch(e: any) {
            showToast(e.message, 'error');
        }
    }

    if (isLoading) return <p className="text-center text-gray-400 p-8">{t('creator.settings.admin.rewards.loading')}</p>;

    return (
        <div className="bg-[#12121A]/80 border border-cyan-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-cyan-400">{t('creator.settings.admin.rewards.title')}</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-12 gap-2 p-4 bg-black/20 rounded-lg mb-6">
                 <input type="number" placeholder={t('creator.settings.admin.rewards.form.days')} value={days} onChange={e => setDays(Number(e.target.value))} className="auth-input col-span-4" required />
                 <input type="number" placeholder={t('creator.settings.admin.rewards.form.diamonds')} value={diamonds} onChange={e => setDiamonds(Number(e.target.value))} className="auth-input col-span-3" required />
                 <input type="number" placeholder={t('creator.settings.admin.rewards.form.xp')} value={xp} onChange={e => setXp(Number(e.target.value))} className="auth-input col-span-3" required />
                 <button type="submit" disabled={isSaving} className="col-span-2 bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-md disabled:opacity-50">{t('creator.settings.admin.rewards.form.add')}</button>
            </form>
            <div className="space-y-2">
                {rewards.map(r => (
                    <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-2 bg-white/5 rounded-lg text-sm">
                        <div className="col-span-3 font-bold text-white">{t('modals.checkIn.milestone')} {r.consecutive_days} {t('modals.checkIn.days')}</div>
                        <div className="col-span-3 text-pink-300">💎 +{r.diamond_reward}</div>
                        <div className="col-span-3 text-cyan-300">✨ +{r.xp_reward}</div>
                        <div className="col-span-3 text-right">
                             <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-300 text-xs">{t('common.delete')}</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CheckInRewardManager;