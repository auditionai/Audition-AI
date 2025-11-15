import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const LanguageSwitcher: React.FC = () => {
    const { language, setLanguage } = useTranslation();

    return (
        <div className="flex items-center p-1 bg-skin-fill-secondary rounded-full border border-skin-border">
            <button
                onClick={() => setLanguage('vi')}
                className={`px-3 py-1 rounded-full text-sm font-bold transition-colors duration-300 ${language === 'vi' ? 'bg-skin-accent text-skin-accent-text' : 'text-skin-muted hover:text-skin-base'}`}
            >
                VI
            </button>
            <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-full text-sm font-bold transition-colors duration-300 ${language === 'en' ? 'bg-skin-accent text-skin-accent-text' : 'text-skin-muted hover:text-skin-base'}`}
            >
                EN
            </button>
        </div>
    );
};

export default LanguageSwitcher;