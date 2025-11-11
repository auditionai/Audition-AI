import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CreditPackage } from '../types';
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import InfoModal from '../components/creator/InfoModal';
import { DiamondIcon } from '../components/common/DiamondIcon';
import LoadingModal from '../components/LoadingModal';

const BuyCreditsPage: React.FC = () => {
    const { user, navigate, showToast, session } = useAuth();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreatingLink, setIsCreatingLink] = useState(false);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);

    useEffect(() => {
        const fetchPackages = async () => {
            setIsLoading(true);
            try {
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

    const handlePurchase = async (packageId: string) => {
        if (!session) {
            showToast('Vui lòng đăng nhập để thực hiện thanh toán.', 'error');
            return;
        }
        setIsCreatingLink(true);
        try {
            const response = await fetch('/.netlify/functions/create-payment-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ packageId }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Tạo liên kết thanh toán thất bại.');
            
            // Redirect to PayOS checkout page
            window.location.href = data.checkoutUrl;

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsCreatingLink(false);
        }
    };

    if (!user) {
        navigate('home');
        return null;
    }

    return (
        <>
            <LoadingModal isOpen={isCreatingLink} onClose={() => setIsCreatingLink(false)} />
            <div className="flex flex-col min-h-screen bg-skin-fill text-skin-base">
                <CreatorHeader
                    onTopUpClick={() => {}}
                    activeTab="tool" // or some other default
                    onNavigate={navigate}
                    onCheckInClick={() => {}} // dummy for now
                />

                <main className="flex-grow pt-24 md:pt-28 container mx-auto px-4 pb-12">
                    <div className="max-w-4xl mx-auto text-center animate-fade-in-down">
                        <h1 className="text-4xl md:text-5xl font-bold mb-4">
                            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Nạp Kim Cương</span>
                        </h1>
                        <p className="text-lg text-gray-400">
                            Chọn một gói để tiếp thêm năng lượng cho sự sáng tạo của bạn. Càng mua nhiều, ưu đãi càng lớn!
                        </p>
                    </div>

                    {isLoading ? (
                        <div className="text-center py-12">Đang tải các gói nạp...</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12 animate-fade-in-up">
                            {packages.map(pkg => (
                                <div key={pkg.id} className={`themed-panel p-8 flex flex-col items-center text-center rounded-2xl relative overflow-hidden ${pkg.is_featured ? 'border-2 border-pink-500 shadow-accent-lg' : ''}`}>
                                    {pkg.is_featured && <div className="absolute top-0 right-0 px-4 py-1 bg-pink-500 text-white font-bold text-sm rounded-bl-lg">Nổi bật</div>}
                                    <h3 className="text-2xl font-bold mb-2 text-white">{pkg.name}</h3>
                                    {pkg.tag && <p className="text-sm font-semibold text-yellow-400 mb-4">{pkg.tag}</p>}
                                    <div className="my-6">
                                        <p className="text-5xl font-bold mb-1">{pkg.price_vnd.toLocaleString('vi-VN')}đ</p>
                                    </div>
                                    <div className="space-y-3 w-full text-left bg-black/20 p-4 rounded-lg">
                                        <p className="flex justify-between items-center text-lg"><span className="flex items-center gap-2"><DiamondIcon className="w-5 h-5 text-gray-400"/>Gói chính:</span> <span className="font-bold">{pkg.credits_amount.toLocaleString()} 💎</span></p>
                                        <p className="flex justify-between items-center text-lg"><span className="flex items-center gap-2"><i className="ph-fill ph-gift text-yellow-400"></i>Thưởng:</span> <span className="font-bold text-yellow-400">+{pkg.bonus_credits.toLocaleString()} 💎</span></p>
                                        <hr className="border-white/10"/>
                                        <p className="flex justify-between items-center text-lg font-bold text-cyan-400"><span className="flex items-center gap-2"><i className="ph-fill ph-sparkle"></i>Tổng nhận:</span> <span className="neon-text-glow">{(pkg.credits_amount + pkg.bonus_credits).toLocaleString()} 💎</span></p>
                                    </div>
                                    <button onClick={() => handlePurchase(pkg.id)} className="themed-button-primary w-full mt-8 py-3 font-bold text-lg">
                                        Thanh toán
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                     <div className="mt-12 text-center text-gray-500 text-sm">
                        <p>Thanh toán an toàn qua <span className="font-bold">PayOS</span>. Giao dịch sẽ được xử lý trong vài phút.</p>
                        <p>Nếu có vấn đề, vui lòng <a onClick={() => setInfoModalKey('contact')} className="text-pink-400 hover:underline cursor-pointer">liên hệ hỗ trợ</a>.</p>
                    </div>
                </main>

                <CreatorFooter onInfoLinkClick={setInfoModalKey} />
                <InfoModal isOpen={!!infoModalKey} onClose={() => setInfoModalKey(null)} contentKey={infoModalKey} />
            </div>
        </>
    );
};

export default BuyCreditsPage;
