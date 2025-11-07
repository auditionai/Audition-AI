import React, { useState, useEffect, useRef } from 'react';
import CreatorHeader from '../components/CreatorHeader';
import CreatorFooter from '../components/CreatorFooter';
import { useAuth } from '../contexts/AuthContext';
import { CreditPackage } from '../types';
import InfoModal from '../components/InfoModal';
import CheckInModal from '../components/CheckInModal';
import BottomNavBar from '../components/common/BottomNavBar';

const BuyCreditsPage: React.FC = () => {
    const { session, navigate, showToast } = useAuth();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null); // Store package ID being processed
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);
    const redirectProcessed = useRef(false);

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
        if (redirectProcessed.current) {
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
        const orderCode = urlParams.get('orderCode');

        if (status && orderCode) {
            redirectProcessed.current = true;

            // CRITICAL FIX: Defer the URL state change until after the current execution stack is clear.
            // This avoids interfering with React's/Supabase's initial hydration process, which was the
            // root cause of the session corruption leading to the freeze on reload.
            setTimeout(() => {
                window.history.replaceState(null, '', window.location.pathname);
            }, 0);
            
            if (status === 'PAID') {
                showToast(`Thanh toán thành công! Giao dịch của bạn đang chờ quản trị viên phê duyệt.`, 'success');
            } else if (status === 'CANCELLED') {
                showToast(`Bạn đã hủy thanh toán cho đơn hàng #${orderCode}.`, 'error');
            }
        }
    }, [showToast]);

    return (
        <div className="flex flex-col min-h-screen bg-[#0B0B0F] pb-16 md:pb-0">
            <CreatorHeader onTopUpClick={() => {}} activeTab={'tool'} onNavigate={navigate} onCheckInClick={() => setCheckInModalOpen(true)} />
            <main className="flex-grow pt-24 relative">
                <div className="absolute inset-0 z-0 aurora-background opacity-70"></div>
                <div className="container mx-auto px-4 relative z-10">
                    <div className="max-w-4xl mx-auto text-center">
                        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Nạp Kim Cương</h1>
                        
                        <div className="max-w-3xl mx-auto mt-6 bg-black/30 border border-white/10 rounded-2xl p-4 text-sm shadow-lg">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-y-3 md:gap-x-4">
                                <div className="flex items-center justify-center gap-2.5 p-2 rounded-lg bg-white/5">
                                    <i className="ph-fill ph-prohibit text-2xl text-red-400 neon-text-glow" style={{ color: '#f87171' }}></i>
                                    <p className="text-gray-300">
                                        <span className="font-bold text-white">Không</span> hoàn tiền &amp; chuyển nhượng.
                                    </p>
                                </div>
                                
                                <div className="flex items-center justify-center gap-2.5 p-2 rounded-lg bg-white/5">
                                    <i className="ph-fill ph-calendar-x text-2xl text-yellow-400 neon-text-glow" style={{ color: '#facc15' }}></i>
                                    <p className="text-gray-300">
                                        Hạn sử dụng: <span className="font-bold text-white">2 năm</span>
                                    </p>
                                </div>
                                
                                <div className="flex items-center justify-center gap-2.5 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                                    <i className="ph-fill ph-book-open text-2xl text-cyan-400 neon-text-glow" style={{ color: '#22d3ee' }}></i>
                                    <a onClick={() => setInfoModalKey('terms')} className="text-cyan-400 font-semibold hover:text-cyan-300 cursor-pointer">
                                        Xem Chính Sách
                                    </a>
                                </div>
                            </div>
                        </div>

                        <p className="text-sm text-gray-400 mt-4">Đừng quên điểm danh hàng ngày để nhận <span className="font-bold text-pink-400">Kim Cương miễn phí</span> và các phần thưởng hấp dẫn khác!</p>
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
                                        <p className="text-gray-400 text-sm mb-4">Kim cương</p>
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
            <BottomNavBar
                activeTab="buy-credits"
                onTabChange={navigate}
                onTopUpClick={() => {}}
                onCheckInClick={() => setCheckInModalOpen(true)}
            />
            <InfoModal isOpen={!!infoModalKey} onClose={() => setInfoModalKey(null)} contentKey={infoModalKey} />
            <CheckInModal 
                isOpen={isCheckInModalOpen}
                onClose={() => setCheckInModalOpen(false)}
            />
        </div>
    );
};

export default BuyCreditsPage;