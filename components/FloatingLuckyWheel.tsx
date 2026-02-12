
import React, { useState, useRef, useEffect } from 'react';
import LuckyWheelModal from './LuckyWheelModal';

const FloatingLuckyWheel: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    
    // Drag State
    const buttonRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 20, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    // --- Drag Logic ---
    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        const touch = e.touches[0];
        dragStart.current = { x: touch.clientX, y: touch.clientY };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStart.current.x;
            const dy = dragStart.current.y - e.clientY;
            
            setPosition(prev => ({
                x: Math.max(10, Math.min(window.innerWidth - 80, prev.x + dx)),
                y: Math.max(10, Math.min(window.innerHeight - 80, prev.y + dy))
            }));
            
            dragStart.current = { x: e.clientX, y: e.clientY };
        };

        const handleTouchMove = (e: TouchEvent) => {
             if (!isDragging) return;
             e.preventDefault();
             const touch = e.touches[0];
             const dx = touch.clientX - dragStart.current.x;
             const dy = dragStart.current.y - touch.clientY;
             
             setPosition(prev => ({
                 x: Math.max(10, Math.min(window.innerWidth - 80, prev.x + dx)),
                 y: Math.max(10, Math.min(window.innerHeight - 80, prev.y + dy))
             }));
             
             dragStart.current = { x: touch.clientX, y: touch.clientY };
        };

        const handleEnd = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging]);

    if (!isVisible) return null;

    return (
        <>
            <LuckyWheelModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
            
            <div
                ref={buttonRef}
                style={{ bottom: `${position.y}px`, left: `${position.x}px` }}
                className="fixed z-[89] touch-none group flex flex-col items-center gap-1"
            >
                {/* Close Button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsVisible(false);
                    }}
                    className="absolute -top-3 -right-3 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center shadow-md z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-500"
                    title="Tắt nút"
                >
                    <i className="ph-fill ph-x text-xs"></i>
                </button>

                {/* Main Floating Button */}
                <button
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!isDragging) setIsOpen(true);
                    }}
                    className="relative w-16 h-16 md:w-20 md:h-20 transition-transform duration-200 hover:scale-110 cursor-move active:cursor-grabbing"
                >
                    {/* Outer Glow Ring */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-spin-slow blur-md opacity-75"></div>
                    
                    {/* Inner Button */}
                    <div className="absolute inset-1 bg-[#1e1b25] rounded-full flex items-center justify-center border-2 border-yellow-400 shadow-[inset_0_0_10px_rgba(250,204,21,0.5)]">
                        <i className="ph-fill ph-spinner text-3xl md:text-4xl text-yellow-400 animate-[spin_10s_linear_infinite]"></i>
                        <div className="absolute inset-0 flex items-center justify-center">
                             <i className="ph-fill ph-star text-white text-xs md:text-sm absolute top-2"></i>
                        </div>
                    </div>
                    
                    {/* Badge */}
                    <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-white animate-bounce">
                        FREE
                    </div>
                </button>
                
                {/* Label */}
                <span className="text-xs font-bold text-white bg-black/60 px-2 py-1 rounded-full backdrop-blur-sm shadow-sm border border-white/10 pointer-events-none whitespace-nowrap">
                    Vòng Quay
                </span>
            </div>
        </>
    );
};

export default FloatingLuckyWheel;
