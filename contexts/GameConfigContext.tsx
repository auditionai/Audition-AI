
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Rank, CosmeticItem } from '../types';
import { RANKS as DEFAULT_RANKS } from '../constants/ranks';
import { ALL_COSMETICS as DEFAULT_COSMETICS } from '../constants/cosmetics';
import { translations } from '../locales'; // Import translations for reverse lookup

interface GameConfigContextType {
    ranks: Rank[];
    frames: CosmeticItem[];
    titles: CosmeticItem[];
    nameEffects: CosmeticItem[]; // NEW
    isLoading: boolean;
    refreshConfig: () => Promise<void>;
    getRankForLevel: (level: number) => Rank;
    getCosmeticById: (id: string | undefined, type: 'frame' | 'title' | 'name_effect') => CosmeticItem | undefined;
}

const GameConfigContext = createContext<GameConfigContextType | undefined>(undefined);

export const GameConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [ranks, setRanks] = useState<Rank[]>(DEFAULT_RANKS);
    const [frames, setFrames] = useState<CosmeticItem[]>([]);
    const [titles, setTitles] = useState<CosmeticItem[]>([]);
    const [nameEffects, setNameEffects] = useState<CosmeticItem[]>([]); 
    const [isLoading, setIsLoading] = useState(true);

    const refreshConfig = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/.netlify/functions/game-config');
            if (response.ok) {
                const data = await response.json();
                
                // 1. Process Ranks
                if (data.ranks && data.ranks.length > 0) {
                    setRanks(data.ranks.sort((a: Rank, b: Rank) => a.levelThreshold - b.levelThreshold));
                }

                // 2. Process Cosmetics (DB First Approach)
                if (data.cosmetics) {
                    // Helper: Map of Default Constants for "nameKey" lookup only
                    const defaultMap = new Map<string, CosmeticItem>();
                    DEFAULT_COSMETICS.forEach(item => defaultMap.set(item.id, item));

                    // Helper: Reverse Lookup Maps for Titles to fix key issues
                    const enTitles = (translations.en as any).cosmetics?.titles || {};
                    const viTitles = (translations.vi as any).cosmetics?.titles || {};
                    const titleKeyMap = new Map<string, string>();
                    
                    Object.entries(enTitles).forEach(([key, val]) => {
                        if (typeof val === 'string') titleKeyMap.set(val.toLowerCase().trim(), key);
                    });
                    Object.entries(viTitles).forEach(([key, val]) => {
                        if (typeof val === 'string') titleKeyMap.set(val.toLowerCase().trim(), key);
                    });

                    // 3. Build Final List strictly from DB Data
                    // We iterate ONLY over data.cosmetics. 
                    // We do NOT merge in missing items from DEFAULT_COSMETICS.
                    // This prevents duplicates and ensures DB is the single source of truth.
                    const allCosmetics = data.cosmetics.map((dbItem: any) => {
                        const defaultItem = defaultMap.get(dbItem.id);
                        
                        // Determine nameKey
                        let nameKey = defaultItem?.nameKey || null;

                        // If no nameKey from default, try to reverse lookup title name
                        if (!nameKey && dbItem.name && dbItem.type === 'title') {
                             const lowerName = dbItem.name.toLowerCase().trim();
                             if (titleKeyMap.has(lowerName)) {
                                 const key = titleKeyMap.get(lowerName);
                                 if (key) nameKey = `cosmetics.titles.${key}`;
                             } 
                             else {
                                 const cleanName = lowerName.replace('creator.cosmetics.titles.', '');
                                 const matchingKey = Object.keys(enTitles).find(k => k.toLowerCase() === cleanName);
                                 if (matchingKey) {
                                     nameKey = `cosmetics.titles.${matchingKey}`;
                                 }
                             }
                        }

                        // Construct Item. DB properties take absolute precedence.
                        return {
                            ...dbItem, // Contains id, type, name, rarity, price, cssClass, imageUrl, iconUrl, unlockCondition
                            nameKey: nameKey,
                            // Ensure these are populated if DB returns them, otherwise fallback to default item or null
                            cssClass: dbItem.cssClass || defaultItem?.cssClass, 
                            imageUrl: dbItem.imageUrl || defaultItem?.imageUrl,
                            iconUrl: dbItem.iconUrl || defaultItem?.iconUrl,
                        };
                    });

                    const finalFrames = allCosmetics.filter((c: CosmeticItem) => c.type === 'frame');
                    const finalTitles = allCosmetics.filter((c: CosmeticItem) => c.type === 'title');
                    const finalNameEffects = allCosmetics.filter((c: CosmeticItem) => c.type === 'name_effect');
                    
                    setFrames(finalFrames);
                    setTitles(finalTitles);
                    setNameEffects(finalNameEffects);
                }
            }
        } catch (error) {
            console.error("Failed to load game config, using defaults", error);
            // Fallback to defaults ONLY if API fails completely
            setFrames(DEFAULT_COSMETICS.filter(c => c.type === 'frame'));
            setTitles(DEFAULT_COSMETICS.filter(c => c.type === 'title'));
            setNameEffects(DEFAULT_COSMETICS.filter(c => c.type === 'name_effect'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshConfig();
    }, []);

    const getRankForLevel = (level: number): Rank => {
        let currentRank = ranks[0];
        for (const rank of ranks) {
            if (level >= rank.levelThreshold) {
                currentRank = rank;
            } else {
                break;
            }
        }
        return currentRank;
    };

    const getCosmeticById = (id: string | undefined, type: 'frame' | 'title' | 'name_effect'): CosmeticItem | undefined => {
        let list;
        if (type === 'frame') list = frames;
        else if (type === 'title') list = titles;
        else list = nameEffects;
        
        const found = list.find(item => item.id === id);
        return found;
    };

    return (
        <GameConfigContext.Provider value={{ ranks, frames, titles, nameEffects, isLoading, refreshConfig, getRankForLevel, getCosmeticById }}>
            {children}
        </GameConfigContext.Provider>
    );
};

export const useGameConfig = () => {
    const context = useContext(GameConfigContext);
    if (context === undefined) {
        throw new Error('useGameConfig must be used within a GameConfigProvider');
    }
    return context;
};
