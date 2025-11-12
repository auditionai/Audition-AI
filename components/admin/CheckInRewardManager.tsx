import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CheckInReward } from '../../types';

const CheckInRewardManager: React.FC = () => {
    const { session, showToast } = useAuth();
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
            if (!res.ok) throw new Error('Không thể tải phần thưởng điểm danh.');
            setRewards(await res.json());
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

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
            showToast('Tạo mốc thưởng thành công!', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async (id: string) => {
        if (!window.confirm('Bạn chắc chắn muốn xóa mốc thưởng này?')) return;
        try {
             await fetch('/.netlify/functions/admin-check-in-rewards', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            setRewards(rewards.filter(r => r.id !== id));
            showToast('Xóa mốc thưởng thành công.', 'success');
        } catch(e: any) {
            showToast(e.message, 'error');
        }
    }

    if (isLoading) return <p className="text-center text-gray-400 p-8">Đang tải...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-cyan-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-cyan-400">Quản Lý Thưởng Điểm Danh</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-12 gap-2 p-4 bg-black/20 rounded-lg mb-6">
                 <input type="number" placeholder="Số ngày liên tục" value={days} onChange={e => setDays(Number(e.target.value))} className="auth-input col-span-4" required />
                 <input type="number" placeholder="KC thưởng" value={diamonds} onChange={e => setDiamonds(Number(e.target.value))} className="auth-input col-span-3" required />
                 <input type="number" placeholder="XP thưởng" value={xp} onChange={e => setXp(Number(e.target.value))} className="auth-input col-span-3" required />
                 <button type="submit" disabled={isSaving} className="col-span-2 bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-md disabled:opacity-50">Thêm</button>
            </form>
            <div className="space-y-2">
                {rewards.map(r => (
                    <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-2 bg-white/5 rounded-lg text-sm">
                        <div className="col-span-3 font-bold text-white">Mốc {r.consecutive_days} ngày</div>
                        <div className="col-span-3 text-pink-300">💎 +{r.diamond_reward}</div>
                        <div className="col-span-3 text-cyan-300">✨ +{r.xp_reward}</div>
                        <div className="col-span-3 text-right">
                             <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-300 text-xs">Xóa</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CheckInRewardManager;
