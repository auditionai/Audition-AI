
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
        <div className="fixed top-[64px] md:top-[80px] left-0 right-0 z-30 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 text-white h-8 flex items-center overflow-hidden shadow-md border-b border-yellow-400/30">
            <div className="marquee-container w-full flex items-center">
                <div className="marquee-content whitespace-nowrap font-bold text-xs md:text-sm flex items-center gap-8">
                    {[...Array(5)].map((_, i) => (
                        <span key={i} className="flex items-center gap-2">
                            <i className="ph-fill ph-fire text-yellow-300 animate-pulse"></i>
                            <span className="uppercase text-yellow-200 tracking-wide">[{promotion.title}]</span>
                            <span className="text-white">{promotion.description}</span>
                            <span className="bg-white text-red-600 px-1 rounded font-black">+{promotion.bonus_percentage}% KIM CƯƠNG</span>
                        </span>
                    ))}
                </div>
            </div>
            
            <style>{`
                .marquee-container {
                    overflow: hidden;
                }
                .marquee-content {
                    animation: marquee 30s linear infinite;
                }
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
            `}</style>
        </div>
    );
};

export default MarqueeBanner;
