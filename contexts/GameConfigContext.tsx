
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Rank, CosmeticItem } from '../types';
import { RANKS as DEFAULT_RANKS } from '../constants/ranks';
import { ALL_COSMETICS as DEFAULT_COSMETICS } from '../constants/cosmetics';

interface GameConfigContextType {
    ranks: Rank[];
    frames: CosmeticItem[];
    titles: CosmeticItem[];
    isLoading: boolean;
    refreshConfig: () => Promise<void>;
    getRankForLevel: (level: number) => Rank;
    getCosmeticById: (id: string | undefined, type: 'frame' | 'title') => CosmeticItem | undefined;
}

const GameConfigContext = createContext<GameConfigContextType | undefined>(undefined);

export const GameConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [ranks, setRanks] = useState<Rank[]>(DEFAULT_RANKS);
    const [frames, setFrames] = useState<CosmeticItem[]>(DEFAULT_COSMETICS.filter(c => c.type === 'frame'));
    const [titles, setTitles] = useState<CosmeticItem[]>(DEFAULT_COSMETICS.filter(c => c.type === 'title'));
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

                // 2. Process Cosmetics (Merge with Defaults to keep nameKeys)
                if (data.cosmetics) {
                    const processedCosmetics = data.cosmetics.map((dbItem: CosmeticItem) => {
                        // Find corresponding default item to restore translation keys (nameKey)
                        // This fixes the issue where default titles disappear or show raw names
                        const defaultItem = DEFAULT_COSMETICS.find(c => c.id === dbItem.id);
                        return {
                            ...dbItem,
                            nameKey: defaultItem?.nameKey || dbItem.nameKey, // Restore nameKey if available
                            cssClass: dbItem.cssClass || defaultItem?.cssClass || '' // Restore default CSS if not overridden
                        };
                    });

                    const dbFrames = processedCosmetics.filter((c: CosmeticItem) => c.type === 'frame');
                    const dbTitles = processedCosmetics.filter((c: CosmeticItem) => c.type === 'title');
                    
                    // Update state, defaulting to constants if DB is empty to prevent empty UI
                    if (dbFrames.length > 0) setFrames(dbFrames);
                    if (dbTitles.length > 0) setTitles(dbTitles);
                }
            }
        } catch (error) {
            console.error("Failed to load game config, using defaults", error);
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

    const getCosmeticById = (id: string | undefined, type: 'frame' | 'title'): CosmeticItem | undefined => {
        const list = type === 'frame' ? frames : titles;
        const found = list.find(item => item.id === id);
        if (!found) {
             if (type === 'frame') return list.find(i => i.id === 'default') || list[0];
             if (type === 'title') return list.find(i => i.id === 'newbie') || list[0];
        }
        return found;
    };

    return (
        <GameConfigContext.Provider value={{ ranks, frames, titles, isLoading, refreshConfig, getRankForLevel, getCosmeticById }}>
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
