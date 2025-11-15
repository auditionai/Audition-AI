import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const LanguageSwitcher: React.FC = () => {
    const { language, setLanguage } = useTranslation();

    return (
        <div className="relative flex items-center p-1 bg-skin-fill-secondary rounded-full border border-skin-border">
            <span
                className="absolute top-1 h-7 w-9 rounded-full bg-skin-accent transition-transform duration-300 ease-in-out"
                style={{
                    transform: language === 'vi' ? 'translateX(2px)' : 'translateX(calc(100% + 6px))'
                }}
            />
            <button
                onClick={() => setLanguage('vi')}
                className={`relative z-10 px-3 py-1 rounded-full text-sm font-bold transition-colors duration-300 ${language === 'vi' ? 'text-skin-accent-text' : 'text-skin-muted hover:text-skin-base'}`}
            >
                VI
            </button>
            <button
                onClick={() => setLanguage('en')}
                className={`relative z-10 px-3 py-1 rounded-full text-sm font-bold transition-colors duration-300 ${language === 'en' ? 'text-skin-accent-text' : 'text-skin-muted hover:text-skin-base'}`}
            >
                EN
            </button>
        </div>
    );
};

export default LanguageSwitcher;
