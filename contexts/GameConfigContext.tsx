import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Rank, CosmeticItem } from '../types';
import { RANKS as DEFAULT_RANKS } from '../constants/ranks';
import { ALL_COSMETICS as DEFAULT_COSMETICS } from '../constants/cosmetics';
import { useTranslation } from '../hooks/useTranslation';

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
    const { t } = useTranslation();

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
                    // Create a map of DB items for faster lookup by ID
                    const dbMapById = new Map<string, any>(data.cosmetics.map((c: any) => [c.id, c]));
                    
                    // Merge Default Items with DB overrides
                    const mergedDefaultCosmetics = DEFAULT_COSMETICS.map(defaultItem => {
                        // Match by ID first. This is the primary and most reliable method.
                        let dbItem = dbMapById.get(defaultItem.id);

                        if (dbItem) {
                            // Remove from map to track what's left (custom items)
                            dbMapById.delete(dbItem.id);
                            
                            return {
                                ...defaultItem, // Keep defaults like nameKey, id, type
                                ...dbItem,      // Override with DB values (iconUrl, unlockLevel, etc.)
                                id: defaultItem.id, // KEEP the legacy ID so user profiles don't break
                                nameKey: defaultItem.nameKey, // Ensure nameKey persists
                                cssClass: dbItem.cssClass || defaultItem.cssClass, 
                                imageUrl: dbItem.imageUrl || defaultItem.imageUrl,
                                iconUrl: dbItem.iconUrl || defaultItem.iconUrl
                            };
                        }
                        return defaultItem;
                    });

                    // Add remaining custom items from DB (those that didn't match any default item)
                    const customItems = Array.from(dbMapById.values()).map((dbItem: any) => {
                        let nameKey: string | null = null;
                        // Heuristic: If the name from the DB looks like a translation key, treat it as such.
                        if (dbItem.name && dbItem.name.includes('.') && dbItem.name.toUpperCase() === dbItem.name) {
                            nameKey = dbItem.name.toLowerCase();
                        }
                        return {
                            ...dbItem,
                            nameKey: nameKey,
                        };
                    });

                    const allCosmetics = [...mergedDefaultCosmetics, ...customItems];

                    const finalFrames = allCosmetics.filter((c: CosmeticItem) => c.type === 'frame');
                    const finalTitles = allCosmetics.filter((c: CosmeticItem) => c.type === 'title');
                    
                    setFrames(finalFrames);
                    setTitles(finalTitles);
                }
            }
        } catch (error) {
            console.error("Failed to load game config, using defaults", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Reload config when language changes to ensure name matching works
    useEffect(() => {
        refreshConfig();
    }, [t]);

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