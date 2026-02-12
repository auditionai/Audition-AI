
import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';

// Cập nhật type và mảng THEMES để khớp với CSS
export type Theme = 'liquid-glass' | 'cyber-punk' | 'solar-flare' | 'dreamy-galaxy' | 'classic-dark' | 'neon-vibe';

export interface ThemeOption {
    id: Theme;
    name: string;
    icon: string;
}

export const THEMES: ThemeOption[] = [
    // NEW: IOS 26 Liquid Glass Style
    { id: 'liquid-glass', name: 'themes.liquid-glass', icon: 'ph-drop-half-bottom' },
    
    // Temporarily hidden as requested
    // { id: 'cyber-punk', name: 'themes.cyber-punk', icon: 'ph-skull' },
    // { id: 'solar-flare', name: 'themes.solar-flare', icon: 'ph-sun' },
    // { id: 'classic-dark', name: 'themes.classic-dark', icon: 'ph-tree' },
    // { id: 'dreamy-galaxy', name: 'themes.dreamy-galaxy', icon: 'ph-planet' },
    // { id: 'neon-vibe', name: 'themes.neon-vibe', icon: 'ph-diamond' },
];

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        // Force Liquid Glass for now as others are hidden
        return 'liquid-glass';
        
        /* Legacy Logic retained for rollback
        const storedTheme = localStorage.getItem('app-theme') as Theme;
        if (THEMES.find(t => t.id === storedTheme)) {
            return storedTheme;
        }
        const sessionTheme = sessionStorage.getItem('session-theme') as Theme;
        if (THEMES.find(t => t.id === sessionTheme)) {
            return sessionTheme;
        }
        const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)].id;
        sessionStorage.setItem('session-theme', randomTheme);
        return randomTheme;
        */
    });

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem('app-theme', newTheme);
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
