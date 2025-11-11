import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';

export type Theme = 'cyber-dance' | 'crystal-palace' | 'sweet-pastel' | 'magical-christmas' | 'dreamy-galaxy';

export const THEMES: { id: Theme; name: string; icon: string; }[] = [
    { id: 'cyber-dance', name: 'Vũ Điệu Neon', icon: 'ph-person-simple-run' },
    { id: 'crystal-palace', name: 'Lâu Đài Thủy Tinh', icon: 'ph-snowflake' },
    { id: 'sweet-pastel', name: 'Kẹo Ngọt Pastel', icon: 'ph-heart' },
    { id: 'magical-christmas', name: 'Giáng Sinh Diệu Kỳ', icon: 'ph-tree-evergreen' },
    { id: 'dreamy-galaxy', name: 'Dải Ngân Hà', icon: 'ph-sparkle' },
];

const getRandomTheme = (): Theme => {
    const availableThemes = THEMES.map(t => t.id);
    return availableThemes[Math.floor(Math.random() * availableThemes.length)];
}

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        try {
            // Use sessionStorage to keep the theme consistent within a tab, but random on new tabs/sessions.
            const savedTheme = sessionStorage.getItem('app-theme') as Theme;
            return THEMES.some(t => t.id === savedTheme) ? savedTheme : getRandomTheme();
        } catch (error) {
            return getRandomTheme();
        }
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            sessionStorage.setItem('app-theme', theme);
        } catch (error) {
            console.warn('Could not save theme to sessionStorage.');
        }
    }, [theme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    const value = useMemo(() => ({ theme, setTheme }), [theme]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
