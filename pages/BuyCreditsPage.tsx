import React, { useState, useEffect } from 'react';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import { useAuth } from '../contexts/AuthContext';
import { CreditPackage } from '../types';
import InfoModal from '../components/creator/InfoModal';
import CheckInModal from '../components/CheckInModal';
import BottomNavBar from '../components/common/BottomNavBar';
import { useTheme } from '../contexts/ThemeContext';
import ThemeEffects from '../components/themes/ThemeEffects';

const BuyCreditsPage: React.FC = () => {
    const { session, navigate, showToast } = useAuth();
    const { theme } = useTheme();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);

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
            
            window.location.href = data.checkoutUrl;

        } catch (error: any) {
            showToast(error.message, 'error');
            setIsProcessingPayment(null);
        }
    };
    
    useEffect(() => {
        const paymentResultJSON = sessionStorage.getItem('payment_redirect_result');
        
        if (paymentResultJSON) {
            sessionStorage.removeItem('payment_redirect_result');
            try {
                const { status, orderCode } = JSON.parse(paymentResultJSON);
                if (status === 'PAID') {
                    showToast(`Thanh toán thành công! Giao dịch của bạn đang chờ quản trị viên phê duyệt.`, 'success');
                } else if (status === 'CANCELLED') {
                    showToast(`Bạn đã hủy thanh toán cho đơn hàng #${orderCode}.`, 'error');
                }
            } catch (e) {
                console.error("Failed to parse payment redirect result:", e);
            }
        }
    }, [showToast]);

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => {}} activeTab={'tool'} onNavigate={navigate} onCheckInClick={() => setCheckInModalOpen(true)} />
            <main className="flex-grow pt-24 md:pt-28">
                <div className="container mx-auto px-4">
                    <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-12">
                         <h1 
                            className="themed-main-title text-4xl md:text-5xl font-black mb-4 leading-tight"
                            data-text="Nạp Kim Cương"
                        >
                            Nạp Kim Cương
                        </h1>
                        <p className="themed-main-subtitle text-lg md:text-xl max-w-3xl mx-auto">
                           Đừng quên điểm danh hàng ngày để nhận <span className="font-bold text-pink-400">Kim Cương miễn phí</span> và các phần thưởng hấp dẫn khác!
                        </p>
                    </div>

                    <div className="max-w-4xl mx-auto mb-12">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="themed-info-box">
                                <i className="ph-fill ph-prohibit text-2xl"></i>
                                <p><strong>Không</strong> hoàn tiền &amp; chuyển nhượng.</p>
                            </div>
                            <div className="themed-info-box">
                                <i className="ph-fill ph-calendar-x text-2xl"></i>
                                <p>Hạn sử dụng: <strong>2 năm</strong></p>
                            </div>
                            <div className="themed-info-box is-link" onClick={() => setInfoModalKey('terms')}>
                                <i className="ph-fill ph-book-open text-2xl"></i>
                                <a>Xem Chính Sách</a>
                            </div>
                        </div>
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
                                <div key={pkg.id} className="themed-credit-package interactive-3d group">
                                    {pkg.tag && (
                                        <div className="themed-credit-package__tag">{pkg.tag}</div>
                                    )}
                                    <div className="themed-credit-package__content">
                                        <div className="flex-grow">
                                            <div className="themed-credit-package__amount">
                                                <i className="ph-fill ph-diamonds-four"></i>
                                                <p>{totalCredits.toLocaleString('vi-VN')}</p>
                                            </div>
                                            <p className="themed-credit-package__label">Kim cương</p>
                                            {pkg.bonus_credits > 0 && (
                                                <p className="themed-credit-package__bonus">
                                                    Tổng: {pkg.credits_amount.toLocaleString('vi-VN')} + {pkg.bonus_credits.toLocaleString('vi-VN')} Thưởng
                                                </p>
                                            )}
                                        </div>
                                        <p className="themed-credit-package__price">{pkg.price_vnd.toLocaleString('vi-VN')} đ</p>
                                        <button
                                            onClick={() => handleBuyClick(pkg)}
                                            disabled={isProcessingPayment === pkg.id}
                                            className="themed-credit-package__button"
                                        >
                                            {isProcessingPayment === pkg.id ? 'Đang xử lý...' : 'Mua'}
                                        </button>
                                    </div>
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