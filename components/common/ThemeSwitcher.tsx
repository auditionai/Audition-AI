import React, { useState, useRef, useEffect } from 'react';
import { useTheme, THEMES } from '../../contexts/ThemeContext';

const ThemeSwitcher: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="p-3 rounded-full bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition-colors"
                aria-label="Chọn giao diện"
            >
                <i className="ph-fill ph-paint-brush text-2xl"></i>
            </button>
            {isOpen && (
                <div className="absolute bottom-full mb-3 right-0 w-60 bg-skin-fill-modal border border-skin-border rounded-lg shadow-lg z-50 p-2 animate-fade-in-up">
                    <p className="text-sm font-semibold text-skin-base px-2 pb-2">Chọn Giao Diện</p>
                    <div className="space-y-1">
                        {THEMES.map(themeOption => (
                            <button
                                key={themeOption.id}
                                onClick={() => {
                                    setTheme(themeOption.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left flex items-center gap-3 px-2 py-1.5 rounded-md text-sm transition-colors ${theme === themeOption.id ? 'bg-skin-accent/20 text-skin-base' : 'text-skin-muted hover:bg-white/10'}`}
                            >
                                <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: themeOption.color }}></span>
                                <span>{themeOption.name}</span>
                                {theme === themeOption.id && <i className="ph-fill ph-check ml-auto text-skin-accent"></i>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ThemeSwitcher;
