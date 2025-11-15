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
import { useTranslation } from '../hooks/useTranslation';

const BuyCreditsPage: React.FC = () => {
    const { session, navigate, showToast } = useAuth();
    const { t } = useTranslation();
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
                if (!res.ok) throw new Error(t('creator.buyCredits.error.load'));
                const data = await res.json();
                setPackages(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchPackages();
    }, [showToast, t]);

    const handleBuyClick = async (pkg: CreditPackage) => {
        if (!session) {
            showToast(t('creator.buyCredits.error.login'), 'error');
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
            if (!res.ok) throw new Error(data.error || t('creator.buyCredits.error.createLink'));
            
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
                    showToast(t('creator.buyCredits.success'), 'success');
                } else if (status === 'CANCELLED') {
                    showToast(t('creator.buyCredits.cancelled', { orderCode }), 'error');
                }
            } catch (e) {
                console.error("Failed to parse payment redirect result:", e);
                showToast(t('creator.buyCredits.error.parse'), 'error');
            }
        }
    }, [showToast, t]);

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => {}} activeTab={'tool'} onNavigate={navigate} onCheckInClick={() => setCheckInModalOpen(true)} />
            <main className="flex-grow pt-24 md:pt-28">
                <div className="container mx-auto px-4">
                    <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-12">
                         <h1 
                            className="themed-main-title text-4xl md:text-5xl font-black mb-4 leading-tight"
                            data-text={t('creator.buyCredits.title')}
                        >
                            {t('creator.buyCredits.title')}
                        </h1>
                        <p className="themed-main-subtitle text-lg md:text-xl max-w-3xl mx-auto">
                           {t('creator.buyCredits.description')}
                        </p>
                    </div>

                    <div className="max-w-4xl mx-auto mb-8">
                        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 p-4 rounded-lg flex items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <i className="ph-fill ph-chat-circle-dots text-2xl text-yellow-400 mt-1 flex-shrink-0"></i>
                                <p className="text-sm leading-relaxed">{t('creator.buyCredits.paymentSupport.note')}</p>
                            </div>
                            <a 
                                href="https://www.facebook.com/iam.cody.real/" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex-shrink-0 px-4 py-2 text-sm font-bold bg-blue-500/80 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                            >
                                <i className="ph-fill ph-facebook-logo"></i>
                                {t('creator.buyCredits.paymentSupport.button')}
                            </a>
                        </div>
                    </div>

                    <div className="max-w-4xl mx-auto mb-12">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="themed-info-box">
                                <i className="ph-fill ph-prohibit text-2xl"></i>
                                <p><strong>{t('creator.buyCredits.info.noRefund')}</strong></p>
                            </div>
                            <div className="themed-info-box">
                                <i className="ph-fill ph-calendar-x text-2xl"></i>
                                <p>{t('creator.buyCredits.info.expiry')}</p>
                            </div>
                            <div className="themed-info-box is-link" onClick={() => setInfoModalKey('terms')}>
                                <i className="ph-fill ph-book-open text-2xl"></i>
                                <a>{t('creator.buyCredits.info.policy')}</a>
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
                                            <p className="themed-credit-package__label">{t('landing.pricing.card.diamonds')}</p>
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
                                            {isProcessingPayment === pkg.id ? t('creator.buyCredits.processing') : t('creator.buyCredits.buy')}
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