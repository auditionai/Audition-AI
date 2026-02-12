
import React, { useState, useEffect, useRef } from 'react';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import { useAuth } from '../contexts/AuthContext';
import { CreditPackage, Promotion } from '../types';
import InfoModal from '../components/creator/InfoModal';
import CheckInModal from '../components/CheckInModal';
import BottomNavBar from '../components/common/BottomNavBar';
import { useTheme } from '../contexts/ThemeContext';
import ThemeEffects from '../components/themes/ThemeEffects';
import { useTranslation } from '../hooks/useTranslation';

// --- Countdown Component ---
// ... (PromoCountdown code remains same) ...
const PromoCountdown: React.FC<{ endTime: string; title: string }> = ({ endTime, title }) => {
    const [timeLeft, setTimeLeft] = useState<{ d: number, h: number, m: number, s: number } | null>(null);

    useEffect(() => {
        const calculateTimeLeft = () => {
            const difference = +new Date(endTime) - +new Date();
            
            if (difference > 0) {
                return {
                    d: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    h: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    m: Math.floor((difference / 1000 / 60) % 60),
                    s: Math.floor((difference / 1000) % 60)
                };
            }
            return null;
        };

        setTimeLeft(calculateTimeLeft());
        const timer = setInterval(() => {
            const tl = calculateTimeLeft();
            if (!tl) clearInterval(timer);
            setTimeLeft(tl);
        }, 1000);

        return () => clearInterval(timer);
    }, [endTime]);

    if (!timeLeft) return null;

    const TimeBox = ({ value, label }: { value: number, label: string }) => (
        <div className="flex flex-col items-center">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-black/40 border border-red-500/50 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-inner">
                <span className="text-lg font-black text-yellow-400 font-mono">
                    {value < 10 ? `0${value}` : value}
                </span>
            </div>
            <span className="text-[9px] text-red-300 mt-1 font-bold uppercase">{label}</span>
        </div>
    );

    return (
        <div className="max-w-xl mx-auto mb-6 animate-fade-in-up">
            <div className="bg-gradient-to-r from-red-900/80 via-orange-900/80 to-red-900/80 border border-yellow-500/30 p-3 rounded-xl relative overflow-hidden shadow-lg flex items-center justify-between px-6">
                <div className="flex items-center gap-2">
                    <i className="ph-fill ph-alarm text-yellow-400 text-xl animate-bounce"></i>
                    <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">{title}</h3>
                        <p className="text-[10px] text-yellow-200">Kết thúc sau:</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <TimeBox value={timeLeft.d} label="Ngày" />
                    <span className="text-xl font-bold text-white pb-3">:</span>
                    <TimeBox value={timeLeft.h} label="Giờ" />
                    <span className="text-xl font-bold text-white pb-3">:</span>
                    <TimeBox value={timeLeft.m} label="Phút" />
                </div>
            </div>
        </div>
    );
};

// ... (PricingCard component remains exactly the same) ...
const PricingCard: React.FC<{ pkg: CreditPackage; onBuy: () => void; isProcessing: boolean }> = ({ pkg, onBuy, isProcessing }) => {
    const { t, language } = useTranslation();
    const baseTotal = pkg.credits_amount + pkg.bonus_credits;
    const promoBonus = pkg.promo_bonus_credits || 0;
    const totalCredits = baseTotal + promoBonus;
    const hasPromo = promoBonus > 0;
    
    let tierClass = 'from-blue-500/20 to-purple-500/20 border-blue-500/30';
    let accentColor = 'text-blue-400';
    let glowColor = 'shadow-blue-500/20';
    let buttonStyle = "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-blue-500/40";

    if (pkg.price_vnd >= 50000) {
        tierClass = 'from-purple-500/20 to-pink-500/20 border-purple-500/30';
        accentColor = 'text-purple-400';
        glowColor = 'shadow-purple-500/20';
        buttonStyle = "bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-pink-500/40";
    }
    if (pkg.price_vnd >= 100000) {
        tierClass = 'from-yellow-500/20 to-orange-500/20 border-yellow-500/30';
        accentColor = 'text-yellow-400';
        glowColor = 'shadow-yellow-500/20';
        buttonStyle = "bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-black shadow-yellow-500/40";
    }
    if (pkg.price_vnd >= 500000) {
        tierClass = 'from-red-500/20 to-rose-600/20 border-red-500/30';
        accentColor = 'text-red-400';
        glowColor = 'shadow-red-500/40';
        buttonStyle = "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-red-500/40";
    }
    
    if (hasPromo) {
        tierClass = 'from-red-600/30 to-orange-500/30 border-red-500/50';
        glowColor = 'shadow-red-500/40';
    }

    const getTranslatedTag = (tag: string | null | undefined) => {
        if (!tag) return null;
        const key = `creator.buyCredits.tags.${tag}`;
        const translated = t(key);
        return translated !== key ? translated : t(tag);
    };

    return (
        <div className={`group relative rounded-2xl p-1 transition-all duration-500 hover:-translate-y-2 interactive-3d h-full flex flex-col ${hasPromo ? 'scale-105 z-10' : ''}`}>
            {hasPromo && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 bg-gradient-to-r from-red-600 to-yellow-500 text-white font-black text-[10px] px-3 py-0.5 rounded-full shadow-lg border border-yellow-300 animate-pulse whitespace-nowrap flex items-center gap-1">
                    <i className="ph-fill ph-fire"></i> +{pkg.promo_percent}% BONUS
                </div>
            )}
            <div className={`absolute inset-0 bg-gradient-to-br ${tierClass} rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
            
            <div className={`relative h-full bg-skin-fill-secondary/80 backdrop-blur-xl border ${tierClass.split(' ')[2]} rounded-xl p-4 flex flex-col items-center text-center overflow-hidden shadow-lg ${glowColor}`}>
                {pkg.tag && !hasPromo && (
                    <div className="absolute top-0 right-0">
                        <div className="bg-gradient-to-bl from-pink-500 to-purple-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-lg shadow-md uppercase tracking-wider">
                            {getTranslatedTag(pkg.tag)}
                        </div>
                    </div>
                )}

                <div className="mb-2 relative mt-2">
                    <div className={`absolute inset-0 bg-current opacity-20 blur-xl rounded-full transform scale-150 ${accentColor}`}></div>
                    <i className={`ph-fill ph-diamonds-four text-4xl ${accentColor} drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] transform transition-transform duration-700 group-hover:rotate-[360deg]`}></i>
                </div>

                <h3 className="text-sm font-bold text-white mb-1">{pkg.name}</h3>
                
                <div className="flex flex-col items-center mb-1">
                    {hasPromo ? (
                        <>
                            <span className="text-xs text-gray-500 line-through decoration-red-500">{baseTotal.toLocaleString()}</span>
                            <span className={`text-2xl font-black text-yellow-400 drop-shadow-md`}>{totalCredits.toLocaleString()}</span>
                        </>
                    ) : (
                        <span className={`text-2xl font-black ${accentColor}`}>{totalCredits.toLocaleString()}</span>
                    )}
                    <span className="text-[10px] text-skin-muted font-bold uppercase">{t('creator.buyCredits.card.diamonds')}</span>
                </div>

                <div className="mt-auto w-full pt-3 border-t border-white/5">
                    <button
                        type="button"
                        onClick={onBuy}
                        disabled={isProcessing}
                        className={`w-full py-2.5 rounded-lg font-bold text-xs transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 shadow-lg
                            ${isProcessing 
                                ? 'bg-gray-600 cursor-not-allowed text-gray-400' 
                                : `${buttonStyle} hover:brightness-110 hover:shadow-xl`
                            }
                        `}
                    >
                        {isProcessing ? <i className="ph ph-spinner animate-spin"></i> : pkg.price_vnd.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') + ' ₫'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Update Props to accept optional embedded flag
interface BuyCreditsPageProps {
    isEmbedded?: boolean;
}

const BuyCreditsPage: React.FC<BuyCreditsPageProps> = ({ isEmbedded = false }) => {
    const { session, navigate, showToast } = useAuth();
    const { t } = useTranslation();
    const { theme } = useTheme();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [activePromo, setActivePromo] = useState<Promotion | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const promoRes = await fetch(`/.netlify/functions/get-active-promotion?t=${Date.now()}`);
                if (promoRes.ok) {
                    const promoData = await promoRes.json();
                    if (promoData && promoData.id) setActivePromo(promoData);
                }

                const pkgRes = await fetch(`/.netlify/functions/credit-packages?t=${Date.now()}`);
                if (!pkgRes.ok) throw new Error(t('creator.buyCredits.error.load'));
                const pkgData = await pkgRes.json();
                setPackages(pkgData);

            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
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
    
    // Payment callback handler
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
                showToast(t('creator.buyCredits.error.parse'), 'error');
            }
        }
    }, [showToast, t]);

    // MAIN CONTENT RENDERER
    const Content = () => (
        <div className="container mx-auto px-4 relative z-10">
            <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-4 animate-fade-in-down">
                    <h1 
                    className="themed-main-title text-3xl md:text-4xl font-black mb-2 leading-tight"
                    data-text={t('creator.buyCredits.title')}
                >
                    {t('creator.buyCredits.title')}
                </h1>
                <p className="themed-main-subtitle text-sm md:text-base max-w-2xl mx-auto text-gray-400">
                    {t('creator.buyCredits.description')}
                </p>
            </div>

            {activePromo && (
                <PromoCountdown endTime={activePromo.end_time} title={activePromo.title} />
            )}

            {/* Support Banner - Compact */}
            <div className="max-w-3xl mx-auto mb-6 animate-fade-in-up">
                <div className="bg-blue-900/20 border border-blue-500/20 text-blue-200 p-3 rounded-lg flex items-center justify-between gap-4 shadow-sm backdrop-blur-sm">
                    <p className="text-xs">{t('creator.buyCredits.paymentSupport.note')}</p>
                    <a 
                        href="https://www.facebook.com/iam.cody.real/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex-shrink-0 px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap"
                    >
                        <i className="ph-fill ph-messenger-logo"></i> Hỗ trợ
                    </a>
                </div>
            </div>

            {isLoading ? (
                    <div className="flex justify-center items-center py-20">
                    <div className="w-10 h-10 border-4 border-t-skin-accent border-skin-border rounded-full animate-spin"></div>
                    </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 max-w-5xl mx-auto pb-12 animate-fade-in-up">
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
    );

    // If embedded, just return content without layout shell
    if (isEmbedded) {
        return <Content />;
    }

    // Default Full Page Layout
    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
            <ThemeEffects />
            <CreatorHeader onTopUpClick={() => {}} activeTab={'tool'} onNavigate={navigate} onCheckInClick={() => setCheckInModalOpen(true)} />
            <main className="flex-grow pt-32 md:pt-36 relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-skin-accent/10 blur-[100px] rounded-full pointer-events-none -z-10"></div>
                <Content />
            </main>
            <CreatorFooter onInfoLinkClick={setInfoModalKey} />
            <BottomNavBar activeTab="buy-credits" onTabChange={navigate} onCheckInClick={() => setCheckInModalOpen(true)} />
            <InfoModal isOpen={!!infoModalKey} onClose={() => setInfoModalKey(null)} contentKey={infoModalKey} />
            <CheckInModal isOpen={isCheckInModalOpen} onClose={() => setCheckInModalOpen(false)} />
        </div>
    );
};

export default BuyCreditsPage;
