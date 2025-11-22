
import React, { useState, useEffect, useRef } from 'react';
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

// --- Enhanced 3D Pricing Card Component ---
const PricingCard: React.FC<{ pkg: CreditPackage; onBuy: () => void; isProcessing: boolean }> = ({ pkg, onBuy, isProcessing }) => {
    const { t, language } = useTranslation();
    const totalCredits = pkg.credits_amount + pkg.bonus_credits;
    
    // Determine visual tier based on price for gradient styling
    let tierClass = 'from-blue-500/20 to-purple-500/20 border-blue-500/30';
    let accentColor = 'text-blue-400';
    let glowColor = 'shadow-blue-500/20';
    
    if (pkg.price_vnd >= 50000) {
        tierClass = 'from-purple-500/20 to-pink-500/20 border-purple-500/30';
        accentColor = 'text-purple-400';
        glowColor = 'shadow-purple-500/20';
    }
    if (pkg.price_vnd >= 100000) {
        tierClass = 'from-yellow-500/20 to-orange-500/20 border-yellow-500/30';
        accentColor = 'text-yellow-400';
        glowColor = 'shadow-yellow-500/20';
    }
    if (pkg.price_vnd >= 500000) {
        tierClass = 'from-red-500/20 to-rose-600/20 border-red-500/30';
        accentColor = 'text-red-400';
        glowColor = 'shadow-red-500/40';
    }

    // Helper to translate tags safely
    const getTranslatedTag = (tag: string | null | undefined) => {
        if (!tag) return null;
        // Try to translate using known tags key
        const key = `creator.buyCredits.tags.${tag}`;
        const translated = t(key);
        // If key exists in translation map (i.e. not returned as key string), use it
        return translated !== key ? translated : t(tag);
    };

    // Correctly remove opacity modifier from all gradient colors for the button
    const buttonGradientClass = tierClass.replace(/\/20/g, '');

    return (
        <div 
            className={`group relative rounded-2xl p-1 transition-all duration-500 hover:-translate-y-2 interactive-3d h-full flex flex-col`}
        >
            {/* Glow Effect */}
            <div className={`absolute inset-0 bg-gradient-to-br ${tierClass} rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
            
            <div className={`relative h-full bg-skin-fill-secondary/80 backdrop-blur-xl border ${tierClass.split(' ')[2]} rounded-xl p-6 flex flex-col items-center text-center overflow-hidden shadow-lg ${glowColor}`}>
                
                {/* Shine Effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                {/* Best Seller / Tag */}
                {pkg.tag && (
                    <div className="absolute top-0 right-0">
                        <div className="bg-gradient-to-bl from-pink-500 to-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl shadow-md uppercase tracking-wider">
                            {getTranslatedTag(pkg.tag)}
                        </div>
                    </div>
                )}

                {/* Icon */}
                <div className="mb-4 relative">
                    <div className={`absolute inset-0 bg-current opacity-20 blur-xl rounded-full transform scale-150 ${accentColor}`}></div>
                    <i className={`ph-fill ph-diamonds-four text-5xl ${accentColor} drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] transform transition-transform duration-700 group-hover:rotate-[360deg]`}></i>
                </div>

                {/* Content - Fixed Name Format */}
                <h3 className="text-lg font-bold text-white mb-1">AU AI {pkg.credits_amount}</h3>
                
                <div className="flex items-baseline gap-1 mb-1">
                    <span className={`text-3xl font-black ${accentColor}`}>{totalCredits.toLocaleString()}</span>
                    <span className="text-xs text-skin-muted font-bold">{t('creator.buyCredits.card.diamonds')}</span>
                </div>

                {pkg.bonus_credits > 0 && (
                    <div className="bg-white/5 px-2 py-0.5 rounded text-[10px] font-bold text-green-400 mb-4 border border-white/5">
                        +{pkg.bonus_credits.toLocaleString()} {t('creator.buyCredits.card.bonus')}
                    </div>
                )}

                <div className="mt-auto w-full pt-4 border-t border-white/5">
                    <button
                        onClick={onBuy}
                        disabled={isProcessing}
                        className={`w-full py-3 rounded-lg font-bold text-sm transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2
                            ${isProcessing 
                                ? 'bg-gray-600 cursor-not-allowed text-gray-400' 
                                : `bg-gradient-to-r ${buttonGradientClass} text-white hover:brightness-110 shadow-lg`
                            }
                        `}
                    >
                        {isProcessing ? (
                            <>
                                <i className="ph ph-spinner animate-spin"></i>
                                {t('creator.buyCredits.processing')}
                            </>
                        ) : (
                            <>
                                {pkg.price_vnd.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} ₫
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

const BuyCreditsPage: React.FC = () => {
    const { session, navigate, showToast } = useAuth();
    const { t } = useTranslation();
    const { theme } = useTheme();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);

    // Tilt Effect
    const containerRef = useRef<HTMLDivElement>(null);

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

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const { left, top, width, height } = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - left) / width - 0.5;
        const y = (e.clientY - top) / height - 0.5;
        
        containerRef.current.style.setProperty('--mouse-x', `${x}`);
        containerRef.current.style.setProperty('--mouse-y', `${y}`);
    };

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => {}} activeTab={'tool'} onNavigate={navigate} onCheckInClick={() => setCheckInModalOpen(true)} />
            <main className="flex-grow pt-24 md:pt-28 relative overflow-hidden" onMouseMove={handleMouseMove} ref={containerRef}>
                
                {/* Background Decor */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-skin-accent/10 blur-[100px] rounded-full pointer-events-none -z-10"></div>

                <div className="container mx-auto px-4 relative z-10">
                    <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-12 animate-fade-in-down">
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

                    {/* Support Banner */}
                    <div className="max-w-4xl mx-auto mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                        <div className="bg-blue-500/10 border border-blue-500/30 text-blue-200 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg backdrop-blur-sm">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                    <i className="ph-fill ph-chat-circle-dots text-xl text-blue-400"></i>
                                </div>
                                <p className="text-sm leading-relaxed">{t('creator.buyCredits.paymentSupport.note')}</p>
                            </div>
                            <a 
                                href="https://www.facebook.com/iam.cody.real/" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex-shrink-0 px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-2 shadow-md"
                            >
                                <i className="ph-fill ph-facebook-logo text-lg"></i>
                                {t('creator.buyCredits.paymentSupport.button')}
                            </a>
                        </div>
                    </div>

                    {/* Info Pills */}
                    <div className="max-w-4xl mx-auto mb-12 flex flex-wrap justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-skin-muted">
                            <i className="ph-fill ph-prohibit text-red-400"></i>
                            {t('creator.buyCredits.info.noRefund')}
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-skin-muted">
                            <i className="ph-fill ph-calendar-check text-green-400"></i>
                            {t('creator.buyCredits.info.expiry')}
                        </div>
                        <button 
                            onClick={() => setInfoModalKey('terms')}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-skin-muted hover:text-white hover:bg-white/10 transition cursor-pointer"
                        >
                            <i className="ph-fill ph-book-open text-blue-400"></i>
                            {t('creator.buyCredits.info.policy')}
                        </button>
                    </div>

                    {/* Loading State */}
                    {isLoading ? (
                         <div className="flex justify-center items-center py-20">
                            <div className="w-12 h-12 border-4 border-t-skin-accent border-skin-border rounded-full animate-spin"></div>
                         </div>
                    ) : (
                        
                        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8 max-w-6xl mx-auto pb-12 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                            {/* Pricing Grid */}
                            {packages.map((pkg) => (
                                <PricingCard 
                                    key={pkg.id} 
                                    pkg={pkg} 
                                    onBuy={() => handleBuyClick(pkg)}
                                    isProcessing={isProcessingPayment === pkg.id}
                                />
                            ))}
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
