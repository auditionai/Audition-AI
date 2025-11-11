import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CheckInReward } from '../../types';

const RewardManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const [rewards, setRewards] = useState<CheckInReward[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Form state
    const [days, setDays] = useState<number | ''>('');
    const [diamonds, setDiamonds] = useState<number | ''>('');
    const [xp, setXp] = useState<number | ''>('');

    const fetchData = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!res.ok) throw new Error('Could not fetch rewards.');
            setRewards(await res.json());
        } catch (e: any) { showToast(e.message, 'error'); } 
        finally { setIsLoading(false); }
    }, [session, showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ consecutive_days: Number(days), diamond_reward: Number(diamonds), xp_reward: Number(xp) }),
            });
            if (!res.ok) throw new Error(await res.text());
            showToast('Tạo mốc thưởng thành công!', 'success');
            setDays(''); setDiamonds(''); setXp('');
            fetchData();
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Bạn có chắc muốn xóa mốc thưởng này?')) return;
        try {
            const res = await fetch('/.netlify/functions/admin-check-in-rewards', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) throw new Error('Xóa thất bại.');
            showToast('Xóa thành công!', 'success');
            fetchData();
        } catch (e: any) { showToast(e.message, 'error'); }
    };
    
    if (isLoading) return <p className="text-center p-8">Đang tải...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-cyan-400">Quản lý Thưởng Điểm Danh</h3>
             <form onSubmit={handleCreate} className="grid grid-cols-4 gap-4 mb-6">
                <input type="number" value={days} onChange={e => setDays(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Số ngày liên tiếp" className="auth-input"/>
                <input type="number" value={diamonds} onChange={e => setDiamonds(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Thưởng KC" className="auth-input"/>
                <input type="number" value={xp} onChange={e => setXp(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Thưởng XP" className="auth-input"/>
                <button type="submit" className="themed-button-primary py-2">Thêm Mốc</button>
            </form>
            <div className="space-y-2">
                {rewards.map(r => (
                    <div key={r.id} className="grid grid-cols-5 gap-4 items-center p-2 bg-white/5 rounded">
                        <div>Ngày {r.consecutive_days}</div>
                        <div>{r.diamond_reward} 💎</div>
                        <div>{r.xp_reward} XP</div>
                        <div>{r.is_active ? '✅' : '❌'}</div>
                        <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:underline">Xóa</button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RewardManager;
