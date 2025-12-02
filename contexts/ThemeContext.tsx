import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';

// Cập nhật type và mảng THEMES để khớp với CSS
export type Theme = 'cyber-punk' | 'solar-flare' | 'dreamy-galaxy' | 'classic-dark' | 'neon-vibe';

export interface ThemeOption {
    id: Theme;
    name: string;
    icon: string;
}

export const THEMES: ThemeOption[] = [
    { id: 'cyber-punk', name: 'themes.cyber-punk', icon: 'ph-skull' },
    { id: 'solar-flare', name: 'themes.solar-flare', icon: 'ph-sun' },
    { id: 'classic-dark', name: 'themes.classic-dark', icon: 'ph-tree' },
    { id: 'dreamy-galaxy', name: 'themes.dreamy-galaxy', icon: 'ph-planet' },
    { id: 'neon-vibe', name: 'themes.neon-vibe', icon: 'ph-diamond' },
];

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        // Ưu tiên theme đã lưu trong localStorage
        const storedTheme = localStorage.getItem('app-theme') as Theme;
        if (THEMES.find(t => t.id === storedTheme)) {
            return storedTheme;
        }

        // Nếu không có, kiểm tra sessionStorage (cho phiên truy cập hiện tại)
        const sessionTheme = sessionStorage.getItem('session-theme') as Theme;
        if (THEMES.find(t => t.id === sessionTheme)) {
            return sessionTheme;
        }

        // Nếu không có gì cả, random một theme mới cho phiên này
        const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)].id;
        sessionStorage.setItem('session-theme', randomTheme);
        return randomTheme;
    });

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        // Khi người dùng chọn thủ công, lưu vào localStorage để ghi nhớ lựa chọn
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