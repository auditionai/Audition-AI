import React from 'react';
import { useTheme, THEMES } from '../../contexts/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';

const ThemeSwitcher: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const { t } = useTranslation();

    return (
        <div className="flex items-center justify-center gap-2 p-1.5 bg-skin-fill-secondary rounded-full border border-skin-border shadow-md">
            {THEMES.map(themeOption => (
                <button
                    key={themeOption.id}
                    onClick={() => setTheme(themeOption.id)}
                    className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 transform
                        ${theme === themeOption.id 
                            ? 'bg-skin-accent text-skin-accent-text scale-110 shadow-accent' 
                            : 'bg-transparent text-skin-muted hover:bg-skin-fill hover:text-skin-base'
                        }`}
                    aria-label={`Switch to ${t(themeOption.name)} theme`}
                    title={t(themeOption.name)}
                >
                    <i className={`ph-fill ${themeOption.icon} text-xl`}></i>
                </button>
            ))}
        </div>
    );
};

export default ThemeSwitcher;