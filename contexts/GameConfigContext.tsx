
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
    getBestCosmeticForLevel: (type: 'frame' | 'title', level: number) => CosmeticItem;
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
                    
                    // Create a map of DB items for lookup by Name (for legacy item matching)
                    // We normalize names to lower case for better matching
                    const dbMapByName = new Map<string, any>(data.cosmetics.map((c: any) => [c.name.toLowerCase().trim(), c]));

                    // Merge Default Items with DB overrides
                    const mergedDefaultCosmetics = DEFAULT_COSMETICS.map(defaultItem => {
                        // 1. Try to find by exact ID (if we ever migrate IDs)
                        let dbItem = dbMapById.get(defaultItem.id);
                        
                        // 2. If not found, try to find by Translated Name (This fixes the Icon issue for default items)
                        if (!dbItem && defaultItem.nameKey) {
                            const translatedName = t(defaultItem.nameKey).toLowerCase().trim();
                            dbItem = dbMapByName.get(translatedName);
                        }

                        if (dbItem) {
                            // Remove from map to track what's left (custom items) if matched by ID
                            if (dbMapById.has(dbItem.id)) dbMapById.delete(dbItem.id);
                            
                            return {
                                ...defaultItem, // Keep defaults like nameKey, id, type
                                ...dbItem,      // Override with DB values (iconUrl, unlockLevel, etc.)
                                id: defaultItem.id, // KEEP the legacy ID so user profiles don't break
                                nameKey: defaultItem.nameKey, // Ensure nameKey persists
                                cssClass: dbItem.cssClass || defaultItem.cssClass, 
                                imageUrl: dbItem.imageUrl || defaultItem.imageUrl,
                                iconUrl: dbItem.iconUrl || defaultItem.iconUrl // This will apply the uploaded icon
                            };
                        }
                        return defaultItem;
                    });

                    // Add remaining custom items from DB
                    const customItems = Array.from(dbMapById.values()).map((c: any) => ({
                        ...c,
                        nameKey: null // Custom items don't have translation keys
                    }));

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
        // Don't fallback here, let the component handle fallback logic based on level
        return found;
    };

    const getBestCosmeticForLevel = (type: 'frame' | 'title', level: number): CosmeticItem => {
        const list = type === 'frame' ? frames : titles;
        // Filter items that are unlocked at or below the user's level
        const unlocked = list.filter(c => (c.unlockCondition?.level || 0) <= level);
        
        // Sort by unlock level descending (highest first), then by rarity (mythic > common)
        const rarityWeight = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 };
        
        unlocked.sort((a, b) => {
            const levelDiff = (b.unlockCondition?.level || 0) - (a.unlockCondition?.level || 0);
            if (levelDiff !== 0) return levelDiff;
            return rarityWeight[b.rarity] - rarityWeight[a.rarity];
        });

        // Return the best one, or the very first default one if nothing found
        return unlocked[0] || list[0];
    };

    return (
        <GameConfigContext.Provider value={{ ranks, frames, titles, isLoading, refreshConfig, getRankForLevel, getCosmeticById, getBestCosmeticForLevel }}>
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
