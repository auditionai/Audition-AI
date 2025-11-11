import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CreditPackage } from '../types';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import BottomNavBar from '../components/common/BottomNavBar';
import InfoModal from '../components/creator/InfoModal';
import CheckInModal from '../components/CheckInModal';

const BuyCreditsPage: React.FC = () => {
    const { session, user, navigate, showToast } = useAuth();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    // Modal states
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);

    useEffect(() => {
        const fetchPackages = async () => {
            setIsLoading(true);
            try {
                // Fetch all active packages, not just featured
                const response = await fetch('/.netlify/functions/credit-packages');
                if (!response.ok) throw new Error('Không thể tải các gói nạp.');
                setPackages(await response.json());
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchPackages();
    }, [showToast]);

    const handleSelectPackage = async (packageId: string) => {
        if (!session) {
            showToast('Vui lòng đăng nhập để tiếp tục.', 'error');
            return;
        }
        setIsProcessing(packageId);
        try {
            const response = await fetch('/.netlify/functions/create-payment-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ packageId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Tạo liên kết thanh toán thất bại.');
            
            // Redirect to PayOS checkout URL
            window.location.href = result.checkoutUrl;

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    if (!user) {
        navigate('home');
        return null;
    }

    return (
        <div className="flex flex-col min-h-screen bg-transparent text-skin-base pb-16 md:pb-0">
            <CreatorHeader
                onTopUpClick={() => navigate('buy-credits')}
                activeTab="tool"
                onNavigate={navigate}
                onCheckInClick={() => setCheckInModalOpen(true)}
            />
            
            <main className="flex-grow pt-24 md:pt-28">
                <div className="container mx-auto px-4 py-8 animate-fade-in">
                    <div className="max-w-4xl mx-auto">
                        <div className="text-center mb-12">
                            <h1 className="text-4xl md:text-5xl font-bold mb-4">
                                <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Nạp Kim Cương</span>
                            </h1>
                            <p className="text-lg text-skin-muted">
                                Chọn gói phù hợp để tiếp tục hành trình sáng tạo của bạn. Gói càng lớn, ưu đãi càng nhiều.
                            </p>
                        </div>

                        {isLoading ? (
                            <div className="text-center p-12">
                                <div className="w-12 h-12 border-4 border-pink-500/20 border-t-pink-500 rounded-full animate-spin mx-auto"></div>
                                <p className="mt-4 text-skin-muted">Đang tải các gói nạp...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {packages.map((plan) => (
                                    <div key={plan.id} className={`relative bg-skin-fill-secondary border border-skin-border rounded-2xl p-6 text-center flex flex-col transition-all duration-300 hover:-translate-y-2 ${plan.is_featured ? 'border-2 border-skin-border-accent shadow-accent-lg' : ''}`}>
                                        {plan.is_featured && <div className="absolute -top-3 right-4 px-3 py-1 bg-skin-accent text-skin-accent-text font-bold text-xs rounded-full shadow-lg">Phổ biến</div>}
                                        {plan.tag && <div className={`font-bold text-sm mb-2 ${plan.is_flash_sale ? 'text-red-400' : 'text-yellow-400'}`}>{plan.tag}</div>}
                                        <h3 className="text-xl font-bold mb-2 text-skin-base">{plan.name}</h3>
                                        <p className="text-4xl font-bold my-4 text-skin-accent">{plan.price_vnd.toLocaleString('vi-VN')}đ</p>
                                        <div className="space-y-2 w-full text-left bg-skin-fill p-3 rounded-lg text-sm mb-6 flex-grow">
                                            <p className="flex justify-between items-center"><span className="flex items-center gap-2 text-skin-muted">Gói chính:</span> <span className="font-bold">{plan.credits_amount.toLocaleString()} 💎</span></p>
                                            <p className="flex justify-between items-center"><span className="flex items-center gap-2 text-yellow-400">Thưởng:</span> <span className="font-bold text-yellow-400">+{plan.bonus_credits.toLocaleString()} 💎</span></p>
                                            <hr className="border-skin-border"/>
                                            <p className="flex justify-between items-center text-lg font-bold text-cyan-400"><span className="flex items-center gap-2">Tổng nhận:</span> <span className="neon-text-glow">{(plan.credits_amount + plan.bonus_credits).toLocaleString()} 💎</span></p>
                                        </div>
                                        <button 
                                            onClick={() => handleSelectPackage(plan.id)}
                                            disabled={isProcessing === plan.id}
                                            className="w-full mt-auto py-3 font-bold themed-button-primary disabled:opacity-50"
                                        >
                                            {isProcessing === plan.id ? 'Đang xử lý...' : 'Chọn Mua'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <CreatorFooter onInfoLinkClick={setInfoModalKey} />
            
            <BottomNavBar
                activeTab={'buy-credits'}
                onTabChange={navigate}
                onTopUpClick={() => navigate('buy-credits')}
                onCheckInClick={() => setCheckInModalOpen(true)}
            />
            
            {/* Modals */}
            <InfoModal
                isOpen={!!infoModalKey}
                onClose={() => setInfoModalKey(null)}
                contentKey={infoModalKey}
            />
            <CheckInModal
                isOpen={isCheckInModalOpen}
                onClose={() => setCheckInModalOpen(false)}
            />
        </div>
    );
};

export default BuyCreditsPage;
