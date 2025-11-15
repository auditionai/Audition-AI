import React, { createContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { translations } from '../locales';

export type Language = 'vi' | 'en';

interface LanguageContextType {
    language: Language;
    setLanguage: (language: Language) => void;
    // FIX: Changed return type to `any` to support arrays and other non-string translations.
    t: (key: string, replacements?: Record<string, string | number>) => any;
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

    // FIX: Updated `t` function logic to correctly handle non-string values like arrays.
    const t = useCallback((key: string, replacements?: Record<string, string | number>): any => {
        const langTranslations = translations[language];
        let translation = key.split('.').reduce((acc: any, k) => acc?.[k], langTranslations);

        if (translation === undefined) {
            // Fallback to English if key not found in current language
            const fallbackTranslations = translations['en'];
            translation = key.split('.').reduce((acc: any, k) => acc?.[k], fallbackTranslations);
        }
        
        if (translation === undefined) {
            console.warn(`Translation not found for key: ${key}`);
            return key;
        }

        if (typeof translation === 'string' && replacements) {
            let result = translation;
            Object.entries(replacements).forEach(([rKey, rValue]) => {
                result = result.replace(`{{${rKey}}}`, String(rValue));
            });
            return result;
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