import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const RedeemGiftCode: React.FC = () => {
    const { session, showToast, updateUserProfile } = useAuth();
    const [code, setCode] = useState('');
    const [isRedeeming, setIsRedeeming] = useState(false);

    const handleRedeem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) {
            showToast('Vui lòng nhập giftcode.', 'error');
            return;
        }
        setIsRedeeming(true);
        try {
            const response = await fetch('/.netlify/functions/redeem-gift-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ code: code.trim() }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            // result from RPC function is { success, message, new_diamond_count }
            showToast(result.message, 'success');
            if (result.new_diamond_count !== undefined) {
                updateUserProfile({ diamonds: result.new_diamond_count });
            }
            setCode(''); // Clear input on success

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsRedeeming(false);
        }
    };

    return (
        <div className="bg-[#12121A]/80 border border-yellow-500/20 rounded-2xl shadow-lg p-6 mb-8 max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold mb-4 text-yellow-400 flex items-center gap-2">
                <i className="ph-fill ph-gift"></i>Nhập Giftcode
            </h3>
            <form onSubmit={handleRedeem} className="flex flex-col sm:flex-row gap-4">
                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Nhập mã code của bạn ở đây"
                    className="auth-input flex-grow"
                    disabled={isRedeeming}
                />
                <button
                    type="submit"
                    disabled={isRedeeming}
                    className="px-6 py-3 font-bold text-white bg-gradient-to-r from-yellow-500 to-amber-600 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                    {isRedeeming ? 'Đang kiểm tra...' : 'Xác nhận'}
                </button>
            </form>
        </div>
    );
};

export default RedeemGiftCode;