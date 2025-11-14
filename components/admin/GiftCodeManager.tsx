import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { GiftCode } from '../../types';

const GiftCodeManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const [giftCodes, setGiftCodes] = useState<GiftCode[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [newCode, setNewCode] = useState('');
    const [newReward, setNewReward] = useState<number | ''>('');
    const [newLimit, setNewLimit] = useState<number | ''>(1);
    const [isCreating, setIsCreating] = useState(false);

    const fetchGiftCodes = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const response = await fetch('/.netlify/functions/admin-gift-codes', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error('Không thể tải danh sách giftcode.');
            const data = await response.json();
            setGiftCodes(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchGiftCodes();
    }, [fetchGiftCodes]);

    const handleCreateCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCode.trim() || !newReward || !newLimit) {
            showToast('Vui lòng điền đầy đủ thông tin.', 'error');
            return;
        }
        setIsCreating(true);
        try {
            const response = await fetch('/.netlify/functions/admin-gift-codes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    code: newCode.trim().toUpperCase(),
                    diamond_reward: Number(newReward),
                    usage_limit: Number(newLimit),
                }),
            });
            const createdCode = await response.json();
            if (!response.ok) throw new Error(createdCode.error || 'Tạo code thất bại.');

            showToast('Tạo giftcode thành công!', 'success');
            setGiftCodes([createdCode, ...giftCodes]);
            // Reset form
            setNewCode('');
            setNewReward('');
            setNewLimit(1);

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsCreating(false);
        }
    };
    
    const handleToggleActive = async (code: GiftCode) => {
        try {
            const response = await fetch('/.netlify/functions/admin-gift-codes', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ id: code.id, is_active: !code.is_active }),
            });
            const updatedCode = await response.json();
            if (!response.ok) throw new Error(updatedCode.error || 'Cập nhật thất bại.');

            setGiftCodes(giftCodes.map(c => c.id === code.id ? updatedCode : c));
            showToast('Cập nhật trạng thái code thành công!', 'success');

        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };


    return (
        <div className="bg-[#12121A]/80 border border-yellow-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-yellow-400 flex items-center gap-2">
                <i className="ph-fill ph-gift"></i>Admin: Quản lý Giftcode
            </h3>

            <form onSubmit={handleCreateCode} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-black/20 rounded-lg mb-6">
                <input
                    type="text"
                    placeholder="Mã Code (VD: HELLOAU)"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value.toUpperCase())}
                    className="auth-input md:col-span-5"
                    required
                />
                <input
                    type="number"
                    placeholder="Số KC thưởng"
                    value={newReward}
                    onChange={e => setNewReward(e.target.value === '' ? '' : Number(e.target.value))}
                    className="auth-input md:col-span-3"
                    required
                />
                <input
                    type="number"
                    placeholder="Lượt dùng"
                    value={newLimit}
                    onChange={e => setNewLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="auth-input md:col-span-2"
                    required
                />
                <button
                    type="submit"
                    disabled={isCreating}
                    className="md:col-span-2 bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-md disabled:opacity-50"
                >
                    {isCreating ? 'Đang tạo...' : 'Tạo Code'}
                </button>
            </form>

            {isLoading ? <p>Đang tải danh sách giftcode...</p> : (
                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                    {giftCodes.length > 0 ? giftCodes.map(code => (
                        <div key={code.id} className="grid grid-cols-12 gap-2 items-center p-3 bg-white/5 rounded-lg text-sm">
                            <div className="col-span-3 font-mono font-bold text-white">{code.code}</div>
                            <div className="col-span-3 font-semibold text-pink-300">💎 +{code.diamond_reward.toLocaleString()}</div>
                            <div className="col-span-3 text-gray-300">Đã dùng: {code.usage_count}/{code.usage_limit}</div>
                            <div className="col-span-3 flex items-center justify-end gap-2">
                                <button
                                    onClick={() => handleToggleActive(code)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full ${code.is_active ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}
                                >
                                    {code.is_active ? 'Active' : 'Inactive'}
                                </button>
                                <span className="text-xs text-gray-500">{new Date(code.created_at).toLocaleDateString('vi-VN')}</span>
                            </div>
                        </div>
                    )) : <p className="text-center text-gray-500 py-8">Chưa có giftcode nào được tạo.</p>}
                </div>
            )}
        </div>
    );
};

export default GiftCodeManager;