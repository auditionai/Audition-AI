import React, { createContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { translations } from '../locales';

export type Language = 'vi' | 'en';

interface LanguageContextType {
    language: Language;
    setLanguage: (language: Language) => void;
    t: (key: string, replacements?: Record<string, string | number>) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<Language>(() => {
        const storedLang = localStorage.getItem('app-language') as Language;
        return storedLang && ['vi', 'en'].includes(storedLang) ? storedLang : 'vi';
    });

    useEffect(() => {
        localStorage.setItem('app-language', language);
    }, [language]);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
    };

    const t = useCallback((key: string, replacements?: Record<string, string | number>): string => {
        const langTranslations = translations[language];
        let translation = key.split('.').reduce((acc: any, k) => acc?.[k], langTranslations);

        if (typeof translation !== 'string') {
            // Fallback to English if key not found in current language
            const fallbackTranslations = translations['en'];
            translation = key.split('.').reduce((acc: any, k) => acc?.[k], fallbackTranslations);

            if (typeof translation !== 'string') {
                console.warn(`Translation not found for key: ${key}`);
                return key;
            }
        }
        
        if (replacements) {
            Object.entries(replacements).forEach(([rKey, rValue]) => {
                translation = translation.replace(`{{${rKey}}}`, String(rValue));
            });
        }
        
        return translation;
    }, [language]);

    const value = useMemo(() => ({ language, setLanguage, t }), [language, t]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};