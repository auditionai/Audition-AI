import React, { useState, useEffect } from 'react';
import CreatorHeader from '../components/CreatorHeader';
import CreatorFooter from '../components/CreatorFooter';
import { useAuth } from '../contexts/AuthContext';
import { CreditPackage } from '../types';
import InfoModal from '../components/InfoModal';

const BuyCreditsPage: React.FC = () => {
    const { session, navigate, showToast } = useAuth();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null); // Store package ID being processed
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                const res = await fetch('/.netlify/functions/credit-packages');
                if (!res.ok) throw new Error('Không thể tải các gói nạp.');
                const data = await res.json();
                setPackages(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchPackages();
    }, [showToast]);

    const handleBuyClick = async (pkg: CreditPackage) => {
        if (!session) {
            showToast('Vui lòng đăng nhập để nạp kim cương.', 'error');
            return;
        }
        setIsProcessingPayment(pkg.id);
        try {
            const res = await fetch('/.netlify/functions/create-payment-link', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ packageId: pkg.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể tạo liên kết thanh toán.');
            
            // Redirect to PayOS checkout
            window.location.href = data.checkoutUrl;

        } catch (error: any) {
            showToast(error.message, 'error');
            setIsProcessingPayment(null);
        }
    };
    
    // Check for payment status from URL redirect
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
        const orderCode = urlParams.get('orderCode');

        if (status && orderCode) {
            if (status === 'PAID') {
                showToast(`Thanh toán thành công cho đơn hàng #${orderCode}! Kim cương sẽ được cộng trong giây lát.`, 'success');
            } else if (status === 'CANCELLED') {
                showToast(`Bạn đã hủy thanh toán cho đơn hàng #${orderCode}.`, 'error');
            }
             // Clean the URL
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, [showToast]);

    return (
        <div className="flex flex-col min-h-screen bg-[#0B0B0F]">
            <CreatorHeader onTopUpClick={() => {}} activeTab={'tool'} setActiveTab={(tab) => navigate(tab)} />
            <main className="flex-grow pt-24 pb-12 relative">
                <div className="absolute inset-0 z-0 aurora-background opacity-70"></div>
                <div className="container mx-auto px-4 relative z-10">
                    <div className="max-w-4xl mx-auto text-center">
                        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Mua Credits</h1>
                        <p className="text-sm text-gray-400 max-w-2xl mx-auto">
                            Lưu ý: Credits không thể quy đổi thành tư cách thành viên, cũng không được hoàn tiền, chuyển nhượng hay rút. Thời hạn sử dụng 2 năm kể từ khi quy đổi. 
                            <a onClick={() => setInfoModalKey('terms')} className="text-cyan-400 underline cursor-pointer ml-1">Chính sách Credits</a>
                        </p>
                        <p className="text-sm text-gray-400 mt-2">Mỗi ngày, credits miễn phí sẽ tự động được reset về 70 credits.</p>
                    </div>

                    {isLoading ? (
                         <div className="flex justify-center items-center py-20">
                            <div className="w-12 h-12 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin"></div>
                         </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-12 max-w-6xl mx-auto">
                            {packages.map(pkg => {
                                const totalCredits = pkg.credits_amount + pkg.bonus_credits;
                                return (
                                <div key={pkg.id} className="relative bg-[#12121A]/80 border border-pink-500/20 rounded-2xl shadow-lg p-6 flex flex-col text-center interactive-3d group">
                                    <div className="glowing-border"></div>
                                    {pkg.is_flash_sale && (
                                        <div 
                                            className="absolute top-4 right-4 bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white text-xs font-bold px-3 py-1 rounded-full"
                                            style={{ animation: 'subtle-pulse 2s infinite' }}
                                        >
                                            Flash Sale
                                        </div>
                                    )}
                                    <div className="flex-grow">
                                        <div className="flex items-center justify-center gap-2 mb-2">
                                            <i className="ph-fill ph-diamonds-four text-3xl text-pink-400"></i>
                                            <p className="text-4xl font-extrabold text-white">{totalCredits.toLocaleString('vi-VN')}</p>
                                        </div>
                                        <p className="text-gray-400 text-sm mb-4">cPIX</p>
                                        {pkg.bonus_credits > 0 && (
                                            <p className="text-xs text-gray-500 mb-4">
                                                Tổng: {pkg.credits_amount.toLocaleString('vi-VN')} + {pkg.bonus_credits.toLocaleString('vi-VN')} Thưởng
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-2xl font-bold text-white mb-6">{pkg.price_vnd.toLocaleString('vi-VN')} đ</p>
                                    <button
                                        onClick={() => handleBuyClick(pkg)}
                                        disabled={isProcessingPayment === pkg.id}
                                        className="w-full py-3 font-bold rounded-lg transition-all duration-300 bg-gradient-to-r from-[#F72585] to-[#CA27FF] text-white hover:shadow-lg hover:shadow-pink-500/30 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        {isProcessingPayment === pkg.id ? 'Đang xử lý...' : 'Mua'}
                                    </button>
                                </div>
                            )})}
                        </div>
                    )}
                </div>
            </main>
            <CreatorFooter onInfoLinkClick={setInfoModalKey} />
            <InfoModal isOpen={!!infoModalKey} onClose={() => setInfoModalKey(null)} contentKey={infoModalKey} />
        </div>
    );
};

export default BuyCreditsPage;