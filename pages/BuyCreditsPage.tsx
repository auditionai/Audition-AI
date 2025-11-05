import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { CreditPackage } from '../types.ts';
import DiamondIcon from '../components/common/DiamondIcon.tsx';

interface BuyCreditsPageProps {
  onPackageSelect: (pkg: CreditPackage) => void; // This can be used for analytics or other parent actions
}

const BuyCreditsPage: React.FC<BuyCreditsPageProps> = ({ onPackageSelect }) => {
    const { session, showToast } = useAuth();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRedirecting, setIsRedirecting] = useState(false);

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                const response = await fetch('/.netlify/functions/credit-packages');
                if (!response.ok) throw new Error('Không thể tải các gói nạp.');
                const data = await response.json();
                setPackages(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchPackages();
    }, [showToast]);

    const handlePurchase = async (pkg: CreditPackage) => {
        if (!session) {
            showToast('Vui lòng đăng nhập để thực hiện giao dịch.', 'error');
            return;
        }

        setIsRedirecting(true);
        onPackageSelect(pkg);
        
        try {
            const response = await fetch('/.netlify/functions/create-payment-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ packageId: pkg.id }),
            });
            
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Không thể tạo link thanh toán.');
            }
            
            // Redirect user to PayOS checkout
            window.location.href = result.checkoutUrl;

        } catch (error: any) {
            showToast(error.message, 'error');
            setIsRedirecting(false);
        }
    };

    if (isLoading) {
        return <div className="text-center p-12 text-white">Đang tải các gói nạp...</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="text-center max-w-2xl mx-auto mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Nạp Kim Cương</h1>
                <p className="text-lg text-gray-400">Chọn một gói để tiếp tục hành trình sáng tạo của bạn. An toàn và nhanh chóng với PayOS.</p>
            </div>

            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {packages.map(pkg => (
                    <div
                        key={pkg.id}
                        className={`relative bg-[#12121A]/80 p-6 rounded-2xl border flex flex-col text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl interactive-3d ${pkg.is_best_value ? 'border-pink-500 shadow-pink-500/20' : 'border-white/10 hover:shadow-pink-500/20'}`}
                    >
                         {pkg.is_best_value && (
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-500 to-fuchsia-600 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                Phổ biến
                            </div>
                        )}
                        <h3 className="text-xl font-bold text-white mb-2">{pkg.name}</h3>
                        <p className="text-sm text-gray-400 min-h-[40px]">{pkg.description}</p>
                        
                        <div className="my-6">
                            <p className="text-4xl font-extrabold text-white">{pkg.price.toLocaleString('vi-VN')}đ</p>
                        </div>

                        <div className="space-y-2 text-left mb-6 text-gray-300">
                           <div className="flex items-center gap-2">
                                <i className="ph-fill ph-diamonds-four text-pink-400"></i>
                                <span>{pkg.credits_amount} Kim Cương</span>
                           </div>
                           {pkg.bonus_credits > 0 && (
                             <div className="flex items-center gap-2 text-green-400 font-semibold">
                                <i className="ph-fill ph-gift"></i>
                                <span>+ {pkg.bonus_credits} Kim Cương thưởng!</span>
                           </div>
                           )}
                        </div>

                        <button
                            onClick={() => handlePurchase(pkg)}
                            disabled={isRedirecting}
                            className={`w-full mt-auto py-3 font-bold rounded-lg transition-all duration-300 ${pkg.is_best_value ? 'bg-gradient-to-r from-[#F72585] to-[#CA27FF] text-white hover:opacity-90 shadow-lg shadow-[#F72585]/30' : 'bg-white/10 text-white hover:bg-white/20'} disabled:opacity-50`}
                        >
                            {isRedirecting ? 'Đang chuyển hướng...' : 'Chọn gói này'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default BuyCreditsPage;
