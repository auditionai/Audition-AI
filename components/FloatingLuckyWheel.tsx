import React, { useState, useRef, useEffect } from 'react';
import LuckyWheelModal from './LuckyWheelModal';

const FloatingLuckyWheel: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true); // Controls button visibility
    
    // Drag State
    const buttonRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 20, y: 100 }); // Default: Bottom-Left (offset from bottom)
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    // --- Drag Logic (Mouse) ---
    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
    };

    // --- Drag Logic (Touch) ---
    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        const touch = e.touches[0];
        dragStart.current = { x: touch.clientX, y: touch.clientY };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStart.current.x; // Normal logic for left-aligned
            const dy = dragStart.current.y - e.clientY; // Inverted for bottom-aligned
            
            setPosition(prev => ({
                x: Math.max(10, Math.min(window.innerWidth - 70, prev.x + dx)),
                y: Math.max(10, Math.min(window.innerHeight - 70, prev.y + dy))
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
                 x: Math.max(10, Math.min(window.innerWidth - 70, prev.x + dx)),
                 y: Math.max(10, Math.min(window.innerHeight - 70, prev.y + dy))
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
                className="fixed z-[89] touch-none group"
            >
                {/* Close Button (Small X) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsVisible(false);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:scale-110"
                    title="Tắt nút (Tải lại trang để hiện lại)"
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
                    className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.6)] transition-transform duration-200 hover:scale-110 cursor-move active:cursor-grabbing bg-gradient-to-br from-yellow-400 to-orange-500 border-2 border-white/20 backdrop-blur-md animate-bounce-slow"
                >
                    <i className="ph-fill ph-spinner text-white text-3xl animate-spin-slow"></i>
                </button>
            </div>
        </>
    );
};

export default FloatingLuckyWheel;