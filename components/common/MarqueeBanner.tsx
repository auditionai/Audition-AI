
import React, { useState, useEffect } from 'react';
import { Promotion } from '../../types';

const MarqueeBanner: React.FC = () => {
    const [promotion, setPromotion] = useState<Promotion | null>(null);

    useEffect(() => {
        const fetchPromo = async () => {
            try {
                // Add cache busting timestamp
                const res = await fetch(`/.netlify/functions/get-active-promotion?t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.id) {
                        setPromotion(data);
                    } else {
                        setPromotion(null);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch promotion");
            }
        };
        
        fetchPromo();
        // Poll every minute to check if promo started/ended
        const interval = setInterval(fetchPromo, 60000);
        return () => clearInterval(interval);
    }, []);

    if (!promotion) return null;

    return (
        <div className="w-full max-w-2xl mx-auto mb-4 px-4 animate-fade-in-down z-30 relative mt-2 pointer-events-none">
            <div className="marquee-modern-container h-9 flex items-center relative pr-4 pointer-events-auto">
                
                {/* Icon Circle */}
                <div className="absolute left-1 top-1 bottom-1 w-7 h-7 rounded-full marquee-modern-icon flex items-center justify-center z-20">
                    <i className="ph-fill ph-bell-ringing text-white text-xs animate-swing"></i>
                </div>

                {/* Scrolling Content */}
                <div className="marquee-content-mask w-full flex items-center pl-10 h-full overflow-hidden">
                    <div className="marquee-content whitespace-nowrap font-semibold text-xs flex items-center gap-8 text-gray-200">
                        {[...Array(4)].map((_, i) => (
                            <span key={i} className="flex items-center gap-2">
                                <span className="text-red-400 font-bold uppercase">{promotion.title}</span>
                                <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                <span>{promotion.description}</span>
                                <span className="bg-red-500/20 text-red-300 border border-red-500/50 px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold">+{promotion.bonus_percentage}% KC</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            
            <style>{`
                .marquee-content-mask {
                    mask-image: linear-gradient(to right, transparent, black 10px, black 90%, transparent);
                    -webkit-mask-image: linear-gradient(to right, transparent, black 10px, black 90%, transparent);
                }
                .marquee-content {
                    animation: marquee-slow 25s linear infinite;
                }
                @keyframes marquee-slow {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                @keyframes swing {
                    0%, 100% { transform: rotate(-15deg); }
                    50% { transform: rotate(15deg); }
                }
                .animate-swing {
                    animation: swing 2s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
};

export default MarqueeBanner;
