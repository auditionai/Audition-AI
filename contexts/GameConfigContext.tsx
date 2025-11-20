
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
                if (data.ranks && data.ranks.length > 0) {
                    // Sort ranks by threshold desc for easier logic, but we store asc usually
                    setRanks(data.ranks.sort((a: Rank, b: Rank) => a.levelThreshold - b.levelThreshold));
                }
                if (data.cosmetics) {
                    const dbFrames = data.cosmetics.filter((c: any) => c.type === 'frame');
                    const dbTitles = data.cosmetics.filter((c: any) => c.type === 'title');
                    
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
        // Find the highest threshold less than or equal to level
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
        // Return default if not found
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
