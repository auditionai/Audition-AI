import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';

export type Theme = 'default' | 'crystal-palace' | 'sweet-pastel' | 'magical-christmas' | 'dreamy-galaxy';

export const THEMES: { id: Theme; name: string; color: string; }[] = [
    { id: 'default', name: 'Mặc định', color: '#F72585' },
    { id: 'crystal-palace', name: 'Lâu Đài Thủy Tinh', color: '#63d4ff' },
    { id: 'sweet-pastel', name: 'Kẹo Ngọt Pastel', color: '#ffc2e2' },
    { id: 'magical-christmas', name: 'Giáng Sinh Diệu Kỳ', color: '#e53e3e' },
    { id: 'dreamy-galaxy', name: 'Dải Ngân Hà', color: '#a78bfa' },
];

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        try {
            const savedTheme = localStorage.getItem('app-theme') as Theme;
            return THEMES.some(t => t.id === savedTheme) ? savedTheme : 'default';
        } catch (error) {
            return 'default';
        }
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem('app-theme', theme);
        } catch (error) {
            console.warn('Could not save theme to localStorage.');
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
