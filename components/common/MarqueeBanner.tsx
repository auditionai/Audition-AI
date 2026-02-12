
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
        <div className="w-full max-w-4xl mx-auto mb-6 px-4 animate-fade-in-down z-30 relative mt-2">
            <div className="marquee-3d-wrapper h-10 flex items-center bg-black relative">
                
                {/* Fixed Label */}
                <div className="absolute left-0 top-0 bottom-0 bg-red-700 px-3 flex items-center justify-center z-10 shadow-[2px_0_10px_rgba(0,0,0,0.8)]">
                    <i className="ph-fill ph-speaker-high text-white animate-pulse"></i>
                </div>

                {/* Scrolling Content */}
                <div className="marquee-container w-full flex items-center pl-12 h-full">
                    <div className="marquee-content whitespace-nowrap font-bold text-xs flex items-center gap-12 text-red-100/90 font-mono tracking-widest">
                        {[...Array(3)].map((_, i) => (
                            <span key={i} className="flex items-center gap-3">
                                <span className="text-yellow-400">★ {promotion.title} ★</span>
                                <span>{promotion.description}</span>
                                <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px]">+{promotion.bonus_percentage}% KC</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            
            <style>{`
                .marquee-container {
                    overflow: hidden;
                    mask-image: linear-gradient(to right, transparent, black 20px, black 90%, transparent);
                    -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black 90%, transparent);
                }
                .marquee-content {
                    animation: marquee 20s linear infinite;
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
